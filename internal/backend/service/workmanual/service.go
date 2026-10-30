package workmanual

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"net/http"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

const OperationsGroupName = "运营组"

const (
	operationsCataloguePath = "content/operations.json"
	applicationFormPath     = "content/templates/campus-network-window-application.doc"
)

//go:embed content
var contentFiles embed.FS

type Actor struct {
	ID       uint64
	RoleName string
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

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) OperationsCatalogue(ctx context.Context, actor Actor) ([]byte, error) {
	if err := s.authorizeOperations(ctx, actor); err != nil {
		return nil, err
	}
	return readContent(operationsCataloguePath)
}

func (s *Service) ApplicationForm(ctx context.Context, actor Actor) (*Download, error) {
	if err := s.authorizeOperations(ctx, actor); err != nil {
		return nil, err
	}
	content, err := readContent(applicationFormPath)
	if err != nil {
		return nil, err
	}
	return &Download{
		FileName:    "校园网之窗申请表.doc",
		ContentType: "application/msword",
		Content:     content,
	}, nil
}

func (s *Service) authorizeOperations(ctx context.Context, actor Actor) error {
	if actor.ID == 0 {
		return &ServiceError{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		return nil
	}
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameUser {
		return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权访问运营组 SOP"}
	}
	if s.db == nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "读取运营组权限失败", Err: errors.New("database is unavailable")}
	}

	var membershipCount int64
	err := s.db.WithContext(ctx).
		Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name = ? AND user_groups.status = ? AND users.status = ?",
			actor.ID, OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled).
		Count(&membershipCount).Error
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "读取运营组权限失败", Err: err}
	}
	if membershipCount == 0 {
		return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权访问运营组 SOP"}
	}
	return nil
}

func readContent(name string) ([]byte, error) {
	data, err := fs.ReadFile(contentFiles, name)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取工作手册内容失败", Err: err}
	}
	return data, nil
}
