package portal

import (
	"context"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"tarsgo-backend/model"
)

type EventInput struct {
	Title          string
	Description    string
	Location       string
	StartsAt       time.Time
	EndsAt         time.Time
	Status         string
	AudienceType   string
	TargetGroupIDs []uint64
}

type ListEventsInput struct {
	Status        string
	Page          int
	PageSize      int
	ScopeGroupIDs []uint64
}

type EventItem struct {
	ID             uint64    `json:"id"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Location       string    `json:"location"`
	StartsAt       time.Time `json:"startsAt"`
	EndsAt         time.Time `json:"endsAt"`
	Status         string    `json:"status"`
	AudienceType   string    `json:"audienceType"`
	TargetGroupIDs []uint64  `json:"targetGroupIds"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type EventList struct {
	Items    []EventItem `json:"items"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
	Total    int64       `json:"total"`
}

type TimeRange struct{ Start, End time.Time }

func (s *Service) ListEvents(ctx context.Context, actor Actor, input ListEventsInput) (*EventList, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if !fullAccess {
		input.ScopeGroupIDs = groupIDs
	}
	if input.Status != "" && !validEventStatus(input.Status) {
		return nil, badRequest("日程状态不合法")
	}
	if input.Page < 1 {
		input.Page = 1
	}
	if input.PageSize < 1 || input.PageSize > 100 {
		input.PageSize = 20
	}
	rows, total, err := s.repo.ListEvents(ctx, input)
	if err != nil {
		return nil, internalError("查询日程列表失败", err)
	}
	return &EventList{Items: eventItems(rows), Page: input.Page, PageSize: input.PageSize, Total: total}, nil
}

func (s *Service) GetEvent(ctx context.Context, actor Actor, id uint64) (*EventItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	row, err := s.repo.GetEvent(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, "日程不存在", "加载日程失败")
	}
	if !fullAccess && !targetsManaged(row.AudienceType, eventTargetIDs(*row), groupIDs) {
		return nil, forbidden("只能管理负责用户组的日程")
	}
	item := eventItem(*row)
	return &item, nil
}

func (s *Service) CreateEvent(ctx context.Context, actor Actor, input EventInput) (*EventItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if err := s.validateEvent(ctx, &input, groupIDs, fullAccess); err != nil {
		return nil, err
	}
	row := &model.TeamEvent{Title: input.Title, Description: nullableString(input.Description), Location: nullableString(input.Location), StartsAt: input.StartsAt, EndsAt: input.EndsAt, Status: input.Status, AudienceType: input.AudienceType, CreatorID: actor.ID, UpdatedByID: actor.ID}
	if err := s.repo.CreateEvent(ctx, row, input.TargetGroupIDs); err != nil {
		return nil, internalError("创建日程失败", err)
	}
	created, err := s.repo.GetEvent(ctx, row.ID)
	if err != nil {
		return nil, internalError("加载日程失败", err)
	}
	item := eventItem(*created)
	return &item, nil
}

func (s *Service) UpdateEvent(ctx context.Context, actor Actor, id uint64, input EventInput) (*EventItem, error) {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	existing, err := s.repo.GetEvent(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, "日程不存在", "加载日程失败")
	}
	if !fullAccess && !targetsManaged(existing.AudienceType, eventTargetIDs(*existing), groupIDs) {
		return nil, forbidden("只能管理负责用户组的日程")
	}
	if err := s.validateEvent(ctx, &input, groupIDs, fullAccess); err != nil {
		return nil, err
	}
	updates := map[string]any{"title": input.Title, "description": nullableString(input.Description), "location": nullableString(input.Location), "starts_at": input.StartsAt, "ends_at": input.EndsAt, "status": input.Status, "audience_type": input.AudienceType, "updated_by_id": actor.ID}
	if err := s.repo.UpdateEvent(ctx, id, updates, input.TargetGroupIDs); err != nil {
		return nil, internalError("更新日程失败", err)
	}
	updated, err := s.repo.GetEvent(ctx, id)
	if err != nil {
		return nil, internalError("加载日程失败", err)
	}
	item := eventItem(*updated)
	return &item, nil
}

func (s *Service) DeleteEvent(ctx context.Context, actor Actor, id uint64) error {
	groupIDs, fullAccess, err := s.portalScope(ctx, actor)
	if err != nil {
		return err
	}
	existing, err := s.repo.GetEvent(ctx, id)
	if err != nil {
		return mapNotFound(err, "日程不存在", "加载日程失败")
	}
	if !fullAccess && !targetsManaged(existing.AudienceType, eventTargetIDs(*existing), groupIDs) {
		return forbidden("只能管理负责用户组的日程")
	}
	if err := s.repo.DeleteEvent(ctx, id, actor.ID); err != nil {
		return internalError("删除日程失败", err)
	}
	return nil
}

func (s *Service) validateEvent(ctx context.Context, input *EventInput, managedGroupIDs []uint64, fullAccess bool) error {
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.Location = strings.TrimSpace(input.Location)
	input.Status = strings.TrimSpace(input.Status)
	input.AudienceType = strings.TrimSpace(input.AudienceType)
	if input.Title == "" || utf8.RuneCountInString(input.Title) > 200 {
		return badRequest("日程标题不能为空且不能超过 200 个字符")
	}
	if utf8.RuneCountInString(input.Description) > 2000 || utf8.RuneCountInString(input.Location) > 300 {
		return badRequest("日程说明或地点过长")
	}
	if input.StartsAt.IsZero() || input.EndsAt.IsZero() || !input.EndsAt.After(input.StartsAt) {
		return badRequest("日程结束时间必须晚于开始时间")
	}
	if !validEventStatus(input.Status) {
		return badRequest("日程状态不合法")
	}
	if input.AudienceType != model.PortalAudienceAll && input.AudienceType != model.PortalAudienceGroups {
		return badRequest("日程可见范围不合法")
	}
	if !fullAccess && input.AudienceType != model.PortalAudienceGroups {
		return forbidden("组长只能创建指定组可见日程")
	}
	input.TargetGroupIDs = uniqueIDs(input.TargetGroupIDs)
	if input.AudienceType == model.PortalAudienceAll {
		input.TargetGroupIDs = nil
		return nil
	}
	if len(input.TargetGroupIDs) == 0 {
		return badRequest("指定组可见日程必须选择至少一个用户组")
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

func validEventStatus(status string) bool {
	return status == model.TeamEventStatusDraft || status == model.TeamEventStatusPublished || status == model.TeamEventStatusCancelled
}

func weekBounds(value time.Time) TimeRange {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		panic(err)
	}
	local := value.In(location)
	dayStart := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
	daysSinceMonday := (int(local.Weekday()) + 6) % 7
	start := dayStart.AddDate(0, 0, -daysSinceMonday)
	return TimeRange{Start: start, End: start.AddDate(0, 0, 7)}
}

func eventItems(rows []model.TeamEvent) []EventItem {
	items := make([]EventItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, eventItem(row))
	}
	return items
}

func eventItem(row model.TeamEvent) EventItem {
	groupIDs := make([]uint64, 0, len(row.TargetGroups))
	for _, target := range row.TargetGroups {
		groupIDs = append(groupIDs, target.GroupID)
	}
	sort.Slice(groupIDs, func(i, j int) bool { return groupIDs[i] < groupIDs[j] })
	description, location := "", ""
	if row.Description != nil {
		description = *row.Description
	}
	if row.Location != nil {
		location = *row.Location
	}
	return EventItem{ID: row.ID, Title: row.Title, Description: description, Location: location, StartsAt: row.StartsAt, EndsAt: row.EndsAt, Status: row.Status, AudienceType: row.AudienceType, TargetGroupIDs: groupIDs, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func eventTargetIDs(row model.TeamEvent) []uint64 {
	ids := make([]uint64, 0, len(row.TargetGroups))
	for _, target := range row.TargetGroups {
		ids = append(ids, target.GroupID)
	}
	return ids
}
