package cobuilderbadge

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"tarsgo-backend/model"
)

const maxDescriptionRunes = 500

type Actor struct {
	ID       uint64
	RoleName string
}

type Repository interface {
	UserExists(context.Context, uint64) (bool, error)
	ListContributions(context.Context, uint64) ([]model.CoBuilderContribution, error)
	CreateContribution(context.Context, *model.CoBuilderContribution) error
	RevokeContribution(context.Context, uint64, uint64, uint64, time.Time) (bool, error)
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

type Contribution struct {
	ID          uint64     `json:"id"`
	Description string     `json:"description"`
	GrantedByID uint64     `json:"grantedById"`
	CreatedAt   time.Time  `json:"createdAt"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty"`
	RevokedByID *uint64    `json:"revokedById,omitempty"`
}

type Summary struct {
	Name              string         `json:"name"`
	LevelCode         string         `json:"levelCode"`
	LevelLabel        string         `json:"levelLabel"`
	ContributionCount int            `json:"contributionCount"`
	NextLevelLabel    string         `json:"nextLevelLabel,omitempty"`
	NextLevelCount    int            `json:"nextLevelCount,omitempty"`
	ProgressCount     int            `json:"progressCount"`
	ProgressPercent   int            `json:"progressPercent"`
	Contributions     []Contribution `json:"contributions"`
}

type tier struct {
	code      string
	label     string
	threshold int
}

var tiers = []tier{
	{code: "bronze", label: "青铜 I", threshold: 1},
	{code: "silver", label: "白银 II", threshold: 3},
	{code: "gold", label: "黄金 III", threshold: 10},
}

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func (s *Service) GetMine(ctx context.Context, actor Actor) (*Summary, error) {
	if actor.ID == 0 {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	return s.summary(ctx, actor.ID)
}

func (s *Service) GetForAdmin(ctx context.Context, actor Actor, userID uint64) (*Summary, error) {
	if err := requireSuperAdmin(actor); err != nil {
		return nil, err
	}
	if userID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户编号无效"}
	}
	exists, err := s.repo.UserExists(ctx, userID)
	if err != nil {
		return nil, internal("读取成员账号失败", err)
	}
	if !exists {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "成员账号不存在"}
	}
	return s.summary(ctx, userID)
}

func (s *Service) Grant(ctx context.Context, actor Actor, userID uint64, description string) (*Summary, error) {
	if err := requireSuperAdmin(actor); err != nil {
		return nil, err
	}
	description = strings.TrimSpace(description)
	if userID == 0 || description == "" || utf8.RuneCountInString(description) > maxDescriptionRunes {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "请填写有效的贡献说明（1-500 字）"}
	}
	exists, err := s.repo.UserExists(ctx, userID)
	if err != nil {
		return nil, internal("读取成员账号失败", err)
	}
	if !exists {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "成员账号不存在"}
	}
	if err := s.repo.CreateContribution(ctx, &model.CoBuilderContribution{
		UserID:      userID,
		Description: description,
		GrantedByID: actor.ID,
		CreatedAt:   s.now(),
	}); err != nil {
		return nil, internal("登记贡献失败", err)
	}
	return s.summary(ctx, userID)
}

func (s *Service) Revoke(ctx context.Context, actor Actor, userID, contributionID uint64) (*Summary, error) {
	if err := requireSuperAdmin(actor); err != nil {
		return nil, err
	}
	if userID == 0 || contributionID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "贡献记录编号无效"}
	}
	revoked, err := s.repo.RevokeContribution(ctx, userID, contributionID, actor.ID, s.now())
	if err != nil {
		return nil, internal("撤销贡献记录失败", err)
	}
	if !revoked {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "贡献记录不存在或已撤销"}
	}
	return s.summary(ctx, userID)
}

func (s *Service) summary(ctx context.Context, userID uint64) (*Summary, error) {
	records, err := s.repo.ListContributions(ctx, userID)
	if err != nil {
		return nil, internal("读取贡献记录失败", err)
	}
	return summarize(records), nil
}

func summarize(records []model.CoBuilderContribution) *Summary {
	count := 0
	views := make([]Contribution, 0, len(records))
	for _, record := range records {
		if record.RevokedAt == nil {
			count++
		}
		views = append(views, Contribution{
			ID: record.ID, Description: record.Description, GrantedByID: record.GrantedByID,
			CreatedAt: record.CreatedAt, RevokedAt: record.RevokedAt, RevokedByID: record.RevokedByID,
		})
	}

	summary := &Summary{
		Name: "吉甲共建者", LevelCode: "none", LevelLabel: "未获得",
		ContributionCount: count, Contributions: views,
	}
	var current *tier
	var next *tier
	for index := range tiers {
		if count >= tiers[index].threshold {
			current = &tiers[index]
			continue
		}
		next = &tiers[index]
		break
	}
	if current != nil {
		summary.LevelCode = current.code
		summary.LevelLabel = current.label
	}
	if next == nil {
		summary.ProgressPercent = 100
		summary.ProgressCount = count
		return summary
	}
	summary.NextLevelLabel = next.label
	summary.NextLevelCount = next.threshold
	summary.ProgressCount = count
	summary.ProgressPercent = count * 100 / next.threshold
	return summary
}

func requireSuperAdmin(actor Actor) error {
	if actor.ID == 0 {
		return &ServiceError{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	if actor.RoleName != model.RoleNameSuperAdmin {
		return &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可管理共建者贡献"}
	}
	return nil
}

func internal(message string, err error) *ServiceError {
	return &ServiceError{Status: http.StatusInternalServerError, Message: message, Err: err}
}
