package assignment

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const (
	groupMechanical = "机械组"
	groupEmbedded   = "电控组"
	groupVision     = "视觉组"
	groupAI         = "AI组"
	groupOperations = "运营组"
	maxRecipients   = 500
)

var (
	assignmentGroupNames = []string{groupMechanical, groupEmbedded, groupVision, groupAI, groupOperations}
	shanghaiLocation     = time.FixedZone("Asia/Shanghai", 8*60*60)
)

type Service struct {
	db        *gorm.DB
	files     *assignmentFileStore
	materials *assignmentFileStore
	now       func() time.Time
}

type Actor struct {
	ID       uint64
	RoleName string
}

type CreateInput struct {
	GroupID                uint64
	Title                  string
	Description            string
	DueAt                  time.Time
	AttachmentRequirements string
	IsGroupWide            bool
	TargetUserIDs          []uint64
}

type ReviewInput struct {
	Score    uint8
	Decision string
	Comment  string
}

type FileView struct {
	ID          uint64 `json:"id"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	DownloadURL string `json:"downloadUrl"`
}

type MaterialFileView struct {
	ID          uint64    `json:"id"`
	FileName    string    `json:"fileName"`
	ContentType string    `json:"contentType"`
	Size        int64     `json:"size"`
	DownloadURL string    `json:"downloadUrl"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ReviewView struct {
	ID         uint64    `json:"id"`
	ReviewerID uint64    `json:"reviewerId"`
	Score      *uint8    `json:"score,omitempty"`
	Decision   string    `json:"decision"`
	Comment    string    `json:"comment"`
	CreatedAt  time.Time `json:"createdAt"`
}

type SubmissionView struct {
	ID          uint64       `json:"id"`
	Attempt     uint         `json:"attempt"`
	SubmittedAt time.Time    `json:"submittedAt"`
	IsLate      bool         `json:"isLate"`
	Status      string       `json:"status"`
	Decision    string       `json:"decision,omitempty"`
	Files       []FileView   `json:"files"`
	Reviews     []ReviewView `json:"reviews"`
}

type AssignmentView struct {
	ID                     uint64             `json:"id"`
	GroupID                uint64             `json:"groupId"`
	GroupName              string             `json:"groupName"`
	CreatorID              uint64             `json:"creatorId"`
	Title                  string             `json:"title"`
	Description            string             `json:"description"`
	DueAt                  time.Time          `json:"dueAt"`
	AttachmentRequirements string             `json:"attachmentRequirements"`
	IsGroupWide            bool               `json:"isGroupWide"`
	PublicationStatus      string             `json:"publicationStatus"`
	CreatedAt              time.Time          `json:"createdAt"`
	CanDelete              bool               `json:"canDelete"`
	Status                 string             `json:"status,omitempty"`
	IsLate                 bool               `json:"isLate,omitempty"`
	TargetCount            int                `json:"targetCount"`
	SubmittedCount         int                `json:"submittedCount"`
	ReviewedCount          int                `json:"reviewedCount"`
	PassedCount            int                `json:"passedCount"`
	LatestSubmission       *SubmissionView    `json:"latestSubmission,omitempty"`
	MaterialFiles          []MaterialFileView `json:"materialFiles,omitempty"`
}

type AssignmentPublishResult struct {
	Assignment    AssignmentView     `json:"assignment"`
	MaterialFiles []MaterialFileView `json:"materialFiles"`
}

type MyAssignmentDetail struct {
	Assignment  AssignmentView   `json:"assignment"`
	Submissions []SubmissionView `json:"submissions"`
}

type AssignmentMemberView struct {
	UserID           uint64           `json:"userId"`
	Name             string           `json:"name"`
	Status           string           `json:"status"`
	IsLate           bool             `json:"isLate"`
	LatestSubmission *SubmissionView  `json:"latestSubmission,omitempty"`
	Submissions      []SubmissionView `json:"submissions"`
}

type AdminAssignmentDetail struct {
	Assignment AssignmentView         `json:"assignment"`
	Members    []AssignmentMemberView `json:"members"`
}

type MemberOption struct {
	UserID uint64 `json:"userId"`
	Name   string `json:"name"`
}

type Download struct {
	FileName    string
	ContentType string
	Content     []byte
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

func (e *ServiceError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *ServiceError) Unwrap() error { return e.Err }

func NewService(db *gorm.DB) *Service {
	service, err := newServiceWithFileRoots(db, "", filepath.Join("upload", "assignment-materials"))
	if err != nil {
		panic(err)
	}
	return service
}

func NewServiceWithFileRoot(db *gorm.DB, root string) (*Service, error) {
	return newServiceWithFileRoots(db, root, filepath.Join(root, "materials"))
}

func newServiceWithFileRoots(db *gorm.DB, submissionRoot, materialRoot string) (*Service, error) {
	files, err := newAssignmentFileStore(submissionRoot)
	if err != nil {
		return nil, err
	}
	materials, err := newAssignmentFileStore(materialRoot)
	if err != nil {
		return nil, err
	}
	return &Service{db: db, files: files, materials: materials, now: time.Now}, nil
}

func (s *Service) ListMine(ctx context.Context, actor Actor) ([]AssignmentView, error) {
	groupIDs, err := assignmentGroupIDs(s.db.WithContext(ctx), actor.ID)
	if err != nil {
		return nil, internalError("读取所属组别失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, forbidden("当前账号没有可用的技术组归属")
	}
	var items []model.Assignment
	if err := s.db.WithContext(ctx).Model(&model.Assignment{}).
		Joins("JOIN assignment_targets ON assignment_targets.assignment_id = assignments.id").
		Where("assignment_targets.user_id = ? AND assignments.group_id IN ? AND assignments.publication_status = ?", actor.ID, groupIDs, model.AssignmentPublicationPublished).
		Order("assignments.due_at ASC, assignments.id DESC").Find(&items).Error; err != nil {
		return nil, internalError("读取我的作业失败", err)
	}
	result := make([]AssignmentView, 0, len(items))
	for _, item := range items {
		groupName, err := s.groupName(ctx, item.GroupID)
		if err != nil {
			return nil, internalError("读取作业组别失败", err)
		}
		history, err := s.loadSubmissions(ctx, item.ID, actor.ID)
		if err != nil {
			return nil, internalError("读取作业提交记录失败", err)
		}
		result = append(result, memberAssignmentView(item, groupName, history, s.now()))
	}
	return result, nil
}

func (s *Service) GetMine(ctx context.Context, actor Actor, assignmentID uint64) (*MyAssignmentDetail, error) {
	groupIDs, err := assignmentGroupIDs(s.db.WithContext(ctx), actor.ID)
	if err != nil {
		return nil, internalError("读取所属组别失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, forbidden("当前账号没有可用的技术组归属")
	}
	var item model.Assignment
	if err := s.db.WithContext(ctx).Where("id = ? AND group_id IN ? AND publication_status = ?", assignmentID, groupIDs, model.AssignmentPublicationPublished).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("作业不存在")
		}
		return nil, internalError("读取作业失败", err)
	}
	var targetCount int64
	if err := s.db.WithContext(ctx).Model(&model.AssignmentTarget{}).
		Where("assignment_id = ? AND user_id = ?", item.ID, actor.ID).Count(&targetCount).Error; err != nil {
		return nil, internalError("校验作业分配失败", err)
	}
	if targetCount == 0 {
		return nil, notFound("作业不存在")
	}
	groupName, err := s.groupName(ctx, item.GroupID)
	if err != nil {
		return nil, internalError("读取作业组别失败", err)
	}
	history, err := s.loadSubmissions(ctx, item.ID, actor.ID)
	if err != nil {
		return nil, internalError("读取作业提交记录失败", err)
	}
	view := memberAssignmentView(item, groupName, history, s.now())
	view.MaterialFiles, err = s.loadMaterialFiles(ctx, item.ID)
	if err != nil {
		return nil, internalError("读取教学资料失败", err)
	}
	return &MyAssignmentDetail{Assignment: view, Submissions: history}, nil
}

func (s *Service) ListAdmin(ctx context.Context, actor Actor, groupID uint64) ([]AssignmentView, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	groupIDs, err := managerAssignmentGroupIDs(s.db.WithContext(ctx), actor)
	if err != nil {
		return nil, internalError("读取可管理组别失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, forbidden("当前账号没有可管理的技术组")
	}
	if groupID != 0 {
		if !containsID(groupIDs, groupID) {
			return nil, forbidden("无权管理该技术组的作业")
		}
		groupIDs = []uint64{groupID}
	}
	var items []model.Assignment
	if err := s.db.WithContext(ctx).Where("group_id IN ?", groupIDs).
		Order("created_at DESC, id DESC").Find(&items).Error; err != nil {
		return nil, internalError("读取组内作业失败", err)
	}
	result := make([]AssignmentView, 0, len(items))
	for _, item := range items {
		view, err := s.adminSummary(ctx, item)
		if err != nil {
			return nil, internalError("读取作业统计失败", err)
		}
		result = append(result, view)
	}
	return result, nil
}

func (s *Service) ListGroupMembers(ctx context.Context, actor Actor, groupID uint64) ([]MemberOption, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	if err := s.requireManagerGroupAccess(ctx, actor, groupID); err != nil {
		return nil, err
	}
	var rows []struct {
		UserID   uint64
		Name     string
		Nickname *string
		RealName *string
	}
	if err := s.db.WithContext(ctx).Table("user_group_members").
		Select("users.id AS user_id, users.name, users.nickname, users.real_name").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ? AND roles.name = ?", groupID, model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser).
		Order("users.real_name ASC, users.name ASC, users.id ASC").Scan(&rows).Error; err != nil {
		return nil, internalError("读取组内成员失败", err)
	}
	result := make([]MemberOption, 0, len(rows))
	for _, row := range rows {
		name := (model.User{Name: row.Name, Nickname: row.Nickname, RealName: row.RealName}).PreferredName()
		if name == "" {
			name = strings.TrimSpace(row.Name)
		}
		if name == "" {
			name = fmt.Sprintf("成员 %d", row.UserID)
		}
		result = append(result, MemberOption{UserID: row.UserID, Name: name})
	}
	return result, nil
}

func (s *Service) GetAdmin(ctx context.Context, actor Actor, assignmentID uint64) (*AdminAssignmentDetail, error) {
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
	groupName, err := s.groupName(ctx, item.GroupID)
	if err != nil {
		return nil, internalError("读取作业组别失败", err)
	}
	var targets []model.AssignmentTarget
	if err := s.db.WithContext(ctx).Where("assignment_id = ?", item.ID).Order("user_id ASC").Find(&targets).Error; err != nil {
		return nil, internalError("读取作业成员失败", err)
	}
	targetUserIDs := make([]uint64, 0, len(targets))
	for _, target := range targets {
		targetUserIDs = append(targetUserIDs, target.UserID)
	}
	histories, err := s.loadSubmissionHistories(ctx, item.ID, targetUserIDs, true)
	if err != nil {
		return nil, internalError("读取成员提交记录失败", err)
	}
	var users []model.User
	if len(targetUserIDs) > 0 {
		if err := s.db.WithContext(ctx).Select("id", "name", "nickname", "real_name").Where("id IN ?", targetUserIDs).Find(&users).Error; err != nil {
			return nil, internalError("读取成员信息失败", err)
		}
	}
	usersByID := make(map[uint64]model.User, len(users))
	for _, user := range users {
		usersByID[user.ID] = user
	}
	materialFiles, err := s.loadMaterialFiles(ctx, item.ID)
	if err != nil {
		return nil, internalError("读取教学资料失败", err)
	}
	view := AdminAssignmentDetail{Assignment: assignmentView(item, groupName), Members: make([]AssignmentMemberView, 0, len(targets))}
	view.Assignment.MaterialFiles = materialFiles
	for _, target := range targets {
		user, exists := usersByID[target.UserID]
		if !exists {
			continue
		}
		history := histories[target.UserID]
		name := user.PreferredName()
		if name == "" {
			name = strings.TrimSpace(user.Name)
		}
		if name == "" {
			name = fmt.Sprintf("成员 %d", user.ID)
		}
		member := AssignmentMemberView{UserID: user.ID, Name: name, Submissions: history, Status: memberStatus(history, item.DueAt, s.now())}
		if len(history) > 0 {
			latest := history[len(history)-1]
			member.LatestSubmission = &latest
			member.IsLate = latest.IsLate
		}
		view.Members = append(view.Members, member)
	}
	view.Assignment.TargetCount = len(view.Members)
	for _, member := range view.Members {
		if member.LatestSubmission == nil {
			continue
		}
		view.Assignment.SubmittedCount++
		if member.LatestSubmission.Status == "graded" {
			view.Assignment.ReviewedCount++
		}
		if member.LatestSubmission.Decision == model.AssignmentReviewPassed {
			view.Assignment.PassedCount++
		}
	}
	view.Assignment.CanDelete, err = s.assignmentCanDelete(ctx, item)
	if err != nil {
		return nil, internalError("检查作业删除条件失败", err)
	}
	return &view, nil
}

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

// CreateWithMaterialFiles publishes the assignment and its teaching materials
// in one transaction. The assignment remains invisible to members until the
// complete set of files and metadata has been stored and the transaction commits.
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
	validated, err := validateUploads(headers)
	if err != nil {
		return nil, err
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
			stored, err := s.materials.save(ctx, item.ID, actor.ID, upload, now)
			if err != nil {
				return err
			}
			storedPaths = append(storedPaths, stored.storagePath)
			materialFiles = append(materialFiles, model.AssignmentMaterialFile{
				AssignmentID: item.ID, UploaderID: actor.ID, FileName: stored.fileName,
				StoragePath: stored.storagePath, ContentType: stored.contentType, Size: stored.size, CreatedAt: now,
			})
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
			return conflict("已有成员提交，不能再修改作业内容")
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
	groupName, err := s.groupName(ctx, item.GroupID)
	if err != nil {
		return nil, internalError("读取作业组别失败", err)
	}
	view := assignmentView(item, groupName)
	view.TargetCount = len(userIDs)
	return &view, nil
}

// SetPublicationStatus withdraws a published assignment or republishes a
// withdrawn one. Recipient snapshots and all submission history stay intact.
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
		var submissions, reviews, skillLinks, skillEvidence, capabilityLinks int64
		if err := tx.Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", item.ID).Count(&submissions).Error; err != nil {
			return err
		}
		if err := tx.Table("assignment_reviews").Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").Where("assignment_submissions.assignment_id = ?", item.ID).Count(&reviews).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.SkillNodeAssignment{}).Where("assignment_id = ?", item.ID).Count(&skillLinks).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.SkillReviewEvent{}).Where("evidence_type = ? AND evidence_id = ?", model.SkillEvidenceAssignment, item.ID).Count(&skillEvidence).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.CapabilityDimensionSource{}).Where("source_type = ? AND source_id = ?", model.CapabilitySourceAssignment, item.ID).Count(&capabilityLinks).Error; err != nil {
			return err
		}
		if submissions+reviews+skillLinks+skillEvidence+capabilityLinks > 0 {
			return conflict("该作业已有提交、审核、技能关联或成长依据，或被能力维度关联，只能保留并撤回")
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

func (s *Service) Submit(ctx context.Context, actor Actor, assignmentID uint64, headers []*multipart.FileHeader) (*MyAssignmentDetail, error) {
	groupIDs, err := assignmentGroupIDs(s.db.WithContext(ctx), actor.ID)
	if err != nil {
		return nil, internalError("读取所属组别失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, forbidden("当前账号没有可用的技术组归属")
	}
	var storedPaths []string
	var validated []validatedUpload
	now := s.now().In(shanghaiLocation)
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.Assignment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND group_id IN ? AND publication_status = ?", assignmentID, groupIDs, model.AssignmentPublicationPublished).First(&item).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("作业不存在")
			}
			return err
		}
		if err := s.requireGroupAccessWithDB(tx, actor.ID, item.GroupID); err != nil {
			return err
		}
		var targets int64
		if err := tx.Model(&model.AssignmentTarget{}).Where("assignment_id = ? AND user_id = ?", item.ID, actor.ID).Count(&targets).Error; err != nil {
			return err
		}
		if targets == 0 {
			return notFound("作业不存在")
		}
		if err := requireMemberAssignmentPublished(item); err != nil {
			return err
		}
		validated, err = validateUploads(headers)
		if err != nil {
			return err
		}
		var latest model.AssignmentSubmission
		latestErr := tx.Where("assignment_id = ? AND user_id = ?", item.ID, actor.ID).Order("attempt DESC").First(&latest).Error
		if latestErr != nil && !errors.Is(latestErr, gorm.ErrRecordNotFound) {
			return latestErr
		}
		if latestErr == nil {
			if now.After(readStoredUTCWall(item.DueAt)) {
				return conflict("截止时间后不能修改或重新提交")
			}
			var review model.AssignmentReview
			reviewErr := tx.Where("submission_id = ?", latest.ID).Order("id DESC").First(&review).Error
			if reviewErr != nil && !errors.Is(reviewErr, gorm.ErrRecordNotFound) {
				return reviewErr
			}
			if reviewErr == nil && review.Decision == model.AssignmentReviewPassed {
				return conflict("作业已通过，不能再次提交")
			}
		}
		attempt := uint(1)
		if latestErr == nil {
			attempt = latest.Attempt + 1
		}
		submission := model.AssignmentSubmission{
			AssignmentID: item.ID, UserID: actor.ID, Attempt: attempt,
			SubmittedAt: now.UTC(), IsLate: now.After(readStoredUTCWall(item.DueAt)), CreatedAt: now.UTC(),
		}
		if err := tx.Create(&submission).Error; err != nil {
			return err
		}
		files := make([]model.AssignmentSubmissionFile, 0, len(validated))
		for _, upload := range validated {
			stored, err := s.files.save(ctx, item.ID, actor.ID, upload, now)
			if err != nil {
				return err
			}
			storedPaths = append(storedPaths, stored.storagePath)
			files = append(files, model.AssignmentSubmissionFile{
				SubmissionID: submission.ID, FileName: stored.fileName, StoragePath: stored.storagePath,
				ContentType: stored.contentType, Size: stored.size,
			})
		}
		return tx.Create(&files).Error
	})
	if err != nil {
		for _, path := range storedPaths {
			s.files.remove(path)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("提交作业失败", err)
	}
	return s.GetMine(ctx, actor, assignmentID)
}

func (s *Service) Review(ctx context.Context, actor Actor, submissionID uint64, input ReviewInput) (*AdminAssignmentDetail, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	input.Decision = strings.TrimSpace(input.Decision)
	input.Comment = strings.TrimSpace(input.Comment)
	if input.Score > 100 || (input.Decision != model.AssignmentReviewPassed && input.Decision != model.AssignmentReviewNeedsRedo) || utf8.RuneCountInString(input.Comment) > 5000 {
		return nil, badRequest("评分、处理结果或评语不合法")
	}
	var assignmentID uint64
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
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
		review := model.AssignmentReview{
			SubmissionID: submission.ID, ReviewerID: actor.ID, Score: input.Score,
			Decision: input.Decision, Comment: input.Comment, CreatedAt: s.now().UTC(),
		}
		if err := tx.Create(&review).Error; err != nil {
			return err
		}
		assignmentID = item.ID
		return nil
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存批改结果失败", err)
	}
	return s.GetAdmin(ctx, actor, assignmentID)
}

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
	validated, err := validateUploads(headers)
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
		totalSize := int64(0)
		for _, file := range existing {
			totalSize += file.Size
		}
		for _, upload := range validated {
			totalSize += upload.header.Size
		}
		if totalSize > maxAssignmentFilesTotal {
			return badRequest("教学资料总大小不能超过 50 MB")
		}

		now := s.now().UTC()
		files := make([]model.AssignmentMaterialFile, 0, len(validated))
		for _, upload := range validated {
			stored, err := s.materials.save(ctx, item.ID, actor.ID, upload, now)
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
		var targetCount int64
		if err := s.db.WithContext(ctx).Model(&model.AssignmentTarget{}).
			Where("assignment_id = ? AND user_id = ?", item.ID, actor.ID).Count(&targetCount).Error; err != nil {
			return nil, internalError("校验教学资料访问权限失败", err)
		}
		if targetCount == 0 {
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

func (s *Service) adminSummary(ctx context.Context, item model.Assignment) (AssignmentView, error) {
	groupName, err := s.groupName(ctx, item.GroupID)
	if err != nil {
		return AssignmentView{}, err
	}
	var targets []model.AssignmentTarget
	if err := s.db.WithContext(ctx).Where("assignment_id = ?", item.ID).Find(&targets).Error; err != nil {
		return AssignmentView{}, err
	}
	targetUserIDs := make([]uint64, 0, len(targets))
	for _, target := range targets {
		targetUserIDs = append(targetUserIDs, target.UserID)
	}
	histories, err := s.loadSubmissionHistories(ctx, item.ID, targetUserIDs, true)
	if err != nil {
		return AssignmentView{}, err
	}
	view := assignmentView(item, groupName)
	view.TargetCount = len(targets)
	for _, target := range targets {
		history := histories[target.UserID]
		if len(history) == 0 {
			continue
		}
		latest := history[len(history)-1]
		view.SubmittedCount++
		if latest.Status == "graded" {
			view.ReviewedCount++
		}
		if latest.Decision == model.AssignmentReviewPassed {
			view.PassedCount++
		}
	}
	view.CanDelete, err = s.assignmentCanDelete(ctx, item)
	if err != nil {
		return AssignmentView{}, err
	}
	return view, nil
}

func (s *Service) assignmentCanDelete(ctx context.Context, item model.Assignment) (bool, error) {
	if item.PublicationStatus != model.AssignmentPublicationWithdrawn {
		return false, nil
	}
	var submissions, reviews, skillLinks, skillEvidence, capabilityLinks int64
	if err := s.db.WithContext(ctx).Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", item.ID).Count(&submissions).Error; err != nil {
		return false, err
	}
	if err := s.db.WithContext(ctx).Table("assignment_reviews").Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").Where("assignment_submissions.assignment_id = ?", item.ID).Count(&reviews).Error; err != nil {
		return false, err
	}
	if err := s.db.WithContext(ctx).Model(&model.SkillNodeAssignment{}).Where("assignment_id = ?", item.ID).Count(&skillLinks).Error; err != nil {
		return false, err
	}
	if err := s.db.WithContext(ctx).Model(&model.SkillReviewEvent{}).Where("evidence_type = ? AND evidence_id = ?", model.SkillEvidenceAssignment, item.ID).Count(&skillEvidence).Error; err != nil {
		return false, err
	}
	if err := s.db.WithContext(ctx).Model(&model.CapabilityDimensionSource{}).Where("source_type = ? AND source_id = ?", model.CapabilitySourceAssignment, item.ID).Count(&capabilityLinks).Error; err != nil {
		return false, internalError("读取作业能力引用状态失败", err)
	}
	return submissions+reviews+skillLinks+skillEvidence+capabilityLinks == 0, nil
}

func requireMemberAssignmentPublished(item model.Assignment) error {
	if item.PublicationStatus != model.AssignmentPublicationPublished {
		return notFound("作业不存在")
	}
	return nil
}

func (s *Service) loadSubmissions(ctx context.Context, assignmentID, userID uint64) ([]SubmissionView, error) {
	histories, err := s.loadSubmissionHistories(ctx, assignmentID, []uint64{userID}, false)
	if err != nil {
		return nil, err
	}
	return histories[userID], nil
}

func (s *Service) loadSubmissionHistories(ctx context.Context, assignmentID uint64, userIDs []uint64, includeScores bool) (map[uint64][]SubmissionView, error) {
	result := make(map[uint64][]SubmissionView, len(userIDs))
	userIDs = uniqueSortedIDs(userIDs)
	if len(userIDs) == 0 {
		return result, nil
	}
	for _, userID := range userIDs {
		result[userID] = []SubmissionView{}
	}
	var submissions []model.AssignmentSubmission
	if err := s.db.WithContext(ctx).Where("assignment_id = ? AND user_id IN ?", assignmentID, userIDs).
		Order("user_id ASC, attempt ASC").Find(&submissions).Error; err != nil {
		return nil, err
	}
	if len(submissions) == 0 {
		return result, nil
	}
	submissionIDs := make([]uint64, 0, len(submissions))
	for _, submission := range submissions {
		submissionIDs = append(submissionIDs, submission.ID)
	}
	var files []model.AssignmentSubmissionFile
	if err := s.db.WithContext(ctx).Where("submission_id IN ?", submissionIDs).Order("id ASC").Find(&files).Error; err != nil {
		return nil, err
	}
	filesBySubmission := make(map[uint64][]model.AssignmentSubmissionFile, len(submissionIDs))
	for _, file := range files {
		filesBySubmission[file.SubmissionID] = append(filesBySubmission[file.SubmissionID], file)
	}
	var reviews []model.AssignmentReview
	if err := s.db.WithContext(ctx).Where("submission_id IN ?", submissionIDs).Order("id ASC").Find(&reviews).Error; err != nil {
		return nil, err
	}
	reviewsBySubmission := make(map[uint64][]model.AssignmentReview, len(submissionIDs))
	for _, review := range reviews {
		reviewsBySubmission[review.SubmissionID] = append(reviewsBySubmission[review.SubmissionID], review)
	}
	for _, submission := range submissions {
		view := SubmissionView{
			ID: submission.ID, Attempt: submission.Attempt, SubmittedAt: readStoredUTCWall(submission.SubmittedAt),
			IsLate: submission.IsLate, Status: "submitted", Files: make([]FileView, 0, len(files)), Reviews: make([]ReviewView, 0, len(reviews)),
		}
		for _, file := range filesBySubmission[submission.ID] {
			view.Files = append(view.Files, FileView{ID: file.ID, FileName: file.FileName, ContentType: file.ContentType, Size: file.Size, DownloadURL: fmt.Sprintf("/api/assignment-files/%d", file.ID)})
		}
		for _, review := range reviewsBySubmission[submission.ID] {
			reviewView := ReviewView{ID: review.ID, ReviewerID: review.ReviewerID, Decision: review.Decision, Comment: review.Comment, CreatedAt: readStoredUTCWall(review.CreatedAt)}
			if includeScores {
				score := review.Score
				reviewView.Score = &score
			}
			view.Reviews = append(view.Reviews, reviewView)
		}
		if len(view.Reviews) > 0 {
			view.Status = "graded"
			view.Decision = view.Reviews[len(view.Reviews)-1].Decision
		}
		result[submission.UserID] = append(result[submission.UserID], view)
	}
	return result, nil
}

func (s *Service) resolveTargetsWithDB(db *gorm.DB, groupID uint64, isGroupWide bool, requested []uint64) ([]uint64, error) {
	if isGroupWide {
		var userIDs []uint64
		err := db.Model(&model.UserGroupMember{}).
			Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
			Joins("JOIN users ON users.id = user_group_members.user_id").
			Joins("JOIN roles ON roles.id = users.role_id").
			Where("user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ? AND roles.name = ?", groupID, model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser).
			Pluck("user_group_members.user_id", &userIDs).Error
		if err != nil {
			return nil, internalError("读取组内成员失败", err)
		}
		userIDs = uniqueSortedIDs(userIDs)
		if len(userIDs) == 0 || len(userIDs) > maxRecipients {
			return nil, badRequest("当前组内可分配成员数量不合法")
		}
		return userIDs, nil
	}
	userIDs := uniqueSortedIDs(requested)
	if len(userIDs) == 0 || len(userIDs) > maxRecipients {
		return nil, badRequest("请选择 1 至 500 名组内成员")
	}
	var found []uint64
	err := db.Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("user_group_members.group_id = ? AND user_group_members.user_id IN ? AND user_groups.status = ? AND users.status = ? AND roles.name = ?", groupID, userIDs, model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser).
		Pluck("user_group_members.user_id", &found).Error
	if err != nil {
		return nil, internalError("校验作业接收成员失败", err)
	}
	found = uniqueSortedIDs(found)
	if len(found) != len(userIDs) {
		return nil, forbidden("作业接收人必须是当前组别的有效成员")
	}
	return found, nil
}

func (s *Service) requireGroupAccess(ctx context.Context, userID, groupID uint64) error {
	return s.requireGroupAccessWithDB(s.db.WithContext(ctx), userID, groupID)
}

func (s *Service) requireManagerGroupAccess(ctx context.Context, actor Actor, groupID uint64) error {
	return s.requireManagerGroupAccessWithDB(s.db.WithContext(ctx), actor, groupID)
}

func (s *Service) requireManagerGroupAccessWithDB(db *gorm.DB, actor Actor, groupID uint64) error {
	if err := requireAdmin(actor); err != nil {
		return err
	}
	ids, err := managerAssignmentGroupIDs(db, actor)
	if err != nil {
		return internalError("读取可管理组别失败", err)
	}
	if !containsID(ids, groupID) {
		return forbidden("无权访问该组别的作业")
	}
	return nil
}

func (s *Service) requireGroupAccessWithDB(db *gorm.DB, userID, groupID uint64) error {
	ids, err := assignmentGroupIDs(db, userID)
	if err != nil {
		return internalError("读取所属组别失败", err)
	}
	if !containsID(ids, groupID) {
		return forbidden("无权访问该组别的作业")
	}
	return nil
}

func (s *Service) groupName(ctx context.Context, groupID uint64) (string, error) {
	var group model.UserGroup
	err := s.db.WithContext(ctx).Select("id", "name").First(&group, groupID).Error
	return group.Name, err
}

func assignmentGroupIDs(db *gorm.DB, userID uint64) ([]uint64, error) {
	var ids []uint64
	err := db.Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", userID, assignmentGroupNames, model.UserGroupStatusActive, model.UserStatusEnabled).
		Order("user_group_members.group_id ASC").Pluck("user_group_members.group_id", &ids).Error
	if err != nil {
		return nil, err
	}
	return uniqueSortedIDs(ids), nil
}

func managerAssignmentGroupIDs(db *gorm.DB, actor Actor) ([]uint64, error) {
	if actor.RoleName != model.RoleNameSuperAdmin {
		if actor.RoleName != model.RoleNameAdmin {
			return nil, forbidden("当前账号无作业管理权限")
		}
		return assignmentGroupIDs(db, actor.ID)
	}

	var ids []uint64
	err := db.Model(&model.UserGroup{}).
		Where("name IN ? AND status = ?", assignmentGroupNames, model.UserGroupStatusActive).
		Order("id ASC").Pluck("id", &ids).Error
	if err != nil {
		return nil, err
	}
	return uniqueSortedIDs(ids), nil
}

func normalizeCreateInput(input CreateInput, now time.Time) (CreateInput, error) {
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.AttachmentRequirements = strings.TrimSpace(input.AttachmentRequirements)
	if input.GroupID == 0 || input.Title == "" || utf8.RuneCountInString(input.Title) > 120 || input.Description == "" || utf8.RuneCountInString(input.Description) > 10000 || utf8.RuneCountInString(input.AttachmentRequirements) > 2000 {
		return input, badRequest("作业标题、说明或附件要求不合法")
	}
	if input.DueAt.IsZero() || !input.DueAt.After(now) {
		return input, badRequest("截止时间必须晚于当前时间")
	}
	input.DueAt = input.DueAt.In(shanghaiLocation)
	if !input.IsGroupWide && len(input.TargetUserIDs) == 0 {
		return input, badRequest("请选择作业接收成员")
	}
	return input, nil
}

func assignmentView(item model.Assignment, groupName string) AssignmentView {
	return AssignmentView{
		ID: item.ID, GroupID: item.GroupID, GroupName: groupName, CreatorID: item.CreatorID,
		Title: item.Title, Description: item.Description, DueAt: readStoredUTCWall(item.DueAt),
		AttachmentRequirements: item.AttachmentRequirements, IsGroupWide: item.IsGroupWide,
		PublicationStatus: item.PublicationStatus, CreatedAt: readStoredUTCWall(item.CreatedAt),
	}
}

func memberAssignmentView(item model.Assignment, groupName string, history []SubmissionView, now time.Time) AssignmentView {
	view := assignmentView(item, groupName)
	view.Status = memberStatus(history, item.DueAt, now)
	if len(history) > 0 {
		latest := history[len(history)-1]
		view.LatestSubmission = &latest
		view.IsLate = latest.IsLate
	}
	return view
}

func memberStatus(history []SubmissionView, dueAt, now time.Time) string {
	if len(history) == 0 {
		if now.After(readStoredUTCWall(dueAt)) {
			return "overdue"
		}
		return "pending"
	}
	latest := history[len(history)-1]
	if latest.Decision == model.AssignmentReviewPassed {
		return model.AssignmentReviewPassed
	}
	if latest.Decision == model.AssignmentReviewNeedsRedo {
		return model.AssignmentReviewNeedsRedo
	}
	return "submitted"
}

func storeUTCWall(value time.Time) time.Time {
	utc := value.UTC()
	// The MySQL driver converts time.Time into loc=Local before writing DATETIME.
	// Keep the UTC wall-clock fields while using that same location so the row
	// round-trips unchanged on hosts outside UTC as well.
	return time.Date(utc.Year(), utc.Month(), utc.Day(), utc.Hour(), utc.Minute(), utc.Second(), utc.Nanosecond(), time.Local)
}

// MySQL DATETIME has no timezone. Assignment due times are stored as UTC wall-clock values.
func readStoredUTCWall(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), value.Hour(), value.Minute(), value.Second(), value.Nanosecond(), time.UTC)
}

func requireAdmin(actor Actor) error {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return forbidden("当前账号无作业管理权限")
	}
	return nil
}

func uniqueSortedIDs(values []uint64) []uint64 {
	seen := make(map[uint64]struct{}, len(values))
	result := make([]uint64, 0, len(values))
	for _, value := range values {
		if value == 0 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func sameUserIDs(left, right []uint64) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func containsID(values []uint64, target uint64) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func badRequest(message string) *ServiceError {
	return &ServiceError{Status: http.StatusBadRequest, Message: message}
}
func forbidden(message string) *ServiceError {
	return &ServiceError{Status: http.StatusForbidden, Message: message}
}
func notFound(message string) *ServiceError {
	return &ServiceError{Status: http.StatusNotFound, Message: message}
}
func conflict(message string) *ServiceError {
	return &ServiceError{Status: http.StatusConflict, Message: message}
}
func internalError(message string, err error) *ServiceError {
	return &ServiceError{Status: http.StatusInternalServerError, Message: message, Err: err}
}
