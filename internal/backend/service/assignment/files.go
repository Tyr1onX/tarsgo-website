package assignment

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"mime/multipart"
	"tarsgo-backend/model"
)

func (s *Service) OpenFile(ctx context.Context, actor Actor, fileID uint64) (*Download, error) {
	var file model.AssignmentSubmissionFile
	if err := s.db.WithContext(ctx).First(&file, fileID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("附件不存在")
		}
		return nil, internalError("读取附件信息失败", err)
	}
	var submission model.AssignmentSubmission
	if err := s.db.WithContext(ctx).First(&submission, file.SubmissionID).Error; err != nil {
		return nil, internalError("读取附件提交记录失败", err)
	}
	var item model.Assignment
	if err := s.db.WithContext(ctx).First(&item, submission.AssignmentID).Error; err != nil {
		return nil, internalError("读取附件作业失败", err)
	}
	switch actor.RoleName {
	case model.RoleNameAdmin, model.RoleNameSuperAdmin:
		if err := s.requireManagerGroupAccess(ctx, actor, item.GroupID); err != nil {
			return nil, err
		}
	case model.RoleNameUser:
		if err := requireMemberAssignmentPublished(item); err != nil {
			return nil, err
		}
		if err := s.requireGroupAccess(ctx, actor.ID, item.GroupID); err != nil {
			return nil, err
		}
		if actor.ID != submission.UserID {
			return nil, forbidden("无权下载该提交附件")
		}
	default:
		return nil, forbidden("无权下载该提交附件")
	}
	content, err := s.files.open(file.StoragePath)
	if err != nil {
		return nil, internalError("读取附件失败", err)
	}
	return &Download{FileName: file.FileName, ContentType: file.ContentType, Content: content}, nil
}

func (s *Service) UploadMaterialFiles(ctx context.Context, actor Actor, assignmentID uint64, headers []*multipart.FileHeader) ([]MaterialFileView, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	validated, err := validateUploads(headers, true)
	if err != nil {
		return nil, err
	}
	storedPaths := make([]string, 0, len(validated))
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.Assignment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, assignmentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("作业不存在")
			}
			return err
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		var submissionCount int64
		if err := tx.Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", item.ID).Count(&submissionCount).Error; err != nil {
			return err
		}
		if submissionCount > 0 {
			return conflict("已有成员提交，不能再修改教学资料")
		}
		var existing []model.AssignmentMaterialFile
		if err := tx.Where("assignment_id = ?", item.ID).Find(&existing).Error; err != nil {
			return err
		}
		if len(existing)+len(validated) > maxAssignmentFiles {
			return badRequest("教学资料最多 10 个文件")
		}
		now := s.now().UTC()
		files := make([]model.AssignmentMaterialFile, 0, len(validated))
		for _, upload := range validated {
			stored, err := s.materials.save(ctx, item.ID, actor.ID, upload, now, true)
			if err != nil {
				return err
			}
			storedPaths = append(storedPaths, stored.storagePath)
			files = append(files, model.AssignmentMaterialFile{
				AssignmentID: item.ID, UploaderID: actor.ID, FileName: stored.fileName,
				StoragePath: stored.storagePath, ContentType: stored.contentType, Size: stored.size, CreatedAt: now,
			})
		}
		return tx.Create(&files).Error
	})
	if err != nil {
		for _, path := range storedPaths {
			_ = s.materials.remove(path)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("上传教学资料失败", err)
	}
	return s.loadMaterialFiles(ctx, assignmentID)
}

func (s *Service) RemoveMaterialFile(ctx context.Context, actor Actor, assignmentID, fileID uint64) ([]MaterialFileView, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	var removed model.AssignmentMaterialFile
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.Assignment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, assignmentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("作业不存在")
			}
			return err
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		var submissionCount int64
		if err := tx.Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", item.ID).Count(&submissionCount).Error; err != nil {
			return err
		}
		if submissionCount > 0 {
			return conflict("已有成员提交，不能删除教学资料")
		}
		if err := tx.Where("id = ? AND assignment_id = ?", fileID, item.ID).First(&removed).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("教学资料不存在")
			}
			return err
		}
		return tx.Delete(&removed).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("移除教学资料失败", err)
	}
	if err := s.materials.remove(removed.StoragePath); err != nil {
		return nil, internalError("教学资料记录已移除，但附件文件清理失败", err)
	}
	return s.loadMaterialFiles(ctx, assignmentID)
}

func (s *Service) OpenMaterialFile(ctx context.Context, actor Actor, fileID uint64) (*Download, error) {
	var file model.AssignmentMaterialFile
	if err := s.db.WithContext(ctx).First(&file, fileID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("教学资料不存在")
		}
		return nil, internalError("读取教学资料信息失败", err)
	}
	var item model.Assignment
	if err := s.db.WithContext(ctx).First(&item, file.AssignmentID).Error; err != nil {
		return nil, internalError("读取教学资料作业失败", err)
	}
	switch actor.RoleName {
	case model.RoleNameAdmin, model.RoleNameSuperAdmin:
		if err := s.requireManagerGroupAccess(ctx, actor, item.GroupID); err != nil {
			return nil, err
		}
	case model.RoleNameUser:
		if err := requireMemberAssignmentPublished(item); err != nil {
			return nil, err
		}
		if err := s.requireGroupAccess(ctx, actor.ID, item.GroupID); err != nil {
			return nil, err
		}
		assigned, err := s.memberHasAssignment(s.db.WithContext(ctx), actor, item)
		if err != nil {
			return nil, internalError("校验教学资料访问权限失败", err)
		}
		if !assigned {
			return nil, notFound("教学资料不存在")
		}
	default:
		return nil, forbidden("无权下载教学资料")
	}
	content, err := s.materials.open(file.StoragePath)
	if err != nil {
		return nil, internalError("读取教学资料失败", err)
	}
	return &Download{FileName: file.FileName, ContentType: file.ContentType, Content: content}, nil
}

func (s *Service) loadMaterialFiles(ctx context.Context, assignmentID uint64) ([]MaterialFileView, error) {
	var files []model.AssignmentMaterialFile
	if err := s.db.WithContext(ctx).Where("assignment_id = ?", assignmentID).Order("id ASC").Find(&files).Error; err != nil {
		return nil, err
	}
	result := make([]MaterialFileView, 0, len(files))
	for _, file := range files {
		result = append(result, MaterialFileView{
			ID: file.ID, FileName: file.FileName, ContentType: file.ContentType,
			Size: file.Size, DownloadURL: fmt.Sprintf("/api/assignment-materials/%d", file.ID), CreatedAt: file.CreatedAt,
		})
	}
	return result, nil
}
