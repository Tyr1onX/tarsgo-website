package community

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

func (s *Service) ModerateCommunityPost(ctx context.Context, actor Actor, postID uint64, update CommunityModerationUpdate) (*CommunityPostDetail, error) {
	if !isCommunityAdmin(actor) {
		return nil, forbidden("当前账号无社区管理权限")
	}
	if update.Pinned == nil && update.Hidden == nil {
		return nil, badRequest("请至少指定一项管理状态")
	}
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	updates := map[string]any{"updated_at": s.now().UTC()}
	if update.Pinned != nil {
		updates["is_pinned"] = *update.Pinned
	}
	if update.Hidden != nil {
		updates["is_hidden"] = *update.Hidden
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var locked model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, postID).Error; err != nil {
			return err
		}
		if locked.DeletedAt != nil {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Model(&locked).Updates(updates).Error; err != nil {
			return err
		}
		if update.Hidden != nil && *update.Hidden {
			return revokeCommunityQuestionXP(tx, postID, s.now())
		}
		return nil
	}); err != nil {
		return nil, internalError("更新社区管理状态失败", err)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}

// SetCommunityPostFeatured changes the independent editorial feature state.
// It intentionally does not modify pinning or any community ordering fields.
func (s *Service) SetCommunityPostFeatured(ctx context.Context, actor Actor, postID uint64, featured bool) error {
	if actor.ID == 0 || actor.RoleName != model.RoleNameSuperAdmin {
		return forbidden("仅超级管理员可管理社区精华")
	}
	if postID == 0 {
		return badRequest("帖子编号不合法")
	}
	return s.setCommunityFeatured(ctx, func(tx *gorm.DB) error {
		var post model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Select("id, is_featured").
			Where("id = ? AND deleted_at IS NULL AND visibility = ? AND category IN ?", postID, model.TrainingQuestionPublic, communityFeatureCategories()).
			Take(&post).Error; err != nil {
			return err
		}
		if post.IsFeatured == featured {
			return nil
		}
		return tx.Model(&post).Update("is_featured", featured).Error
	})
}

// SetCommunityReplyFeatured applies the same service-side authorization and
// audit-backed route to an individual reply, without changing its parent post.
func (s *Service) SetCommunityReplyFeatured(ctx context.Context, actor Actor, replyID uint64, featured bool) error {
	if actor.ID == 0 || actor.RoleName != model.RoleNameSuperAdmin {
		return forbidden("仅超级管理员可管理社区精华")
	}
	if replyID == 0 {
		return badRequest("回复编号不合法")
	}
	return s.setCommunityFeatured(ctx, func(tx *gorm.DB) error {
		var reply model.TrainingQuestionPost
		if err := tx.Table("training_question_posts AS cp").
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Select("cp.id, cp.is_featured").
			Joins("JOIN training_questions AS q ON q.id = cp.question_id").
			Where("cp.id = ? AND cp.deleted_at IS NULL AND q.deleted_at IS NULL AND q.visibility = ? AND q.category IN ?", replyID, model.TrainingQuestionPublic, communityFeatureCategories()).
			Take(&reply).Error; err != nil {
			return err
		}
		if reply.IsFeatured == featured {
			return nil
		}
		return tx.Model(&reply).Update("is_featured", featured).Error
	})
}

func (s *Service) setCommunityFeatured(ctx context.Context, update func(*gorm.DB) error) error {
	err := s.db.WithContext(ctx).Transaction(update)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return notFound("社区内容不存在")
	}
	if err != nil {
		return internalError("更新社区精华状态失败", err)
	}
	return nil
}

func communityFeatureCategories() []string {
	return []string{model.CommunityCategoryTechnology, model.CommunityCategoryProject, model.CommunityCategoryExperience, model.CommunityCategoryTeam}
}

// SetCommunitySolution records an explicitly accepted community reply. Older
// group Q&A keeps its separate resolved state because it has no accepted-reply
// pointer and must not guess which answer earned the reward.
func (s *Service) SetCommunitySolution(ctx context.Context, actor Actor, postID uint64, update CommunitySolutionUpdate) (*CommunityPostDetail, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后采纳解决方案")
	}
	now := s.now().UTC()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var question model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, postID).Error; err != nil {
			return err
		}
		if question.DeletedAt != nil || question.IsHidden {
			return notFound("帖子不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if question.GroupID != nil || question.Visibility != model.TrainingQuestionPublic {
			return badRequest("仅支持在公开社区帖子中采纳解决方案")
		}
		if question.AskerID != actor.ID && actor.RoleName != model.RoleNameSuperAdmin {
			return forbidden("只有帖子作者或超级管理员可以管理最佳答案")
		}
		if update.CommentID == nil {
			if question.AcceptedSolutionID == nil {
				return nil
			}
			acceptedID := *question.AcceptedSolutionID
			if err := revokeCommunityXP(tx, fmt.Sprintf("solution:%d:%d", postID, acceptedID), now); err != nil {
				return err
			}
			return tx.Model(&question).Updates(map[string]any{
				"accepted_solution_id": nil, "is_solved": false, "solved_by": nil, "solved_at": nil, "updated_at": now,
			}).Error
		}
		var answer model.TrainingQuestionPost
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND question_id = ? AND deleted_at IS NULL", *update.CommentID, postID).Take(&answer).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return badRequest("采纳的回复不存在")
			}
			return err
		}
		if answer.AuthorID == question.AskerID || answer.AuthorID == actor.ID {
			return badRequest("不能采纳自己的回复")
		}
		if question.AcceptedSolutionID != nil && *question.AcceptedSolutionID == answer.ID {
			return nil
		}
		if question.AcceptedSolutionID != nil {
			previousID := *question.AcceptedSolutionID
			if err := revokeCommunityXP(tx, fmt.Sprintf("solution:%d:%d", postID, previousID), now); err != nil {
				return err
			}
		}
		if err := recordCommunityXP(tx, answer.AuthorID, &actor.ID, communityXPSolution, answer.ID, postID,
			fmt.Sprintf("solution:%d:%d", postID, answer.ID), 10, now); err != nil {
			return err
		}
		return tx.Model(&question).Updates(map[string]any{
			"accepted_solution_id": answer.ID, "is_solved": true, "solved_by": actor.ID, "solved_at": now, "updated_at": now,
		}).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("帖子不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新解决方案失败", err)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}
