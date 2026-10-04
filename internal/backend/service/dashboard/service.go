package dashboard

import (
	"context"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type Actor struct {
	ID                uint64
	RoleName          string
	AdminScope        string
	ManagementGroupID *uint64
	GroupRole         string
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

type GroupDistributionItem struct {
	ID    uint64 `json:"id"`
	Name  string `json:"name"`
	Count int64  `json:"count"`
}
type RecentActivityItem struct {
	ID         uint64    `json:"id"`
	ActionKey  string    `json:"actionKey"`
	ActorName  string    `json:"actorName"`
	Message    string    `json:"message"`
	GroupName  string    `json:"groupName,omitempty"`
	OccurredAt time.Time `json:"occurredAt"`
}
type Data struct {
	TotalUsers            int64                   `json:"totalUsers"`
	NewUsersThisMonth     int64                   `json:"newUsersThisMonth"`
	PendingRegistrations  int64                   `json:"pendingRegistrations"`
	ActiveTechnicalGroups int                     `json:"activeTechnicalGroups"`
	GroupDistribution     []GroupDistributionItem `json:"groupDistribution"`
	RecentActivities      []RecentActivityItem    `json:"recentActivities"`
	GeneratedAt           time.Time               `json:"generatedAt"`
}

type Repository interface {
	CountUsers(context.Context) (int64, error)
	CountUsersCreated(context.Context, time.Time, time.Time) (int64, error)
	CountPendingRegistrations(context.Context) (int64, error)
	ListTechnicalGroups(context.Context) ([]GroupDistributionItem, error)
	ListRecentActivities(context.Context, int) ([]model.ActivityEvent, error)
}

type scopedRepository interface {
	CountUsersInGroup(context.Context, uint64) (int64, error)
	CountUsersCreatedInGroup(context.Context, uint64, time.Time, time.Time) (int64, error)
	CountPendingRegistrationsInGroup(context.Context, uint64) (int64, error)
	ListTechnicalGroupsInGroup(context.Context, uint64) ([]GroupDistributionItem, error)
	ListRecentActivitiesInGroup(context.Context, uint64, int) ([]model.ActivityEvent, error)
}

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service { return &Service{repo: repo, now: time.Now} }

func (s *Service) Get(ctx context.Context, actor Actor) (*Data, error) {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无管理员权限"}
	}
	now := s.now()
	start, end := monthBounds(now)
	total, err := s.repo.CountUsers(ctx)
	if err != nil {
		return nil, internal("统计总用户数失败", err)
	}
	monthly, err := s.repo.CountUsersCreated(ctx, start, end)
	if err != nil {
		return nil, internal("统计本月新增失败", err)
	}
	pending, err := s.repo.CountPendingRegistrations(ctx)
	if err != nil {
		return nil, internal("统计待审核报名失败", err)
	}
	groups, err := s.repo.ListTechnicalGroups(ctx)
	if err != nil {
		return nil, internal("统计技术组别失败", err)
	}
	events, err := s.repo.ListRecentActivities(ctx, 10)
	if err != nil {
		return nil, internal("加载最近动态失败", err)
	}
	activities := make([]RecentActivityItem, 0, len(events))
	for _, event := range events {
		activities = append(activities, activityItem(event))
	}
	return &Data{TotalUsers: total, NewUsersThisMonth: monthly, PendingRegistrations: pending, ActiveTechnicalGroups: len(groups), GroupDistribution: groups, RecentActivities: activities, GeneratedAt: now}, nil
}

func monthBounds(value time.Time) (time.Time, time.Time) {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		panic(err)
	}
	local := value.In(location)
	start := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, location)
	return start, start.AddDate(0, 1, 0)
}

func activityItem(event model.ActivityEvent) RecentActivityItem {
	actorName := "系统"
	if event.Actor != nil {
		actorName = displayUser(event.Actor)
	}
	groupName := ""
	if event.Group != nil {
		groupName = event.Group.Name
	}
	return RecentActivityItem{ID: event.ID, ActionKey: event.ActionKey, ActorName: actorName, Message: activityMessage(event), GroupName: groupName, OccurredAt: databaseUTCInstant(event.CreatedAt)}
}

func databaseUTCInstant(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), value.Hour(), value.Minute(), value.Second(), value.Nanosecond(), time.UTC)
}

func displayUser(user *model.User) string {
	if user == nil {
		return "系统"
	}
	for _, value := range []*string{user.Nickname, user.RealName} {
		if value != nil && strings.TrimSpace(*value) != "" {
			return strings.TrimSpace(*value)
		}
	}
	if strings.TrimSpace(user.Name) != "" {
		return strings.TrimSpace(user.Name)
	}
	return user.Email
}

func activityMessage(event model.ActivityEvent) string {
	title, _ := event.Metadata["title"].(string)
	switch event.ActionKey {
	case model.ActivityUserRegistered:
		return "注册了账号"
	case model.ActivityUserCreated:
		return "创建了用户"
	case model.ActivityRegistrationSubmitted:
		return "提交了报名"
	case model.ActivityRegistrationApproved:
		return "通过了报名审核"
	case model.ActivityRegistrationRejected:
		return "拒绝了报名审核"
	case model.ActivityRegistrationReviewUndo:
		return "撤销了报名审核"
	case model.ActivityGroupMemberAdded:
		return "将用户加入了分组"
	case model.ActivityGroupMemberRemoved:
		return "将用户移出了分组"
	case model.ActivityGroupMemberRoleChanged:
		return "调整了用户的组内角色"
	case model.ActivityAnnouncementPublished:
		if title != "" {
			return "发布了公告「" + title + "」"
		}
		return "发布了公告"
	case model.ActivityAnnouncementCreated:
		if title != "" {
			return "创建了公告「" + title + "」"
		}
		return "创建了公告"
	case model.ActivityAnnouncementUpdated:
		if title != "" {
			return "编辑了公告「" + title + "」"
		}
		return "编辑了公告"
	case model.ActivityAnnouncementDeleted:
		if title != "" {
			return "删除了公告「" + title + "」"
		}
		return "删除了公告"
	case model.ActivityAnnouncementArchived:
		if title != "" {
			return "归档了公告「" + title + "」"
		}
		return "归档了公告"
	case model.ActivityEventPublished:
		if title != "" {
			return "发布了日程「" + title + "」"
		}
		return "发布了日程"
	case model.ActivityEventCreated:
		if title != "" {
			return "创建了日程「" + title + "」"
		}
		return "创建了日程"
	case model.ActivityEventUpdated:
		if title != "" {
			return "编辑了日程「" + title + "」"
		}
		return "编辑了日程"
	case model.ActivityEventDeleted:
		if title != "" {
			return "删除了日程「" + title + "」"
		}
		return "删除了日程"
	case model.ActivityEventCancelled:
		if title != "" {
			return "取消了日程「" + title + "」"
		}
		return "取消了日程"
	case model.ActivityPortalLinkCreated:
		if title != "" {
			return "创建了快捷链接「" + title + "」"
		}
		return "创建了快捷链接"
	case model.ActivityPortalLinkUpdated:
		if title != "" {
			return "编辑了快捷链接「" + title + "」"
		}
		return "编辑了快捷链接"
	case model.ActivityPortalLinkDeleted:
		if title != "" {
			return "删除了快捷链接「" + title + "」"
		}
		return "删除了快捷链接"
	default:
		return "完成了一项业务操作"
	}
}

func internal(message string, err error) error {
	return &ServiceError{Status: http.StatusInternalServerError, Message: message, Err: err}
}

type GormRepository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) Repository { return &GormRepository{db: db} }
func (r *GormRepository) CountUsers(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.User{}).Count(&count).Error
	return count, err
}
func (r *GormRepository) CountUsersInGroup(ctx context.Context, groupID uint64) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).Where("group_id = ?", groupID).Count(&count).Error
	return count, err
}
func (r *GormRepository) CountUsersCreatedInGroup(ctx context.Context, groupID uint64, start, end time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.User{}).Joins("JOIN user_group_members ON user_group_members.user_id = users.id").Where("user_group_members.group_id = ? AND users.created_at >= ? AND users.created_at < ?", groupID, start, end).Count(&count).Error
	return count, err
}
func (r *GormRepository) CountPendingRegistrationsInGroup(ctx context.Context, groupID uint64) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Registration{}).Where(
		"(group_1 = ? AND group_1_status = ?) OR (group_2 = ? AND group_2_status = ?)",
		groupID,
		model.RegistrationStatusPending,
		groupID,
		model.RegistrationStatusPending,
	).Count(&count).Error
	return count, err
}
func (r *GormRepository) ListTechnicalGroupsInGroup(ctx context.Context, groupID uint64) ([]GroupDistributionItem, error) {
	var items []GroupDistributionItem
	err := r.db.WithContext(ctx).Table("user_groups").Select("user_groups.id, user_groups.name, COUNT(user_group_members.id) AS count").Joins("LEFT JOIN user_group_members ON user_group_members.group_id = user_groups.id").Where("user_groups.id = ? AND user_groups.status = ?", groupID, model.UserGroupStatusActive).Group("user_groups.id, user_groups.name").Scan(&items).Error
	return items, err
}
func (r *GormRepository) ListRecentActivitiesInGroup(ctx context.Context, groupID uint64, limit int) ([]model.ActivityEvent, error) {
	var rows []model.ActivityEvent
	err := r.db.WithContext(ctx).Where("group_id = ?", groupID).Preload("Actor").Preload("Group").Order("created_at DESC").Order("id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
func (r *GormRepository) CountUsersCreated(ctx context.Context, start, end time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.User{}).Where("created_at >= ? AND created_at < ?", start, end).Count(&count).Error
	return count, err
}
func (r *GormRepository) CountPendingRegistrations(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Registration{}).Where("status = ?", model.RegistrationStatusPending).Count(&count).Error
	return count, err
}
func (r *GormRepository) ListTechnicalGroups(ctx context.Context) ([]GroupDistributionItem, error) {
	var items []GroupDistributionItem
	err := r.db.WithContext(ctx).Table("user_groups").Select("user_groups.id, user_groups.name, COUNT(user_group_members.id) AS count").Joins("LEFT JOIN user_group_members ON user_group_members.group_id = user_groups.id").Where("user_groups.status = ? AND user_groups.show = ? AND user_groups.is_default = ?", model.UserGroupStatusActive, 1, false).Group("user_groups.id, user_groups.name").Order("count DESC").Order("user_groups.name ASC").Scan(&items).Error
	return items, err
}
func (r *GormRepository) ListRecentActivities(ctx context.Context, limit int) ([]model.ActivityEvent, error) {
	var rows []model.ActivityEvent
	err := r.db.WithContext(ctx).Preload("Actor").Preload("Group").Order("created_at DESC").Order("id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
