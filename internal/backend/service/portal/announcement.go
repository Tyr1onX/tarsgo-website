package portal

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

const defaultAnnouncementPageSize = 20

var allowedAnnouncementCategories = map[string]struct{}{
	"competition": {}, "training": {}, "team": {}, "system": {},
}

type Actor struct {
	ID       uint64
	RoleName string
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

type AnnouncementInput struct {
	Title          string
	Summary        string
	Content        string
	Category       string
	Status         string
	IsPinned       bool
	PublishAt      *time.Time
	ExpireAt       *time.Time
	AudienceType   string
	TargetGroupIDs []uint64
}

type ListAnnouncementsInput struct {
	Status        string
	Page          int
	PageSize      int
	ScopeGroupIDs []uint64
}

type AnnouncementItem struct {
	ID             uint64     `json:"id"`
	Title          string     `json:"title"`
	Summary        string     `json:"summary"`
	Content        string     `json:"content"`
	Category       string     `json:"category"`
	Status         string     `json:"status"`
	IsPinned       bool       `json:"isPinned"`
	PublishAt      *time.Time `json:"publishAt"`
	ExpireAt       *time.Time `json:"expireAt"`
	AudienceType   string     `json:"audienceType"`
	TargetGroupIDs []uint64   `json:"targetGroupIds"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type AnnouncementList struct {
	Items    []AnnouncementItem `json:"items"`
	Page     int                `json:"page"`
	PageSize int                `json:"pageSize"`
	Total    int64              `json:"total"`
}

type HomeData struct {
	Announcements []AnnouncementItem `json:"announcements"`
	Events        []EventItem        `json:"events"`
	Links         []LinkItem         `json:"links"`
	GeneratedAt   time.Time          `json:"generatedAt"`
}

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service { return &Service{repo: repo, now: time.Now} }

func (s *Service) ListAnnouncements(ctx context.Context, actor Actor, input ListAnnouncementsInput) (*AnnouncementList, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if !fullAccess {
		input.ScopeGroupIDs = groupIDs
	}
	if input.Status != "" && !validAnnouncementStatus(input.Status) {
		return nil, badRequest("公告状态不合法")
	}
	if input.Page < 1 {
		input.Page = 1
	}
	if input.PageSize < 1 || input.PageSize > 100 {
		input.PageSize = defaultAnnouncementPageSize
	}
	rows, total, err := s.repo.ListAnnouncements(ctx, input)
	if err != nil {
		return nil, internalError("查询公告列表失败", err)
	}
	return &AnnouncementList{Items: announcementItems(rows), Page: input.Page, PageSize: input.PageSize, Total: total}, nil
}

func (s *Service) GetAnnouncement(ctx context.Context, actor Actor, id uint64) (*AnnouncementItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	row, err := s.repo.GetAnnouncement(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, "公告不存在", "加载公告失败")
	}
	if !fullAccess && !targetsManaged(row.AudienceType, announcementTargetIDs(*row), groupIDs) {
		return nil, forbidden("只能管理负责用户组的公告")
	}
	item := announcementItem(*row)
	return &item, nil
}

func (s *Service) CreateAnnouncement(ctx context.Context, actor Actor, input AnnouncementInput) (*AnnouncementItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if err := s.validateAnnouncement(ctx, &input, groupIDs, fullAccess); err != nil {
		return nil, err
	}
	row := &model.Announcement{
		Title: input.Title, Summary: nullableString(input.Summary), Content: input.Content,
		Category: input.Category, Status: input.Status, IsPinned: input.IsPinned,
		PublishAt: input.PublishAt, ExpireAt: input.ExpireAt, AudienceType: input.AudienceType,
		CreatorID: actor.ID, UpdatedByID: actor.ID,
	}
	if err := s.repo.CreateAnnouncement(ctx, row, input.TargetGroupIDs); err != nil {
		return nil, internalError("创建公告失败", err)
	}
	created, err := s.repo.GetAnnouncement(ctx, row.ID)
	if err != nil {
		return nil, internalError("加载公告失败", err)
	}
	item := announcementItem(*created)
	return &item, nil
}

func (s *Service) UpdateAnnouncement(ctx context.Context, actor Actor, id uint64, input AnnouncementInput) (*AnnouncementItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	existing, err := s.repo.GetAnnouncement(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, "公告不存在", "加载公告失败")
	}
	if !fullAccess && !targetsManaged(existing.AudienceType, announcementTargetIDs(*existing), groupIDs) {
		return nil, forbidden("只能管理负责用户组的公告")
	}
	if err := s.validateAnnouncement(ctx, &input, groupIDs, fullAccess); err != nil {
		return nil, err
	}
	updates := map[string]any{
		"title": input.Title, "summary": nullableString(input.Summary), "content": input.Content,
		"category": input.Category, "status": input.Status, "is_pinned": input.IsPinned,
		"publish_at": input.PublishAt, "expire_at": input.ExpireAt, "audience_type": input.AudienceType,
		"updated_by_id": actor.ID,
	}
	if err := s.repo.UpdateAnnouncement(ctx, id, updates, input.TargetGroupIDs); err != nil {
		return nil, internalError("更新公告失败", err)
	}
	updated, err := s.repo.GetAnnouncement(ctx, id)
	if err != nil {
		return nil, internalError("加载公告失败", err)
	}
	item := announcementItem(*updated)
	return &item, nil
}

func (s *Service) DeleteAnnouncement(ctx context.Context, actor Actor, id uint64) error {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return err
	}
	existing, err := s.repo.GetAnnouncement(ctx, id)
	if err != nil {
		return mapNotFound(err, "公告不存在", "加载公告失败")
	}
	if !fullAccess && !targetsManaged(existing.AudienceType, announcementTargetIDs(*existing), groupIDs) {
		return forbidden("只能管理负责用户组的公告")
	}
	if err := s.repo.DeleteAnnouncement(ctx, id); err != nil {
		return internalError("删除公告失败", err)
	}
	return nil
}

func (s *Service) GetHome(ctx context.Context, actor Actor) (*HomeData, error) {
	if actor.ID == 0 {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "未登录"}
	}
	now := s.now()
	allGroups := actor.RoleName == model.RoleNameSuperAdmin
	rows, err := s.repo.ListVisibleAnnouncements(ctx, actor.ID, now, 3, allGroups)
	if err != nil {
		return nil, internalError("获取主页公告失败", err)
	}
	events, err := s.repo.ListVisibleEvents(ctx, actor.ID, weekBounds(now), 50, allGroups)
	if err != nil {
		return nil, internalError("获取本周日程失败", err)
	}
	links, err := s.repo.ListVisibleLinks(ctx, actor.ID, allGroups)
	if err != nil {
		return nil, internalError("获取主页快捷链接失败", err)
	}
	return &HomeData{Announcements: announcementItems(rows), Events: eventItems(events), Links: linkItems(links), GeneratedAt: now}, nil
}

func (s *Service) validateAnnouncement(ctx context.Context, input *AnnouncementInput, managedGroupIDs []uint64, fullAccess bool) error {
	input.Title = strings.TrimSpace(input.Title)
	input.Summary = strings.TrimSpace(input.Summary)
	input.Content = strings.TrimSpace(input.Content)
	input.Category = strings.TrimSpace(input.Category)
	input.Status = strings.TrimSpace(input.Status)
	input.AudienceType = strings.TrimSpace(input.AudienceType)
	if input.Title == "" || utf8.RuneCountInString(input.Title) > 200 {
		return badRequest("公告标题不能为空且不能超过 200 个字符")
	}
	if input.Content == "" {
		return badRequest("公告正文不能为空")
	}
	if utf8.RuneCountInString(input.Summary) > 500 {
		return badRequest("公告摘要不能超过 500 个字符")
	}
	if _, ok := allowedAnnouncementCategories[input.Category]; !ok {
		return badRequest("公告分类不合法")
	}
	if !validAnnouncementStatus(input.Status) {
		return badRequest("公告状态不合法")
	}
	if input.AudienceType != model.PortalAudienceAll && input.AudienceType != model.PortalAudienceGroups {
		return badRequest("公告可见范围不合法")
	}
	if !fullAccess && input.AudienceType != model.PortalAudienceGroups {
		return forbidden("组长只能创建指定组可见公告")
	}
	if input.PublishAt != nil && input.ExpireAt != nil && !input.ExpireAt.After(*input.PublishAt) {
		return badRequest("公告失效时间必须晚于发布时间")
	}
	input.TargetGroupIDs = uniqueIDs(input.TargetGroupIDs)
	if input.AudienceType == model.PortalAudienceAll {
		input.TargetGroupIDs = nil
		return nil
	}
	if len(input.TargetGroupIDs) == 0 {
		return badRequest("指定组可见公告必须选择至少一个用户组")
	}
	if !fullAccess && !allIDsManaged(input.TargetGroupIDs, managedGroupIDs) {
		return forbidden("只能选择自己负责的用户组")
	}
	count, err := s.repo.CountActiveGroups(ctx, input.TargetGroupIDs)
	if err != nil {
		return internalError("校验用户组失败", err)
	}
	if count != int64(len(input.TargetGroupIDs)) {
		return badRequest("包含无效或已停用的用户组")
	}
	return nil
}

func announcementItems(rows []model.Announcement) []AnnouncementItem {
	items := make([]AnnouncementItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, announcementItem(row))
	}
	return items
}

func announcementItem(row model.Announcement) AnnouncementItem {
	groupIDs := make([]uint64, 0, len(row.TargetGroups))
	for _, target := range row.TargetGroups {
		groupIDs = append(groupIDs, target.GroupID)
	}
	sort.Slice(groupIDs, func(i, j int) bool { return groupIDs[i] < groupIDs[j] })
	summary := ""
	if row.Summary != nil {
		summary = strings.TrimSpace(*row.Summary)
	}
	if summary == "" {
		summary = summarize(row.Content, 96)
	}
	return AnnouncementItem{
		ID: row.ID, Title: row.Title, Summary: summary, Content: row.Content, Category: row.Category,
		Status: row.Status, IsPinned: row.IsPinned, PublishAt: row.PublishAt, ExpireAt: row.ExpireAt,
		AudienceType: row.AudienceType, TargetGroupIDs: groupIDs, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func summarize(content string, limit int) string {
	text := strings.Join(strings.Fields(strings.TrimSpace(content)), " ")
	if utf8.RuneCountInString(text) <= limit {
		return text
	}
	return string([]rune(text)[:limit]) + "…"
}

func requireSuperAdmin(actor Actor) error {
	if actor.ID == 0 || actor.RoleName != model.RoleNameSuperAdmin {
		return &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以维护门户内容"}
	}
	return nil
}

func (s *Service) portalScope(ctx context.Context, actor Actor) ([]uint64, bool, error) {
	if actor.ID == 0 {
		return nil, false, &ServiceError{Status: http.StatusUnauthorized, Message: "未登录"}
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		return nil, true, nil
	}
	if actor.RoleName != model.RoleNameAdmin {
		return nil, false, forbidden("仅超级管理员或组长可以维护公告和日程")
	}
	groupIDs, err := s.repo.ListLeaderGroupIDs(ctx, actor.ID)
	if err != nil {
		return nil, false, internalError("加载组长负责用户组失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, false, forbidden("当前账号不是任何用户组组长")
	}
	return groupIDs, false, nil
}

func (s *Service) ListManagedGroups(ctx context.Context, actor Actor) ([]ManagedGroupItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if fullAccess {
		return nil, forbidden("超级管理员请使用用户分组列表")
	}
	groups, err := s.repo.ListManagedGroups(ctx, groupIDs)
	if err != nil {
		return nil, internalError("加载负责用户组失败", err)
	}
	items := make([]ManagedGroupItem, 0, len(groups))
	for _, group := range groups {
		items = append(items, ManagedGroupItem{ID: group.ID, Name: group.Name})
	}
	return items, nil
}

type ManagedGroupItem struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

func announcementTargetIDs(row model.Announcement) []uint64 {
	ids := make([]uint64, 0, len(row.TargetGroups))
	for _, target := range row.TargetGroups {
		ids = append(ids, target.GroupID)
	}
	return ids
}

func allIDsManaged(ids, managed []uint64) bool {
	allowed := make(map[uint64]struct{}, len(managed))
	for _, id := range managed {
		allowed[id] = struct{}{}
	}
	for _, id := range ids {
		if _, ok := allowed[id]; !ok {
			return false
		}
	}
	return true
}

func targetsManaged(audience string, targets, managed []uint64) bool {
	return audience == model.PortalAudienceGroups && len(targets) > 0 && allIDsManaged(targets, managed)
}

func validAnnouncementStatus(status string) bool {
	return status == model.AnnouncementStatusDraft || status == model.AnnouncementStatusPublished || status == model.AnnouncementStatusArchived
}

func uniqueIDs(ids []uint64) []uint64 {
	seen := make(map[uint64]struct{}, len(ids))
	result := make([]uint64, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	return result
}

func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func badRequest(message string) error {
	return &ServiceError{Status: http.StatusBadRequest, Message: message}
}
func forbidden(message string) error {
	return &ServiceError{Status: http.StatusForbidden, Message: message}
}
func internalError(message string, err error) error {
	return &ServiceError{Status: http.StatusInternalServerError, Message: message, Err: err}
}
func mapNotFound(err error, notFoundMessage string, internalMessage string) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &ServiceError{Status: http.StatusNotFound, Message: notFoundMessage}
	}
	return internalError(internalMessage, err)
}
