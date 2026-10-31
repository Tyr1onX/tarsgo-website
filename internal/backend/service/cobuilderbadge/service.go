package cobuilderbadge

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"tarsgo-backend/model"
)

const maxDescriptionRunes = 500
const defaultContributionDescription = "参与吉甲官网测试与反馈"

type Actor struct {
	ID       uint64
	RoleName string
}

type Repository interface {
	UserExists(context.Context, uint64) (bool, error)
	ListContributions(context.Context, uint64) ([]model.CoBuilderContribution, error)
	ListEnabledContributionCounts(context.Context) ([]int, error)
	CreateContribution(context.Context, *model.CoBuilderContribution) error
	RevokeContribution(context.Context, uint64, uint64, uint64, time.Time) (bool, error)
	ClaimUnlock(context.Context, uint64, uint8, string, time.Time, time.Time) (bool, error)
	AcknowledgeUnlock(context.Context, uint64, string) error
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
	AwardCounts       AwardCounts    `json:"awardCounts"`
	NextLevelLabel    string         `json:"nextLevelLabel,omitempty"`
	NextLevelCount    int            `json:"nextLevelCount,omitempty"`
	ProgressCount     int            `json:"progressCount"`
	ProgressPercent   int            `json:"progressPercent"`
	Contributions     []Contribution `json:"contributions"`
}

type AwardCounts struct {
	Bronze int `json:"bronze"`
	Silver int `json:"silver"`
	Gold   int `json:"gold"`
}

type UnlockNotice struct {
	LevelCode  string `json:"levelCode"`
	LevelLabel string `json:"levelLabel"`
	ClaimToken string `json:"claimToken"`
}

type tier struct {
	code      string
	label     string
	threshold int
	rank      uint8
}

var tiers = []tier{
	{code: "bronze", label: "青铜 I", threshold: 1, rank: 1},
	{code: "silver", label: "白银 II", threshold: 3, rank: 2},
	{code: "gold", label: "黄金 III", threshold: 10, rank: 3},
}

const unlockClaimDuration = 30 * time.Second

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

func (s *Service) ClaimUnlock(ctx context.Context, actor Actor) (*UnlockNotice, error) {
	if actor.ID == 0 {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	records, err := s.repo.ListContributions(ctx, actor.ID)
	if err != nil {
		return nil, internal("读取贡献记录失败", err)
	}
	current := currentTier(effectiveContributionCount(records))
	if current == nil {
		return nil, nil
	}
	now := s.now()
	var tokenBytes [32]byte
	if _, err := rand.Read(tokenBytes[:]); err != nil {
		return nil, internal("创建勋章展示凭证失败", err)
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes[:])
	claimed, err := s.repo.ClaimUnlock(ctx, actor.ID, current.rank, token, now.Add(unlockClaimDuration), now)
	if err != nil {
		return nil, internal("读取勋章解锁状态失败", err)
	}
	if !claimed {
		return nil, nil
	}
	return &UnlockNotice{LevelCode: current.code, LevelLabel: current.label, ClaimToken: token}, nil
}

func (s *Service) AcknowledgeUnlock(ctx context.Context, actor Actor, token string) error {
	if actor.ID == 0 {
		return &ServiceError{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	token = strings.TrimSpace(token)
	if len(token) != 43 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "勋章展示凭证无效"}
	}
	if err := s.repo.AcknowledgeUnlock(ctx, actor.ID, token); err != nil {
		return internal("确认勋章展示失败", err)
	}
	return nil
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
	if description == "" {
		description = defaultContributionDescription
	}
	if userID == 0 || utf8.RuneCountInString(description) > maxDescriptionRunes {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "贡献说明不能超过 500 字"}
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
	effectiveCounts, err := s.repo.ListEnabledContributionCounts(ctx)
	if err != nil {
		return nil, internal("统计共建者勋章人数失败", err)
	}
	summary := summarize(records)
	summary.AwardCounts = countAwards(effectiveCounts)
	return summary, nil
}

func countAwards(effectiveCounts []int) AwardCounts {
	var counts AwardCounts
	for _, count := range effectiveCounts {
		for _, level := range tiers {
			if count >= level.threshold {
				switch level.code {
				case "bronze":
					counts.Bronze++
				case "silver":
					counts.Silver++
				case "gold":
					counts.Gold++
				}
			}
		}
	}
	return counts
}

func summarize(records []model.CoBuilderContribution) *Summary {
	count := effectiveContributionCount(records)
	views := make([]Contribution, 0, len(records))
	for _, record := range records {
		views = append(views, Contribution{
			ID: record.ID, Description: record.Description, GrantedByID: record.GrantedByID,
			CreatedAt: record.CreatedAt, RevokedAt: record.RevokedAt, RevokedByID: record.RevokedByID,
		})
	}

	summary := &Summary{
		Name: "吉甲共建者", LevelCode: "none", LevelLabel: "未获得",
		ContributionCount: count, Contributions: views,
	}
	current := currentTier(count)
	var next *tier
	for index := range tiers {
		if count < tiers[index].threshold {
			next = &tiers[index]
			break
		}
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

func effectiveContributionCount(records []model.CoBuilderContribution) int {
	count := 0
	for _, record := range records {
		if record.RevokedAt == nil {
			count++
		}
	}
	return count
}

func currentTier(count int) *tier {
	var current *tier
	for index := range tiers {
		if count < tiers[index].threshold {
			break
		}
		current = &tiers[index]
	}
	return current
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
