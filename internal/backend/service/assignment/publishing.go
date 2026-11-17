package assignment

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"mime/multipart"
	"sort"
	"strings"
	"tarsgo-backend/model"
	"time"
)

func (s *Service) Create(ctx context.Context, actor Actor, input CreateInput) (*AssignmentView, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	input, err := normalizeCreateInput(input, s.now())
	if err != nil {
		return nil, err
	}
	var userIDs []uint64
	now := s.now().UTC()
	item := model.Assignment{
		GroupID: input.GroupID, CreatorID: actor.ID, Title: input.Title, Description: input.Description,
		DueAt: storeUTCWall(input.DueAt), AttachmentRequirements: input.AttachmentRequirements, IsGroupWide: input.IsGroupWide,
		PublicationStatus: model.AssignmentPublicationPublished,
		CreatedAt:         now, UpdatedAt: now,
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.requireManagerGroupAccessWithDB(tx, actor, input.GroupID); err != nil {
			return err
		}
		resolved, err := s.resolveTargetsWithDB(tx, input.GroupID, input.IsGroupWide, input.TargetUserIDs)
		if err != nil {
			return err
		}
		userIDs = resolved
		if err := tx.Create(&item).Error; err != nil {
			return err
		}
		targets := make([]model.AssignmentTarget, 0, len(userIDs))
		for _, userID := range userIDs {
			targets = append(targets, model.AssignmentTarget{AssignmentID: item.ID, UserID: userID})
		}
		return tx.Create(&targets).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("发布作业失败", err)
	}
	groupName, err := s.groupName(ctx, item.GroupID)
	if err != nil {
		return nil, internalError("读取作业组别失败", err)
	}
	view := assignmentView(item, groupName)
	view.TargetCount = len(userIDs)
	return &view, nil
}

// CreateWithMaterialFiles publishes an assignment and any supplied teaching
// materials in one transaction. The web publishing handler still requires its
// configured uploads; Feishu card publishing may attach materials afterward.
func (s *Service) CreateWithMaterialFiles(ctx context.Context, actor Actor, input CreateInput, requestID string, headers []*multipart.FileHeader) (*AssignmentPublishResult, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	requestID = strings.TrimSpace(requestID)
	if !validPublishRequestID(requestID) {
		return nil, badRequest("发布请求标识无效，请重新提交")
	}
	input, err := normalizeCreateInput(input, s.now())
	if err != nil {
		return nil, err
	}
	validated := []validatedUpload{}
	if len(headers) > 0 {
		validated, err = validateUploads(headers, true)
		if err != nil {
			return nil, err
		}
	}
	for index := range validated {
		validated[index].contentHash, err = hashAssignmentUpload(validated[index].header)
		if err != nil {
			return nil, badRequest("附件内容读取失败，请重新选择文件")
		}
	}
	requestHash, err := assignmentPublishHash(input, validated)
	if err != nil {
		return nil, internalError("计算发布请求校验值失败", err)
	}

	var item model.Assignment
	var userIDs []uint64
	var storedPaths []string
	now := s.now().UTC()
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing model.Assignment
		findErr := tx.Where("publish_request_id = ?", requestID).First(&existing).Error
		if findErr == nil {
			if existing.CreatorID != actor.ID {
				return forbidden("无权使用该发布请求标识")
			}
			if existing.PublishRequestHash == nil || *existing.PublishRequestHash != requestHash {
				return conflict("发布请求内容已变化，请取消后重新发布")
			}
			if err := s.requireManagerGroupAccessWithDB(tx, actor, existing.GroupID); err != nil {
				return err
			}
			item = existing
			return nil
		}
		if !errors.Is(findErr, gorm.ErrRecordNotFound) {
			return findErr
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, input.GroupID); err != nil {
			return err
		}
		resolved, err := s.resolveTargetsWithDB(tx, input.GroupID, input.IsGroupWide, input.TargetUserIDs)
		if err != nil {
			return err
		}
		userIDs = resolved
		requestIDCopy, requestHashCopy := requestID, requestHash
		item = model.Assignment{
			PublishRequestID: &requestIDCopy, PublishRequestHash: &requestHashCopy,
			GroupID: input.GroupID, CreatorID: actor.ID, Title: input.Title, Description: input.Description,
			DueAt: storeUTCWall(input.DueAt), AttachmentRequirements: input.AttachmentRequirements, IsGroupWide: input.IsGroupWide,
			PublicationStatus: model.AssignmentPublicationPublished,
			CreatedAt:         now, UpdatedAt: now,
		}
		if err := tx.Create(&item).Error; err != nil {
			return err
		}
		targets := make([]model.AssignmentTarget, 0, len(userIDs))
		for _, userID := range userIDs {
			targets = append(targets, model.AssignmentTarget{AssignmentID: item.ID, UserID: userID})
		}
		if err := tx.Create(&targets).Error; err != nil {
			return err
		}

		materialFiles := make([]model.AssignmentMaterialFile, 0, len(validated))
		for _, upload := range validated {
			stored, err := s.materials.save(ctx, item.ID, actor.ID, upload, now, true)
			if err != nil {
				return err
			}
			storedPaths = append(storedPaths, stored.storagePath)
			materialFiles = append(materialFiles, model.AssignmentMaterialFile{
				AssignmentID: item.ID, UploaderID: actor.ID, FileName: stored.fileName,
				StoragePath: stored.storagePath, ContentType: stored.contentType, Size: stored.size, CreatedAt: now,
			})
		}
		if len(materialFiles) == 0 {
			return nil
		}
		return tx.Create(&materialFiles).Error
	})
	if err != nil {
		for _, path := range storedPaths {
			_ = s.materials.remove(path)
		}
		// A concurrent retry may have committed while this transaction was
		// waiting on the unique idempotency key. Return that result only when
		// both the creator and the complete request fingerprint match.
		if existing, lookupErr := s.findPublishedRequest(ctx, actor, requestID, requestHash); lookupErr == nil && existing != nil {
			return existing, nil
		} else if lookupErr != nil {
			var serviceErr *ServiceError
			if errors.As(lookupErr, &serviceErr) {
				return nil, serviceErr
			}
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("发布作业及教学资料失败", err)
	}

	result, err := s.buildPublishedResult(ctx, item, userIDs)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) findPublishedRequest(ctx context.Context, actor Actor, requestID, requestHash string) (*AssignmentPublishResult, error) {
	var item model.Assignment
	if err := s.db.WithContext(ctx).Where("publish_request_id = ?", requestID).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, internalError("核对作业发布状态失败", err)
	}
	if item.CreatorID != actor.ID {
		return nil, forbidden("无权使用该发布请求标识")
	}
	if item.PublishRequestHash == nil || *item.PublishRequestHash != requestHash {
		return nil, conflict("发布请求内容已变化，请取消后重新发布")
	}
	if err := s.requireManagerGroupAccess(ctx, actor, item.GroupID); err != nil {
		return nil, err
	}
	return s.buildPublishedResult(ctx, item, nil)
}

func (s *Service) buildPublishedResult(ctx context.Context, item model.Assignment, userIDs []uint64) (*AssignmentPublishResult, error) {
	view, err := s.adminSummary(ctx, item)
	if err != nil {
		return nil, internalError("读取已发布作业统计失败", err)
	}
	if userIDs != nil {
		view.TargetCount = len(userIDs)
	}
	materialFiles, err := s.loadMaterialFiles(ctx, item.ID)
	if err != nil {
		return nil, internalError("读取已发布教学资料失败", err)
	}
	return &AssignmentPublishResult{Assignment: view, MaterialFiles: materialFiles}, nil
}

func validPublishRequestID(value string) bool {
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	for index, char := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			continue
		}
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
			return false
		}
	}
	return true
}

func assignmentPublishHash(input CreateInput, files []validatedUpload) (string, error) {
	targetIDs := append([]uint64(nil), input.TargetUserIDs...)
	sort.Slice(targetIDs, func(i, j int) bool { return targetIDs[i] < targetIDs[j] })
	type fileFingerprint struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
		Hash string `json:"hash"`
	}
	fingerprints := make([]fileFingerprint, 0, len(files))
	for _, file := range files {
		fingerprints = append(fingerprints, fileFingerprint{Name: file.fileName, Size: file.header.Size, Hash: file.contentHash})
	}
	request := struct {
		GroupID                uint64            `json:"groupId"`
		Title                  string            `json:"title"`
		Description            string            `json:"description"`
		DueAt                  string            `json:"dueAt"`
		AttachmentRequirements string            `json:"attachmentRequirements"`
		IsGroupWide            bool              `json:"isGroupWide"`
		TargetUserIDs          []uint64          `json:"targetUserIds"`
		Files                  []fileFingerprint `json:"files"`
	}{
		GroupID: input.GroupID, Title: input.Title, Description: input.Description,
		DueAt: input.DueAt.UTC().Format(time.RFC3339Nano), AttachmentRequirements: input.AttachmentRequirements,
		IsGroupWide: input.IsGroupWide, TargetUserIDs: targetIDs, Files: fingerprints,
	}
	body, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(body)
	return hex.EncodeToString(hash[:]), nil
}

func (s *Service) Update(ctx context.Context, actor Actor, assignmentID uint64, input CreateInput) (*AssignmentView, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	var item model.Assignment
	if err := s.db.WithContext(ctx).First(&item, assignmentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("作业不存在")
		}
		return nil, internalError("读取作业失败", err)
	}
	if err := s.requireManagerGroupAccess(ctx, actor, item.GroupID); err != nil {
		return nil, err
	}
	input.GroupID = item.GroupID
	input, err := normalizeCreateInput(input, s.now())
	if err != nil {
		return nil, err
	}
	requestedUserIDs := uniqueSortedIDs(input.TargetUserIDs)
	var userIDs []uint64
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, assignmentID).Error; err != nil {
			return err
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		if input.IsGroupWide != item.IsGroupWide {
			return conflict("作业接收范围在发布时确定，不能通过编辑更改")
		}
		var targets []model.AssignmentTarget
		if err := tx.Where("assignment_id = ?", item.ID).Order("user_id ASC").Find(&targets).Error; err != nil {
			return err
		}
		userIDs = make([]uint64, 0, len(targets))
		for _, target := range targets {
			userIDs = append(userIDs, target.UserID)
		}
		if len(userIDs) == 0 {
			return conflict("作业缺少接收成员记录，接收范围已锁定，请新建作业")
		}
		if !item.IsGroupWide && !sameUserIDs(requestedUserIDs, userIDs) {
			return conflict("定向作业的接收成员在发布时确定，不能通过编辑更改")
		}
		var submissionCount int64
		if err := tx.Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", item.ID).Count(&submissionCount).Error; err != nil {
			return err
		}
		if submissionCount != 0 {
			if item.Title != input.Title || item.Description != input.Description || item.AttachmentRequirements != input.AttachmentRequirements {
				return conflict("已有成员提交，只能延长截止时间")
			}
			if !input.DueAt.After(readStoredUTCWall(item.DueAt)) {
				return conflict("新截止时间必须晚于原截止时间")
			}
		}
		item.Title = input.Title
		item.Description = input.Description
		item.DueAt = storeUTCWall(input.DueAt)
		item.AttachmentRequirements = input.AttachmentRequirements
		item.IsGroupWide = input.IsGroupWide
		item.UpdatedAt = s.now().UTC()
		if err := tx.Save(&item).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新作业失败", err)
	}
	view, err := s.adminSummary(ctx, item)
	if err != nil {
		return nil, internalError("读取作业状态失败", err)
	}
	return &view, nil
}

// SetPublicationStatus withdraws a published assignment or republishes a
// withdrawn one. Historical targets and submissions stay intact; active
// group-wide recipients are resolved from current membership on every read.
func (s *Service) SetPublicationStatus(ctx context.Context, actor Actor, assignmentID uint64, status string) (*AssignmentView, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	if status != model.AssignmentPublicationPublished && status != model.AssignmentPublicationWithdrawn {
		return nil, badRequest("作业发布状态不合法")
	}
	var item model.Assignment
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, assignmentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("作业不存在")
			}
			return internalError("读取作业失败", err)
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		if item.PublicationStatus == status {
			return nil
		}
		item.PublicationStatus = status
		item.UpdatedAt = s.now().UTC()
		return tx.Model(&item).Updates(map[string]any{"publication_status": status, "updated_at": item.UpdatedAt}).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新作业发布状态失败", err)
	}
	view, err := s.adminSummary(ctx, item)
	if err != nil {
		return nil, internalError("读取作业状态失败", err)
	}
	return &view, nil
}

// Delete removes only an empty assignment with no learning or review history.
// A retained target snapshot or teaching file is removed only with its parent.
func (s *Service) Delete(ctx context.Context, actor Actor, assignmentID uint64) error {
	if err := requireAdmin(actor); err != nil {
		return err
	}
	var materialPaths []string
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.Assignment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, assignmentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("作业不存在")
			}
			return internalError("读取作业失败", err)
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, item.GroupID).Error; err != nil {
			return internalError("锁定作业所属组别失败", err)
		}
		if item.PublicationStatus != model.AssignmentPublicationWithdrawn {
			return conflict("请先撤回作业，再删除无历史记录的作业")
		}
		var submissions, reviews int64
		if err := tx.Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", item.ID).Count(&submissions).Error; err != nil {
			return err
		}
		if err := tx.Table("assignment_reviews").Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").Where("assignment_submissions.assignment_id = ?", item.ID).Count(&reviews).Error; err != nil {
			return err
		}
		if submissions+reviews > 0 {
			return conflict("该作业已有提交或审核记录，只能保留并撤回")
		}
		var materials []model.AssignmentMaterialFile
		if err := tx.Where("assignment_id = ?", item.ID).Find(&materials).Error; err != nil {
			return err
		}
		for _, material := range materials {
			materialPaths = append(materialPaths, material.StoragePath)
		}
		if err := tx.Where("assignment_id = ?", item.ID).Delete(&model.AssignmentTarget{}).Error; err != nil {
			return err
		}
		if err := tx.Where("assignment_id = ?", item.ID).Delete(&model.AssignmentMaterialFile{}).Error; err != nil {
			return err
		}
		return tx.Delete(&item).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return serviceErr
		}
		return internalError("删除作业失败", err)
	}
	for _, path := range materialPaths {
		if err := s.materials.remove(path); err != nil {
			return internalError("作业已删除，但教学资料文件清理失败", err)
		}
	}
	return nil
}
