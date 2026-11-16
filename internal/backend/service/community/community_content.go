package community

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
	"tarsgo-backend/model"
	"time"
	"unicode/utf8"
)

func (s *Service) CreateCommunityPost(ctx context.Context, actor Actor, input CommunityPostInput) (*CommunityPostDetail, error) {
	category := strings.TrimSpace(input.Category)
	title, body := strings.TrimSpace(input.Title), strings.TrimSpace(input.Body)
	if actor.ID == 0 {
		return nil, forbidden("请先登录后发布内容")
	}
	if !IsCommunityCategory(category) || title == "" || utf8.RuneCountInString(title) > 160 || body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("帖子标题、正文或分类不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	question := model.TrainingQuestion{
		GroupID: nil, AskerID: actor.ID, Title: title, Body: body,
		Category: category, Visibility: model.TrainingQuestionPublic,
	}
	var stored []*storedQuestionFile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Serialize this member's daily reward check before any consistent reads.
		if err := lockCommunityXPAwardUser(tx, actor.ID); err != nil {
			return err
		}
		if err := tx.Create(&question).Error; err != nil {
			return err
		}
		if err := grantCommunityContributionXP(tx, actor.ID, communityXPPost, question.ID, question.ID,
			fmt.Sprintf("post:%d", question.ID), s.now()); err != nil {
			return err
		}
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, 0, question.ID, nil, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			if errors.Is(err, errQuestionFileTooLarge) {
				return badRequest("单张图片不能超过 10 MB")
			}
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		if finalBody != question.Body {
			question.Body = finalBody
			if err := tx.Model(&question).Update("body", finalBody).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("发布社区帖子失败", err)
	}
	return s.GetCommunityPost(ctx, actor, question.ID)
}

func (s *Service) UpdateCommunityPost(ctx context.Context, actor Actor, postID uint64, input CommunityPostUpdate) (*CommunityPostDetail, error) {
	category, title, body := strings.TrimSpace(input.Category), strings.TrimSpace(input.Title), strings.TrimSpace(input.Body)
	if !IsCommunityCategory(category) || title == "" || utf8.RuneCountInString(title) > 160 || body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("帖子标题、正文或分类不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if question.AskerID != actor.ID || question.DeletedAt != nil {
		return nil, forbidden("只能编辑自己的帖子")
	}
	now := s.now().UTC()
	var stored []*storedQuestionFile
	var removed []string
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, postID).Error; err != nil {
			return err
		}
		if current.DeletedAt != nil || current.AskerID != actor.ID {
			return forbidden("只能编辑自己的帖子")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &current); err != nil {
			return err
		}
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, communityGroupID(current.GroupID), postID, nil, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		removed, err = removeDeletedInlineAttachments(tx, postID, nil, current.Body, finalBody)
		if err != nil {
			return err
		}
		return tx.Model(&current).Updates(map[string]any{"category": category, "title": title, "body": finalBody, "edited_at": now, "updated_at": now}).Error
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("编辑社区帖子失败", err)
	}
	for _, path := range removed {
		s.files.remove(path)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}

func (s *Service) DeleteCommunityPost(ctx context.Context, actor Actor, postID uint64) error {
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return err
	}
	if question.AskerID != actor.ID || question.DeletedAt != nil {
		return forbidden("只能删除自己的帖子")
	}
	now := s.now().UTC()
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.TrainingQuestion{}).
			Where("id = ? AND asker_id = ? AND deleted_at IS NULL", postID, actor.ID).
			Updates(map[string]any{"deleted_at": now, "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return revokeCommunityQuestionXP(tx, postID, now)
	}); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return notFound("帖子不存在")
		}
		return internalError("删除社区帖子失败", err)
	}
	return nil
}

func (s *Service) AddCommunityComment(ctx context.Context, actor Actor, postID uint64, input CommunityCommentInput) (*CommunityPostDetail, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("回复内容不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	var stored []*storedQuestionFile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the contributor before reads so two comments on different posts
		// cannot both pass the same daily XP quota concurrently.
		if err := lockCommunityXPAwardUser(tx, actor.ID); err != nil {
			return err
		}
		var question model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, postID).Error; err != nil {
			return err
		}
		if question.DeletedAt != nil {
			return notFound("帖子不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if !s.canCommunityComment(ctx, tx, actor, &question) {
			return forbidden("当前账号不能参与这条讨论")
		}
		if input.ParentPostID != nil {
			var parent model.TrainingQuestionPost
			if err := tx.Where("id = ? AND question_id = ? AND deleted_at IS NULL", *input.ParentPostID, postID).Take(&parent).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return badRequest("回复目标不存在")
				}
				return err
			}
		}
		comment := model.TrainingQuestionPost{QuestionID: postID, ParentPostID: input.ParentPostID, AuthorID: actor.ID, Kind: model.TrainingQuestionComment, Body: body}
		if err := tx.Create(&comment).Error; err != nil {
			return err
		}
		if question.GroupID == nil && question.Visibility == model.TrainingQuestionPublic {
			if err := grantCommunityContributionXP(tx, actor.ID, communityXPComment, comment.ID, question.ID,
				fmt.Sprintf("comment:%d", comment.ID), s.now()); err != nil {
				return err
			}
		}
		if actor.ID != question.AskerID && !question.IsHidden {
			if err := recordCommunityXP(tx, question.AskerID, &actor.ID, communityXPReply, comment.ID, question.ID,
				fmt.Sprintf("reply:%d", comment.ID), 1, s.now()); err != nil {
				return err
			}
		}
		now := s.now().UTC()
		if err := tx.Model(&question).Updates(map[string]any{"last_reply_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		commentID := comment.ID
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, communityGroupID(question.GroupID), question.ID, &commentID, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		if finalBody != comment.Body {
			if err := tx.Model(&comment).Update("body", finalBody).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("帖子不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("发布社区回复失败", err)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}

func (s *Service) UpdateCommunityCommentContent(ctx context.Context, actor Actor, commentID uint64, input CommunityCommentUpdate) (*CommunityPostDetail, error) {
	body := input.Body
	body = strings.TrimSpace(body)
	if body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("回复内容不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	var comment model.TrainingQuestionPost
	if err := s.db.WithContext(ctx).First(&comment, commentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		return nil, internalError("读取社区回复失败", err)
	}
	question, err := s.loadQuestion(ctx, comment.QuestionID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if comment.AuthorID != actor.ID || comment.DeletedAt != nil || question.DeletedAt != nil {
		return nil, forbidden("只能编辑自己的回复")
	}
	var stored []*storedQuestionFile
	var removed []string
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.TrainingQuestionPost
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, commentID).Error; err != nil {
			return err
		}
		if current.AuthorID != actor.ID || current.DeletedAt != nil {
			return forbidden("只能编辑自己的回复")
		}
		var currentQuestion model.TrainingQuestion
		if err := tx.First(&currentQuestion, current.QuestionID).Error; err != nil {
			return err
		}
		if currentQuestion.DeletedAt != nil {
			return notFound("帖子不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &currentQuestion); err != nil {
			return err
		}
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, communityGroupID(currentQuestion.GroupID), current.QuestionID, &current.ID, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		removed, err = removeDeletedInlineAttachments(tx, current.QuestionID, &current.ID, current.Body, finalBody)
		if err != nil {
			return err
		}
		return tx.Model(&current).Updates(map[string]any{"body": finalBody, "edited_at": s.now().UTC()}).Error
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("编辑社区回复失败", err)
	}
	for _, path := range removed {
		s.files.remove(path)
	}
	return s.GetCommunityPost(ctx, actor, question.ID)
}

func (s *Service) DeleteCommunityComment(ctx context.Context, actor Actor, commentID uint64) (*CommunityPostDetail, error) {
	var comment model.TrainingQuestionPost
	if err := s.db.WithContext(ctx).First(&comment, commentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		return nil, internalError("读取社区回复失败", err)
	}
	question, err := s.loadQuestion(ctx, comment.QuestionID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if comment.AuthorID != actor.ID || comment.DeletedAt != nil || question.DeletedAt != nil {
		return nil, forbidden("只能删除自己的回复")
	}
	now := s.now().UTC()
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var lockedQuestion model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedQuestion, question.ID).Error; err != nil {
			return err
		}
		var lockedComment model.TrainingQuestionPost
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedComment, commentID).Error; err != nil {
			return err
		}
		if lockedComment.AuthorID != actor.ID || lockedComment.DeletedAt != nil || lockedQuestion.DeletedAt != nil {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Model(&model.TrainingQuestionPost{}).
			Where("id = ? AND author_id = ? AND deleted_at IS NULL", commentID, actor.ID).
			Updates(map[string]any{"body": "", "deleted_at": now}).Error; err != nil {
			return err
		}
		if lockedQuestion.AcceptedSolutionID != nil && *lockedQuestion.AcceptedSolutionID == commentID {
			if err := revokeCommunityXP(tx, fmt.Sprintf("solution:%d:%d", question.ID, commentID), now); err != nil {
				return err
			}
			if err := tx.Model(&lockedQuestion).Updates(map[string]any{
				"accepted_solution_id": nil, "is_solved": false, "solved_by": nil, "solved_at": nil,
			}).Error; err != nil {
				return err
			}
		}
		if err := revokeCommunityCommentXP(tx, question.ID, commentID, now); err != nil {
			return err
		}
		if err := tx.Where("comment_id = ?", commentID).Delete(&model.CommunityCommentReaction{}).Error; err != nil {
			return err
		}
		var latest *time.Time
		if err := tx.Model(&model.TrainingQuestionPost{}).
			Where("question_id = ? AND deleted_at IS NULL", question.ID).
			Select("MAX(created_at)").Scan(&latest).Error; err != nil {
			return err
		}
		return tx.Model(&model.TrainingQuestion{}).Where("id = ?", question.ID).
			Updates(map[string]any{"last_reply_at": latest, "updated_at": now}).Error
	}); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("删除社区回复失败", err)
	}
	return s.GetCommunityPost(ctx, actor, question.ID)
}
