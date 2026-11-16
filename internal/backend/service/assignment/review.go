package assignment

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
	"tarsgo-backend/model"
	"unicode/utf8"
)

func (s *Service) Review(ctx context.Context, actor Actor, submissionID uint64, input ReviewInput) (*AdminAssignmentDetail, error) {
	return s.review(ctx, actor, submissionID, input, false)
}

// ReviewFirst keeps one-time Feishu card actions from adding duplicate history.
// Website administrators can still revise scores through the regular Review method.
func (s *Service) ReviewFirst(ctx context.Context, actor Actor, submissionID uint64, input ReviewInput) (*AdminAssignmentDetail, error) {
	return s.review(ctx, actor, submissionID, input, true)
}

func (s *Service) review(ctx context.Context, actor Actor, submissionID uint64, input ReviewInput, firstOnly bool) (*AdminAssignmentDetail, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	input.Decision = strings.TrimSpace(input.Decision)
	input.Comment = strings.TrimSpace(input.Comment)
	if input.Score > 100 || (input.Decision != model.AssignmentReviewPassed && input.Decision != model.AssignmentReviewNeedsRedo) || utf8.RuneCountInString(input.Comment) > 5000 {
		return nil, badRequest("评分、处理结果或评语不合法")
	}
	imageUploads, err := validateReviewImages(input.Comment, input.ImageFiles, input.UploadTokens)
	if err != nil {
		return nil, err
	}
	storedPaths := make([]string, 0, len(imageUploads))
	var assignmentID uint64
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var submission model.AssignmentSubmission
		if err := tx.First(&submission, submissionID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("提交记录不存在")
			}
			return err
		}
		var item model.Assignment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, submission.AssignmentID).Error; err != nil {
			return err
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		var latest model.AssignmentSubmission
		if err := tx.Where("assignment_id = ? AND user_id = ?", submission.AssignmentID, submission.UserID).
			Order("attempt DESC").First(&latest).Error; err != nil {
			return err
		}
		if latest.ID != submission.ID {
			return conflict("只能批改成员最近一次提交")
		}
		if firstOnly {
			var count int64
			if err := tx.Model(&model.AssignmentReview{}).Where("submission_id = ?", submission.ID).Count(&count).Error; err != nil {
				return err
			}
			if count != 0 {
				return conflict("该提交已经完成批改")
			}
		}
		review := model.AssignmentReview{
			SubmissionID: submission.ID, ReviewerID: actor.ID, Score: input.Score,
			Decision: input.Decision, Comment: input.Comment, CreatedAt: storeUTCWall(s.now().UTC()),
		}
		if err := tx.Create(&review).Error; err != nil {
			return err
		}
		for _, upload := range imageUploads {
			stored, err := s.files.save(ctx, item.ID, actor.ID, upload.file, s.now(), false)
			if err != nil {
				return err
			}
			storedPaths = append(storedPaths, stored.storagePath)
			image := model.AssignmentReviewImage{
				ReviewID: review.ID, SubmissionID: submission.ID,
				FileName: stored.fileName, StoragePath: stored.storagePath,
				ContentType: stored.contentType, Size: stored.size,
			}
			if err := tx.Create(&image).Error; err != nil {
				return err
			}
			input.Comment = strings.ReplaceAll(input.Comment, "community-upload://"+upload.token,
				fmt.Sprintf("/api/assignment-review-images/%d", image.ID))
		}
		if len(imageUploads) != 0 {
			if err := tx.Model(&review).Update("comment", input.Comment).Error; err != nil {
				return err
			}
		}
		assignmentID = item.ID
		return nil
	})
	if err != nil {
		for _, path := range storedPaths {
			_ = s.files.remove(path)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存批改结果失败", err)
	}
	return s.GetAdmin(ctx, actor, assignmentID)
}
