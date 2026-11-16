package assignment

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"tarsgo-backend/model"
	"time"
	"unicode/utf8"
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

type GroupOption struct {
	ID   uint64
	Name string
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
	Score        uint8
	Decision     string
	Comment      string
	ImageFiles   []*multipart.FileHeader
	UploadTokens []string
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
	LateDueAt              *time.Time         `json:"lateDueAt,omitempty"`
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
	LateDueAt        *time.Time       `json:"lateDueAt,omitempty"`
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
	items, err := s.memberListItems(ctx, actor, false)
	if err != nil {
		return nil, err
	}
	return s.memberListViews(ctx, actor.ID, items)
}

func (s *Service) memberListItems(ctx context.Context, actor Actor, summary bool) ([]model.Assignment, error) {
	groupIDs, err := assignmentGroupIDs(s.db.WithContext(ctx), actor.ID)
	if err != nil {
		return nil, internalError("读取所属组别失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, forbidden("当前账号没有可用的技术组归属")
	}
	var items []model.Assignment
	query := s.db.WithContext(ctx).Model(&model.Assignment{})
	if summary {
		query = query.Select("assignments.id", "assignments.title", "assignments.due_at")
	}
	if err := query.
		Where(`assignments.group_id IN ? AND assignments.publication_status = ?
          AND ((assignments.is_group_wide = 1 AND ?) OR EXISTS
          (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = assignments.id AND t.user_id = ?))`,
			groupIDs, model.AssignmentPublicationPublished, actor.RoleName == model.RoleNameUser, actor.ID).
		Order("assignments.due_at ASC, assignments.id DESC").Find(&items).Error; err != nil {
		return nil, internalError("读取我的作业失败", err)
	}
	return items, nil
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
	assigned, err := s.memberHasAssignment(s.db.WithContext(ctx), actor, item)
	if err != nil {
		return nil, internalError("校验作业分配失败", err)
	}
	if !assigned {
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
	windows, err := s.loadLateWindows(s.db.WithContext(ctx), []uint64{item.ID}, []uint64{actor.ID})
	if err != nil {
		return nil, internalError("读取补交截止时间失败", err)
	}
	view := memberAssignmentView(item, groupName, history, s.now(), windows[actor.ID])
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
	return s.adminListViews(ctx, items)
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
		RealName *string
	}
	if err := s.db.WithContext(ctx).Table("user_group_members").
		Select("users.id AS user_id, users.real_name").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ? AND roles.name = ?", groupID, model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser).
		Order("users.real_name ASC, users.id ASC").Scan(&rows).Error; err != nil {
		return nil, internalError("读取组内成员失败", err)
	}
	result := make([]MemberOption, 0, len(rows))
	for _, row := range rows {
		name := "姓名待核实"
		if row.RealName != nil && strings.TrimSpace(*row.RealName) != "" {
			name = strings.TrimSpace(*row.RealName)
		}
		result = append(result, MemberOption{UserID: row.UserID, Name: name})
	}
	return result, nil
}

func (s *Service) ListManagedGroups(ctx context.Context, actor Actor) ([]GroupOption, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	ids, err := managerAssignmentGroupIDs(s.db.WithContext(ctx), actor)
	if err != nil {
		return nil, internalError("读取可管理组别失败", err)
	}
	if len(ids) == 0 {
		return nil, forbidden("当前账号没有可管理的技术组")
	}
	var groups []model.UserGroup
	if err := s.db.WithContext(ctx).Select("id", "name").Where("id IN ? AND status = ?", ids, model.UserGroupStatusActive).Order("id ASC").Find(&groups).Error; err != nil {
		return nil, internalError("读取可管理组别失败", err)
	}
	result := make([]GroupOption, 0, len(groups))
	for _, group := range groups {
		result = append(result, GroupOption{ID: group.ID, Name: group.Name})
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
	targetUserIDs, err := s.assignmentRecipientIDs(s.db.WithContext(ctx), item)
	if err != nil {
		return nil, internalError("读取作业成员失败", err)
	}
	histories, err := s.loadSubmissionHistories(ctx, item.ID, targetUserIDs, true)
	if err != nil {
		return nil, internalError("读取成员提交记录失败", err)
	}
	windows, err := s.loadLateWindows(s.db.WithContext(ctx), []uint64{item.ID}, targetUserIDs)
	if err != nil {
		return nil, internalError("读取补交设置失败", err)
	}
	var users []model.User
	if len(targetUserIDs) > 0 {
		if err := s.db.WithContext(ctx).Select("id", "real_name").Where("id IN ?", targetUserIDs).Find(&users).Error; err != nil {
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
	view := AdminAssignmentDetail{Assignment: assignmentView(item, groupName), Members: make([]AssignmentMemberView, 0, len(targetUserIDs))}
	view.Assignment.MaterialFiles = materialFiles
	for _, userID := range targetUserIDs {
		user, exists := usersByID[userID]
		if !exists {
			continue
		}
		history := histories[userID]
		name := "姓名待核实"
		if user.RealName != nil && strings.TrimSpace(*user.RealName) != "" {
			name = strings.TrimSpace(*user.RealName)
		}
		deadline := readStoredUTCWall(item.DueAt)
		window := windows[user.ID]
		if window != nil && window.After(deadline) {
			deadline = *window
		} else {
			window = nil
		}
		member := AssignmentMemberView{UserID: user.ID, Name: name, Submissions: history, Status: memberStatus(history, deadline, s.now()), LateDueAt: window}
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
		assigned, err := s.memberHasAssignment(tx, actor, item)
		if err != nil {
			return err
		}
		if !assigned {
			return notFound("作业不存在")
		}
		if err := requireMemberAssignmentPublished(item); err != nil {
			return err
		}
		var window model.AssignmentLateWindow
		windowErr := tx.Where("assignment_id = ? AND user_id = ?", item.ID, actor.ID).Take(&window).Error
		if windowErr != nil && !errors.Is(windowErr, gorm.ErrRecordNotFound) {
			return windowErr
		}
		deadline := readStoredUTCWall(item.DueAt)
		if windowErr == nil && readStoredUTCWall(window.DueAt).After(deadline) {
			deadline = readStoredUTCWall(window.DueAt)
		}
		if now.After(deadline) {
			return conflict("提交窗口已关闭，请联系管理员开放补交")
		}
		validated, err = validateUploads(headers, true)
		if err != nil {
			return err
		}
		var latest model.AssignmentSubmission
		latestErr := tx.Where("assignment_id = ? AND user_id = ?", item.ID, actor.ID).Order("attempt DESC").First(&latest).Error
		if latestErr != nil && !errors.Is(latestErr, gorm.ErrRecordNotFound) {
			return latestErr
		}
		if latestErr == nil {
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
			SubmittedAt: storeUTCWall(now.UTC()), IsLate: now.After(readStoredUTCWall(item.DueAt)), CreatedAt: storeUTCWall(now.UTC()),
		}
		if err := tx.Create(&submission).Error; err != nil {
			return err
		}
		files := make([]model.AssignmentSubmissionFile, 0, len(validated))
		for _, upload := range validated {
			stored, err := s.files.save(ctx, item.ID, actor.ID, upload, now, true)
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

func (s *Service) adminSummary(ctx context.Context, item model.Assignment) (AssignmentView, error) {
	groupName, err := s.groupName(ctx, item.GroupID)
	if err != nil {
		return AssignmentView{}, err
	}
	targetUserIDs, err := s.assignmentRecipientIDs(s.db.WithContext(ctx), item)
	if err != nil {
		return AssignmentView{}, err
	}
	histories, err := s.loadSubmissionHistories(ctx, item.ID, targetUserIDs, true)
	if err != nil {
		return AssignmentView{}, err
	}
	view := assignmentView(item, groupName)
	view.TargetCount = len(targetUserIDs)
	for _, userID := range targetUserIDs {
		history := histories[userID]
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
	var submissions, reviews int64
	if err := s.db.WithContext(ctx).Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", item.ID).Count(&submissions).Error; err != nil {
		return false, err
	}
	if err := s.db.WithContext(ctx).Table("assignment_reviews").Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").Where("assignment_submissions.assignment_id = ?", item.ID).Count(&reviews).Error; err != nil {
		return false, err
	}
	return submissions+reviews == 0, nil
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
	views, err := s.submissionViews(ctx, submissions, includeScores)
	if err != nil {
		return nil, err
	}
	for _, submission := range submissions {
		result[submission.UserID] = append(result[submission.UserID], views[submission.ID])
	}
	return result, nil
}

// Hydrates only the requested submissions; list callers pass latest attempts.
func (s *Service) submissionViews(ctx context.Context, submissions []model.AssignmentSubmission, includeScores bool) (map[uint64]SubmissionView, error) {
	result := make(map[uint64]SubmissionView, len(submissions))
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
			IsLate: submission.IsLate, Status: "submitted", Files: make([]FileView, 0, len(filesBySubmission[submission.ID])), Reviews: make([]ReviewView, 0, len(reviewsBySubmission[submission.ID])),
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
		result[submission.ID] = view
	}
	return result, nil
}

// Full-group assignments include eligible members who joined after publishing.
// Stored targets remain historical recipients; targeted assignments stay fixed.
func (s *Service) memberHasAssignment(db *gorm.DB, actor Actor, item model.Assignment) (bool, error) {
	if item.IsGroupWide && actor.RoleName == model.RoleNameUser {
		return true, nil
	}
	var count int64
	err := db.Model(&model.AssignmentTarget{}).
		Where("assignment_id = ? AND user_id = ?", item.ID, actor.ID).Count(&count).Error
	return count > 0, err
}

func currentGroupAssignmentRecipients(db *gorm.DB, groupID uint64) ([]uint64, error) {
	var userIDs []uint64
	err := db.Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ? AND roles.name = ?", groupID, model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser).
		Pluck("user_group_members.user_id", &userIDs).Error
	return uniqueSortedIDs(userIDs), err
}

func (s *Service) assignmentRecipientIDs(db *gorm.DB, item model.Assignment) ([]uint64, error) {
	var userIDs []uint64
	if err := db.Model(&model.AssignmentTarget{}).Where("assignment_id = ?", item.ID).
		Pluck("user_id", &userIDs).Error; err != nil {
		return nil, err
	}
	if item.IsGroupWide {
		current, err := currentGroupAssignmentRecipients(db, item.GroupID)
		if err != nil {
			return nil, err
		}
		userIDs = append(userIDs, current...)
	}
	return uniqueSortedIDs(userIDs), nil
}

func (s *Service) resolveTargetsWithDB(db *gorm.DB, groupID uint64, isGroupWide bool, requested []uint64) ([]uint64, error) {
	if isGroupWide {
		userIDs, err := currentGroupAssignmentRecipients(db, groupID)
		if err != nil {
			return nil, internalError("读取组内成员失败", err)
		}
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

func memberAssignmentView(item model.Assignment, groupName string, history []SubmissionView, now time.Time, lateDueAt *time.Time) AssignmentView {
	view := assignmentView(item, groupName)
	deadline := readStoredUTCWall(item.DueAt)
	if lateDueAt != nil && lateDueAt.After(deadline) {
		view.LateDueAt = lateDueAt
		deadline = *lateDueAt
	}
	view.Status = memberStatus(history, deadline, now)
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
