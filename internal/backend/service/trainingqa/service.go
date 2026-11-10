package trainingqa

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

var technicalGroups = []string{"机械组", "电控组", "视觉组", "AI组"}

type Actor struct {
	ID       uint64
	RoleName string
}

type Service struct {
	db    *gorm.DB
	files *questionFileStore
	now   func() time.Time
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

type AttachmentView struct {
	ID          uint64 `json:"id"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	URL         string `json:"url"`
}

type Download struct {
	FileName    string
	ContentType string
	Content     []byte
}

func NewService(db *gorm.DB) *Service {
	files, err := newQuestionFileStore("")
	if err != nil {
		panic(err)
	}
	return &Service{db: db, files: files, now: time.Now}
}

func NewServiceWithFileRoot(db *gorm.DB, root string) (*Service, error) {
	files, err := newQuestionFileStore(root)
	if err != nil {
		return nil, err
	}
	return &Service{db: db, files: files, now: time.Now}, nil
}

func (s *Service) OpenFile(ctx context.Context, actor Actor, fileID uint64) (*Download, error) {
	var file model.TrainingQuestionAttachment
	if err := s.db.WithContext(ctx).First(&file, fileID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("图片不存在")
		}
		return nil, internalError("读取问题图片失败", err)
	}
	question, err := s.loadQuestion(ctx, file.QuestionID)
	if err != nil {
		return nil, err
	}
	if question.DeletedAt != nil {
		return nil, notFound("图片不存在")
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if file.PostID != nil {
		var comment model.TrainingQuestionPost
		if err := s.db.WithContext(ctx).Select("id", "deleted_at").First(&comment, *file.PostID).Error; err != nil || comment.DeletedAt != nil {
			return nil, notFound("图片不存在")
		}
	}
	content, err := s.files.open(file.StoragePath)
	if err != nil {
		return nil, internalError("读取问题图片文件失败", err)
	}
	return &Download{FileName: file.FileName, ContentType: file.ContentType, Content: content}, nil
}

func (s *Service) loadAttachments(ctx context.Context, questionIDs []uint64) (map[uint64][]model.TrainingQuestionAttachment, error) {
	result := make(map[uint64][]model.TrainingQuestionAttachment, len(questionIDs))
	if len(questionIDs) == 0 {
		return result, nil
	}
	var files []model.TrainingQuestionAttachment
	if err := s.db.WithContext(ctx).Where("question_id IN ?", questionIDs).Order("id ASC").Find(&files).Error; err != nil {
		return nil, err
	}
	for _, file := range files {
		result[file.QuestionID] = append(result[file.QuestionID], file)
	}
	return result, nil
}

func (s *Service) loadQuestion(ctx context.Context, id uint64) (*model.TrainingQuestion, error) {
	var question model.TrainingQuestion
	if err := s.db.WithContext(ctx).First(&question, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("问题不存在")
		}
		return nil, internalError("读取问题失败", err)
	}
	return &question, nil
}

func (s *Service) requireVisible(ctx context.Context, actor Actor, question *model.TrainingQuestion) error {
	return s.requireVisibleWithDB(ctx, s.db.WithContext(ctx), actor, question)
}

func (s *Service) requireVisibleWithDB(ctx context.Context, db *gorm.DB, actor Actor, question *model.TrainingQuestion) error {
	if actor.ID == 0 {
		return forbidden("当前账号无权查看该问题")
	}
	if question.IsHidden && actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return notFound("问题不存在")
	}
	if question.Visibility == model.TrainingQuestionPrivate && question.AskerID == actor.ID {
		return nil
	}
	if question.GroupID == nil {
		if question.Visibility == model.TrainingQuestionPublic {
			return nil
		}
		return notFound("问题不存在")
	}
	groupID := *question.GroupID
	if actor.RoleName == model.RoleNameSuperAdmin {
		ids, err := activeTechnicalGroupIDs(db)
		if err != nil {
			return internalError("读取有效技术组失败", err)
		}
		if contains(ids, groupID) {
			return nil
		}
		return notFound("问题不存在")
	}
	ids, err := memberTechnicalGroupIDs(db, actor.ID)
	if err != nil {
		return internalError("读取所属技术组失败", err)
	}
	if !contains(ids, groupID) {
		return notFound("问题不存在")
	}
	if question.Visibility == model.TrainingQuestionPrivate && question.AskerID != actor.ID && actor.RoleName != model.RoleNameAdmin {
		return notFound("问题不存在")
	}
	return nil
}

func communityGroupID(groupID *uint64) uint64 {
	if groupID == nil {
		return 0
	}
	return *groupID
}

func (s *Service) requireGroupMember(ctx context.Context, actor Actor, groupID uint64) error {
	return s.requireGroupMemberWithDB(ctx, s.db.WithContext(ctx), actor, groupID)
}

func (s *Service) requireGroupMemberWithDB(ctx context.Context, db *gorm.DB, actor Actor, groupID uint64) error {
	if actor.ID == 0 || groupID == 0 {
		return forbidden("当前账号没有可用的技术组归属")
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		groups, err := activeTechnicalGroupIDs(db)
		if err != nil {
			return internalError("读取有效技术组失败", err)
		}
		if contains(groups, groupID) {
			return nil
		}
		return forbidden("当前账号没有可用的技术组归属")
	}
	ids, err := memberTechnicalGroupIDs(db, actor.ID)
	if err != nil {
		return internalError("读取所属技术组失败", err)
	}
	if !contains(ids, groupID) {
		return forbidden("当前账号没有该技术组的访问权限")
	}
	return nil
}

func (s *Service) isManager(ctx context.Context, db *gorm.DB, actor Actor, groupID uint64) bool {
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return false
	}
	ids, err := s.managerGroupIDsWithDB(db, actor)
	return err == nil && contains(ids, groupID)
}

func (s *Service) managerGroupIDsWithDB(db *gorm.DB, actor Actor) ([]uint64, error) {
	if actor.RoleName == model.RoleNameSuperAdmin {
		return activeTechnicalGroupIDs(db)
	}
	if actor.RoleName != model.RoleNameAdmin {
		return nil, forbidden("当前账号无答疑管理权限")
	}
	return memberTechnicalGroupIDs(db, actor.ID)
}

func activeTechnicalGroupIDs(db *gorm.DB) ([]uint64, error) {
	var ids []uint64
	err := db.Model(&model.UserGroup{}).Where("name IN ? AND status = ?", technicalGroups, model.UserGroupStatusActive).Order("id ASC").Pluck("id", &ids).Error
	return ids, err
}

func memberTechnicalGroupIDs(db *gorm.DB, userID uint64) ([]uint64, error) {
	var ids []uint64
	err := db.Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", userID, technicalGroups, model.UserGroupStatusActive, model.UserStatusEnabled).
		Order("user_group_members.group_id ASC").Pluck("user_group_members.group_id", &ids).Error
	return ids, err
}

func contains(values []uint64, target uint64) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func escapeLike(value string) string {
	value = strings.ReplaceAll(value, `!`, `!!`)
	value = strings.ReplaceAll(value, `%`, `!%`)
	return strings.ReplaceAll(value, `_`, `!_`)
}

func storedQuestionFileTotal(files []*storedQuestionFile) int64 {
	var total int64
	for _, file := range files {
		total += file.size
	}
	return total
}

func badRequest(message string) error {
	return &ServiceError{Status: http.StatusBadRequest, Message: message}
}
func forbidden(message string) error {
	return &ServiceError{Status: http.StatusForbidden, Message: message}
}
func notFound(message string) error {
	return &ServiceError{Status: http.StatusNotFound, Message: message}
}
func internalError(message string, err error) error {
	return &ServiceError{Status: http.StatusInternalServerError, Message: message, Err: err}
}
