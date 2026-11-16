package community

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

func (s *Service) SetCommunityReaction(ctx context.Context, actor Actor, postID uint64, kind string, active bool) (*CommunityReactionState, error) {
	if kind != "like" && kind != "bookmark" {
		return nil, badRequest("互动类型不合法")
	}
	if actor.ID == 0 {
		return nil, forbidden("请先登录后参与互动")
	}
	now := s.now().UTC()
	state := &CommunityReactionState{Active: active}
	var count int64
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
		if active {
			reaction := model.CommunityPostReaction{QuestionID: postID, UserID: actor.ID, Kind: kind, CreatedAt: now}
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reaction)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && kind == "like" && actor.ID != question.AskerID {
				if err := recordCommunityXP(tx, question.AskerID, &actor.ID, communityXPPostLike, postID, postID,
					fmt.Sprintf("post_like:%d:%d", postID, actor.ID), 1, now); err != nil {
					return err
				}
			}
		} else {
			result := tx.Where("question_id = ? AND user_id = ? AND kind = ?", postID, actor.ID, kind).Delete(&model.CommunityPostReaction{})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && kind == "like" && actor.ID != question.AskerID {
				if err := revokeCommunityXP(tx, fmt.Sprintf("post_like:%d:%d", postID, actor.ID), now); err != nil {
					return err
				}
			}
		}
		return tx.Model(&model.CommunityPostReaction{}).Where("question_id = ? AND kind = ?", postID, "like").Count(&count).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("帖子不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存社区互动失败", err)
	}
	state.LikeCount = int(count)
	return state, nil
}

func (s *Service) SetCommunityCommentReaction(ctx context.Context, actor Actor, commentID uint64, active bool) (*CommunityCommentReactionState, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后参与互动")
	}
	now := s.now().UTC()
	state := &CommunityCommentReactionState{Active: active}
	var count int64
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var comment model.TrainingQuestionPost
		if err := tx.First(&comment, commentID).Error; err != nil {
			return err
		}
		var question model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, comment.QuestionID).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&comment, commentID).Error; err != nil {
			return err
		}
		if comment.DeletedAt != nil || question.DeletedAt != nil || question.IsHidden {
			return notFound("回复不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if active {
			reaction := model.CommunityCommentReaction{CommentID: commentID, UserID: actor.ID, CreatedAt: now}
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reaction)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && actor.ID != comment.AuthorID {
				if err := recordCommunityXP(tx, comment.AuthorID, &actor.ID, communityXPCommentLike, commentID, question.ID,
					fmt.Sprintf("comment_like:%d:%d", commentID, actor.ID), 1, now); err != nil {
					return err
				}
			}
		} else {
			result := tx.Where("comment_id = ? AND user_id = ?", commentID, actor.ID).Delete(&model.CommunityCommentReaction{})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && actor.ID != comment.AuthorID {
				if err := revokeCommunityXP(tx, fmt.Sprintf("comment_like:%d:%d", commentID, actor.ID), now); err != nil {
					return err
				}
			}
		}
		return tx.Model(&model.CommunityCommentReaction{}).Where("comment_id = ?", commentID).Count(&count).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存回复点赞失败", err)
	}
	state.LikeCount = int(count)
	return state, nil
}
