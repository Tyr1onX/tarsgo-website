package portal

import (
	"context"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"tarsgo-backend/model"
)

var allowedLinkIcons = map[string]struct{}{"book": {}, "folder": {}, "home": {}, "external": {}, "link": {}}

type LinkInput struct {
	Name            string
	URL             string
	IconKey         string
	SortOrder       int
	IsEnabled       bool
	OpenInNewWindow bool
	AudienceType    string
	TargetGroupIDs  []uint64
}

type LinkItem struct {
	ID              uint64    `json:"id"`
	Name            string    `json:"name"`
	URL             string    `json:"url"`
	IconKey         string    `json:"iconKey"`
	SortOrder       int       `json:"sortOrder"`
	IsEnabled       bool      `json:"isEnabled"`
	OpenInNewWindow bool      `json:"openInNewWindow"`
	AudienceType    string    `json:"audienceType"`
	TargetGroupIDs  []uint64  `json:"targetGroupIds"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (s *Service) ListLinks(ctx context.Context, actor Actor) ([]LinkItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	var scope []uint64
	if !fullAccess {
		scope = groupIDs
	}
	rows, err := s.repo.ListLinks(ctx, scope)
	if err != nil {
		return nil, internalError("查询快捷链接失败", err)
	}
	return linkItems(rows), nil
}

func (s *Service) GetLink(ctx context.Context, actor Actor, id uint64) (*LinkItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	row, err := s.repo.GetLink(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, "快捷链接不存在", "加载快捷链接失败")
	}
	if !fullAccess && !targetsManaged(row.AudienceType, linkTargetIDs(*row), groupIDs) {
		return nil, forbidden("只能管理负责用户组的快捷链接")
	}
	item := linkItem(*row)
	return &item, nil
}

func (s *Service) CreateLink(ctx context.Context, actor Actor, input LinkInput) (*LinkItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if err := s.validateLink(ctx, &input, groupIDs, fullAccess); err != nil {
		return nil, err
	}
	row := &model.PortalLink{Name: input.Name, URL: input.URL, IconKey: input.IconKey, SortOrder: input.SortOrder, IsEnabled: input.IsEnabled, OpenInNewWindow: input.OpenInNewWindow, AudienceType: input.AudienceType, CreatorID: actor.ID, UpdatedByID: actor.ID}
	if err := s.repo.CreateLink(ctx, row, input.TargetGroupIDs); err != nil {
		return nil, internalError("创建快捷链接失败", err)
	}
	created, err := s.repo.GetLink(ctx, row.ID)
	if err != nil {
		return nil, internalError("加载快捷链接失败", err)
	}
	item := linkItem(*created)
	return &item, nil
}

func (s *Service) UpdateLink(ctx context.Context, actor Actor, id uint64, input LinkInput) (*LinkItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	existing, err := s.repo.GetLink(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, "快捷链接不存在", "加载快捷链接失败")
	}
	if !fullAccess && !targetsManaged(existing.AudienceType, linkTargetIDs(*existing), groupIDs) {
		return nil, forbidden("只能管理负责用户组的快捷链接")
	}
	if err := s.validateLink(ctx, &input, groupIDs, fullAccess); err != nil {
		return nil, err
	}
	updates := map[string]any{"name": input.Name, "url": input.URL, "icon_key": input.IconKey, "sort_order": input.SortOrder, "is_enabled": input.IsEnabled, "open_in_new_window": input.OpenInNewWindow, "audience_type": input.AudienceType, "updated_by_id": actor.ID}
	if err := s.repo.UpdateLink(ctx, id, updates, input.TargetGroupIDs); err != nil {
		return nil, internalError("更新快捷链接失败", err)
	}
	updated, err := s.repo.GetLink(ctx, id)
	if err != nil {
		return nil, internalError("加载快捷链接失败", err)
	}
	item := linkItem(*updated)
	return &item, nil
}

func (s *Service) DeleteLink(ctx context.Context, actor Actor, id uint64) error {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return err
	}
	existing, err := s.repo.GetLink(ctx, id)
	if err != nil {
		return mapNotFound(err, "快捷链接不存在", "加载快捷链接失败")
	}
	if !fullAccess && !targetsManaged(existing.AudienceType, linkTargetIDs(*existing), groupIDs) {
		return forbidden("只能管理负责用户组的快捷链接")
	}
	if err := s.repo.DeleteLink(ctx, id); err != nil {
		return internalError("删除快捷链接失败", err)
	}
	return nil
}

func (s *Service) validateLink(ctx context.Context, input *LinkInput, managedGroupIDs []uint64, fullAccess bool) error {
	input.Name, input.URL, input.IconKey, input.AudienceType = strings.TrimSpace(input.Name), strings.TrimSpace(input.URL), strings.TrimSpace(input.IconKey), strings.TrimSpace(input.AudienceType)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 120 {
		return badRequest("快捷链接名称不能为空且不能超过 120 个字符")
	}
	if !validPortalURL(input.URL) {
		return badRequest("链接只允许站内路径或 https:// 外链")
	}
	if input.URL == "/dashboard/users/registrations" {
		return badRequest("纳新报名是系统入口，不能配置为普通快捷链接")
	}
	if _, ok := allowedLinkIcons[input.IconKey]; !ok {
		return badRequest("快捷链接图标不合法")
	}
	if input.AudienceType != model.PortalAudienceAll && input.AudienceType != model.PortalAudienceGroups {
		return badRequest("快捷链接可见范围不合法")
	}
	if !fullAccess && input.AudienceType != model.PortalAudienceGroups {
		return forbidden("组长只能创建指定组可见快捷链接")
	}
	input.TargetGroupIDs = uniqueIDs(input.TargetGroupIDs)
	if input.AudienceType == model.PortalAudienceAll {
		input.TargetGroupIDs = nil
		return nil
	}
	if len(input.TargetGroupIDs) == 0 {
		return badRequest("指定组可见链接必须选择至少一个用户组")
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

func validPortalURL(value string) bool {
	if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		return true
	}
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}

func linkItems(rows []model.PortalLink) []LinkItem {
	items := make([]LinkItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, linkItem(row))
	}
	return items
}
func linkItem(row model.PortalLink) LinkItem {
	groups := make([]uint64, 0, len(row.TargetGroups))
	for _, target := range row.TargetGroups {
		groups = append(groups, target.GroupID)
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i] < groups[j] })
	return LinkItem{ID: row.ID, Name: row.Name, URL: row.URL, IconKey: row.IconKey, SortOrder: row.SortOrder, IsEnabled: row.IsEnabled, OpenInNewWindow: row.OpenInNewWindow, AudienceType: row.AudienceType, TargetGroupIDs: groups, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func linkTargetIDs(row model.PortalLink) []uint64 {
	ids := make([]uint64, 0, len(row.TargetGroups))
	for _, target := range row.TargetGroups {
		ids = append(ids, target.GroupID)
	}
	return ids
}
