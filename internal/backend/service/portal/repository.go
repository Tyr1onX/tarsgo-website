package portal

import (
	"context"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type Repository interface {
	ListLeaderGroupIDs(context.Context, uint64) ([]uint64, error)
	ListManagedGroups(context.Context, []uint64) ([]model.UserGroup, error)
	ListAnnouncements(context.Context, ListAnnouncementsInput) ([]model.Announcement, int64, error)
	GetAnnouncement(context.Context, uint64) (*model.Announcement, error)
	CreateAnnouncement(context.Context, *model.Announcement, []uint64) error
	UpdateAnnouncement(context.Context, uint64, map[string]any, []uint64) error
	DeleteAnnouncement(context.Context, uint64) error
	CountActiveGroups(context.Context, []uint64) (int64, error)
	ListVisibleAnnouncements(context.Context, uint64, time.Time, int, bool) ([]model.Announcement, error)
	ListEvents(context.Context, ListEventsInput) ([]model.TeamEvent, int64, error)
	GetEvent(context.Context, uint64) (*model.TeamEvent, error)
	CreateEvent(context.Context, *model.TeamEvent, []uint64) error
	UpdateEvent(context.Context, uint64, map[string]any, []uint64) error
	DeleteEvent(context.Context, uint64) error
	ListVisibleEvents(context.Context, uint64, TimeRange, int, bool) ([]model.TeamEvent, error)
	ListLinks(context.Context, []uint64) ([]model.PortalLink, error)
	GetLink(context.Context, uint64) (*model.PortalLink, error)
	CreateLink(context.Context, *model.PortalLink, []uint64) error
	UpdateLink(context.Context, uint64, map[string]any, []uint64) error
	DeleteLink(context.Context, uint64) error
	ListVisibleLinks(context.Context, uint64, bool) ([]model.PortalLink, error)
}

func (r *GormRepository) ListEvents(ctx context.Context, input ListEventsInput) ([]model.TeamEvent, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.TeamEvent{})
	if input.Status != "" {
		query = query.Where("status = ?", input.Status)
	}
	if input.ScopeGroupIDs != nil {
		if len(input.ScopeGroupIDs) == 0 {
			query = query.Where("1 = 0")
		} else {
			query = query.Where("audience_type = ? AND EXISTS (SELECT 1 FROM team_event_target_groups WHERE team_event_target_groups.event_id = team_events.id AND team_event_target_groups.group_id IN ?) AND NOT EXISTS (SELECT 1 FROM team_event_target_groups AS outside_groups WHERE outside_groups.event_id = team_events.id AND outside_groups.group_id NOT IN ?)", model.PortalAudienceGroups, input.ScopeGroupIDs, input.ScopeGroupIDs)
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []model.TeamEvent
	err := query.Session(&gorm.Session{}).Preload("TargetGroups").Order("starts_at DESC").Offset((input.Page - 1) * input.PageSize).Limit(input.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *GormRepository) GetEvent(ctx context.Context, id uint64) (*model.TeamEvent, error) {
	var row model.TeamEvent
	if err := r.db.WithContext(ctx).Preload("TargetGroups").First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *GormRepository) CreateEvent(ctx context.Context, row *model.TeamEvent, groupIDs []uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		if err := createEventTargets(tx, row.ID, groupIDs); err != nil {
			return err
		}
		if row.Status == model.TeamEventStatusPublished {
			return createPortalActivity(tx, model.ActivityEventPublished, row.UpdatedByID, "team_event", row.ID, row.Title)
		}
		return nil
	})
}

func (r *GormRepository) UpdateEvent(ctx context.Context, id uint64, updates map[string]any, groupIDs []uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var previous model.TeamEvent
		if err := tx.Select("status").First(&previous, id).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.TeamEvent{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Where("event_id = ?", id).Delete(&model.TeamEventTargetGroup{}).Error; err != nil {
			return err
		}
		if err := createEventTargets(tx, id, groupIDs); err != nil {
			return err
		}
		status, _ := updates["status"].(string)
		actorID, _ := updates["updated_by_id"].(uint64)
		title, _ := updates["title"].(string)
		if status != previous.Status && status == model.TeamEventStatusPublished {
			return createPortalActivity(tx, model.ActivityEventPublished, actorID, "team_event", id, title)
		}
		if status != previous.Status && status == model.TeamEventStatusCancelled {
			return createPortalActivity(tx, model.ActivityEventCancelled, actorID, "team_event", id, title)
		}
		return nil
	})
}

func createEventTargets(tx *gorm.DB, eventID uint64, groupIDs []uint64) error {
	if len(groupIDs) == 0 {
		return nil
	}
	rows := make([]model.TeamEventTargetGroup, 0, len(groupIDs))
	for _, groupID := range groupIDs {
		rows = append(rows, model.TeamEventTargetGroup{EventID: eventID, GroupID: groupID})
	}
	return tx.Create(&rows).Error
}

func (r *GormRepository) DeleteEvent(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Delete(&model.TeamEvent{}, id).Error
}

func (r *GormRepository) ListVisibleEvents(ctx context.Context, userID uint64, week TimeRange, limit int, allGroups bool) ([]model.TeamEvent, error) {
	var rows []model.TeamEvent
	query := r.db.WithContext(ctx).Where("status = ?", model.TeamEventStatusPublished).
		Where("starts_at < ? AND ends_at > ?", week.End, week.Start).
		Preload("TargetGroups").Order("starts_at ASC").Limit(limit)
	if !allGroups {
		membershipGroups := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).Select("group_id").Where("user_id = ?", userID)
		targeted := r.db.WithContext(ctx).Model(&model.TeamEventTargetGroup{}).Select("event_id").Where("group_id IN (?)", membershipGroups)
		query = query.Where("audience_type = ? OR id IN (?)", model.PortalAudienceAll, targeted)
	}
	err := query.Find(&rows).Error
	return rows, err
}

type GormRepository struct{ db *gorm.DB }

func (r *GormRepository) ListLinks(ctx context.Context, scopeGroupIDs []uint64) ([]model.PortalLink, error) {
	query := r.db.WithContext(ctx).Model(&model.PortalLink{})
	if scopeGroupIDs != nil {
		if len(scopeGroupIDs) == 0 {
			query = query.Where("1 = 0")
		} else {
			query = query.Where("audience_type = ? AND EXISTS (SELECT 1 FROM portal_link_target_groups WHERE portal_link_target_groups.link_id = portal_links.id AND portal_link_target_groups.group_id IN ?) AND NOT EXISTS (SELECT 1 FROM portal_link_target_groups AS outside_groups WHERE outside_groups.link_id = portal_links.id AND outside_groups.group_id NOT IN ?)", model.PortalAudienceGroups, scopeGroupIDs, scopeGroupIDs)
		}
	}
	var rows []model.PortalLink
	err := query.Preload("TargetGroups").Order("sort_order ASC").Order("id ASC").Find(&rows).Error
	return rows, err
}

func (r *GormRepository) GetLink(ctx context.Context, id uint64) (*model.PortalLink, error) {
	var row model.PortalLink
	if err := r.db.WithContext(ctx).Preload("TargetGroups").First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *GormRepository) CreateLink(ctx context.Context, row *model.PortalLink, groupIDs []uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		return createLinkTargets(tx, row.ID, groupIDs)
	})
}

func (r *GormRepository) UpdateLink(ctx context.Context, id uint64, updates map[string]any, groupIDs []uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.PortalLink{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Where("link_id = ?", id).Delete(&model.PortalLinkTargetGroup{}).Error; err != nil {
			return err
		}
		return createLinkTargets(tx, id, groupIDs)
	})
}

func createLinkTargets(tx *gorm.DB, linkID uint64, groupIDs []uint64) error {
	if len(groupIDs) == 0 {
		return nil
	}
	rows := make([]model.PortalLinkTargetGroup, 0, len(groupIDs))
	for _, groupID := range groupIDs {
		rows = append(rows, model.PortalLinkTargetGroup{LinkID: linkID, GroupID: groupID})
	}
	return tx.Create(&rows).Error
}

func (r *GormRepository) DeleteLink(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Delete(&model.PortalLink{}, id).Error
}

func (r *GormRepository) ListVisibleLinks(ctx context.Context, userID uint64, allGroups bool) ([]model.PortalLink, error) {
	var rows []model.PortalLink
	query := r.db.WithContext(ctx).Where("is_enabled = ?", true)
	if !allGroups {
		membershipGroups := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).Select("group_id").Where("user_id = ?", userID)
		targeted := r.db.WithContext(ctx).Model(&model.PortalLinkTargetGroup{}).Select("link_id").Where("group_id IN (?)", membershipGroups)
		query = query.Where("audience_type = ? OR id IN (?)", model.PortalAudienceAll, targeted)
	}
	err := query.Preload("TargetGroups").Order("sort_order ASC").Order("id ASC").Find(&rows).Error
	return rows, err
}

func NewRepository(db *gorm.DB) Repository { return &GormRepository{db: db} }

func (r *GormRepository) ListAnnouncements(ctx context.Context, input ListAnnouncementsInput) ([]model.Announcement, int64, error) {
	query := r.db.WithContext(ctx).Model(&model.Announcement{})
	if input.Status != "" {
		query = query.Where("status = ?", input.Status)
	}
	if input.ScopeGroupIDs != nil {
		if len(input.ScopeGroupIDs) == 0 {
			query = query.Where("1 = 0")
		} else {
			query = query.Where("audience_type = ? AND EXISTS (SELECT 1 FROM announcement_target_groups WHERE announcement_target_groups.announcement_id = announcements.id AND announcement_target_groups.group_id IN ?) AND NOT EXISTS (SELECT 1 FROM announcement_target_groups AS outside_groups WHERE outside_groups.announcement_id = announcements.id AND outside_groups.group_id NOT IN ?)", model.PortalAudienceGroups, input.ScopeGroupIDs, input.ScopeGroupIDs)
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []model.Announcement
	err := query.Session(&gorm.Session{}).Preload("TargetGroups").Order("created_at DESC").
		Offset((input.Page - 1) * input.PageSize).Limit(input.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *GormRepository) GetAnnouncement(ctx context.Context, id uint64) (*model.Announcement, error) {
	var row model.Announcement
	if err := r.db.WithContext(ctx).Preload("TargetGroups").First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *GormRepository) CreateAnnouncement(ctx context.Context, row *model.Announcement, groupIDs []uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		if err := createAnnouncementTargets(tx, row.ID, groupIDs); err != nil {
			return err
		}
		if row.Status == model.AnnouncementStatusPublished {
			return createPortalActivity(tx, model.ActivityAnnouncementPublished, row.UpdatedByID, "announcement", row.ID, row.Title)
		}
		return nil
	})
}

func (r *GormRepository) UpdateAnnouncement(ctx context.Context, id uint64, updates map[string]any, groupIDs []uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var previous model.Announcement
		if err := tx.Select("status").First(&previous, id).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.Announcement{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Where("announcement_id = ?", id).Delete(&model.AnnouncementTargetGroup{}).Error; err != nil {
			return err
		}
		if err := createAnnouncementTargets(tx, id, groupIDs); err != nil {
			return err
		}
		status, _ := updates["status"].(string)
		actorID, _ := updates["updated_by_id"].(uint64)
		title, _ := updates["title"].(string)
		if status != previous.Status && status == model.AnnouncementStatusPublished {
			return createPortalActivity(tx, model.ActivityAnnouncementPublished, actorID, "announcement", id, title)
		}
		if status != previous.Status && status == model.AnnouncementStatusArchived {
			return createPortalActivity(tx, model.ActivityAnnouncementArchived, actorID, "announcement", id, title)
		}
		return nil
	})
}

func createAnnouncementTargets(tx *gorm.DB, announcementID uint64, groupIDs []uint64) error {
	if len(groupIDs) == 0 {
		return nil
	}
	rows := make([]model.AnnouncementTargetGroup, 0, len(groupIDs))
	for _, groupID := range groupIDs {
		rows = append(rows, model.AnnouncementTargetGroup{AnnouncementID: announcementID, GroupID: groupID})
	}
	return tx.Create(&rows).Error
}

func createPortalActivity(tx *gorm.DB, actionKey string, actorID uint64, entityType string, entityID uint64, title string) error {
	return tx.Create(&model.ActivityEvent{ActionKey: actionKey, ActorID: &actorID, EntityType: &entityType, EntityID: &entityID, Metadata: map[string]any{"title": title}}).Error
}

func (r *GormRepository) DeleteAnnouncement(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Delete(&model.Announcement{}, id).Error
}

func (r *GormRepository) CountActiveGroups(ctx context.Context, groupIDs []uint64) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.UserGroup{}).
		Where("id IN ? AND status = ?", groupIDs, model.UserGroupStatusActive).Count(&count).Error
	return count, err
}

func (r *GormRepository) ListLeaderGroupIDs(ctx context.Context, userID uint64) ([]uint64, error) {
	var groupIDs []uint64
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Where("user_group_members.user_id = ? AND user_group_members.role = ? AND user_groups.status = ?", userID, model.UserGroupMemberRoleLeader, model.UserGroupStatusActive).
		Order("user_group_members.group_id ASC").Pluck("user_group_members.group_id", &groupIDs).Error
	return groupIDs, err
}

func (r *GormRepository) ListManagedGroups(ctx context.Context, groupIDs []uint64) ([]model.UserGroup, error) {
	var groups []model.UserGroup
	err := r.db.WithContext(ctx).Where("id IN ? AND status = ?", groupIDs, model.UserGroupStatusActive).Order("name ASC").Find(&groups).Error
	return groups, err
}

func (r *GormRepository) ListVisibleAnnouncements(ctx context.Context, userID uint64, now time.Time, limit int, allGroups bool) ([]model.Announcement, error) {
	var rows []model.Announcement
	query := r.db.WithContext(ctx).
		Where("status = ?", model.AnnouncementStatusPublished).
		Where("publish_at IS NULL OR publish_at <= ?", now).
		Where("expire_at IS NULL OR expire_at > ?", now).
		Preload("TargetGroups").Order("is_pinned DESC").Order("COALESCE(publish_at, created_at) DESC").
		Limit(limit)
	if !allGroups {
		membershipGroups := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).Select("group_id").Where("user_id = ?", userID)
		targeted := r.db.WithContext(ctx).Model(&model.AnnouncementTargetGroup{}).Select("announcement_id").Where("group_id IN (?)", membershipGroups)
		query = query.Where("audience_type = ? OR id IN (?)", model.PortalAudienceAll, targeted)
	}
	err := query.Find(&rows).Error
	return rows, err
}
