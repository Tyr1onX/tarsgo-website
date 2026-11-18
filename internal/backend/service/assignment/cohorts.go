package assignment

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// Cohorts are existing recruitment forms, not a second membership system.
func (s *Service) ListCohorts(ctx context.Context, actor Actor, groupID uint64) ([]CohortOption, error) {
	if err := s.requireManagerGroupAccess(ctx, actor, groupID); err != nil {
		return nil, err
	}
	return cohortOptions(s.db.WithContext(ctx), groupID)
}

func cohortOptions(db *gorm.DB, groupID uint64) ([]CohortOption, error) {
	var rows []struct {
		FormID   uint64
		Title    string
		UserID   uint64
		RealName *string
	}
	err := db.Table("registrations AS r").
		Select("r.form_id, f.title, u.id AS user_id, u.real_name").
		Joins("JOIN registration_forms AS f ON f.id = r.form_id").
		Joins("JOIN user_group_members AS gm ON gm.user_id = r.user_id AND gm.group_id = ?", groupID).
		Joins("JOIN user_groups AS g ON g.id = gm.group_id").
		Joins("JOIN users AS u ON u.id = r.user_id").
		Joins("JOIN roles AS role ON role.id = u.role_id").
		Where("r.recruitment_status = ? AND g.status = ? AND u.status = ? AND role.name = ? AND u.team_identity_status <> ?",
			model.RecruitmentStatusAdmitted, model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser, model.TeamIdentityFormerMember).
		Order("f.created_at DESC, f.id DESC, u.real_name ASC, u.id ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, internalError("读取纳新届次失败", err)
	}

	options := make([]CohortOption, 0)
	index := make(map[uint64]int)
	for _, row := range rows {
		position, ok := index[row.FormID]
		if !ok {
			position = len(options)
			index[row.FormID] = position
			options = append(options, CohortOption{FormID: row.FormID, Title: row.Title, Members: []MemberOption{}})
		}
		name := "姓名待核实"
		if row.RealName != nil && strings.TrimSpace(*row.RealName) != "" {
			name = strings.TrimSpace(*row.RealName)
		}
		options[position].Members = append(options[position].Members, MemberOption{UserID: row.UserID, Name: name})
	}
	return options, nil
}

func (s *Service) resolveCohortTargetsWithDB(db *gorm.DB, groupID uint64, formIDs []uint64) ([]uint64, error) {
	options, err := cohortOptions(db, groupID)
	if err != nil {
		return nil, err
	}
	selected := make(map[uint64]bool, len(formIDs))
	for _, id := range formIDs {
		selected[id] = true
	}
	userIDs := make([]uint64, 0)
	for _, option := range options {
		if !selected[option.FormID] {
			continue
		}
		delete(selected, option.FormID)
		for _, member := range option.Members {
			userIDs = append(userIDs, member.UserID)
		}
	}
	if len(selected) != 0 {
		return nil, badRequest("所选纳新届次没有当前组内有效的录取成员")
	}
	userIDs = uniqueSortedIDs(userIDs)
	if len(userIDs) == 0 || len(userIDs) > maxRecipients {
		return nil, badRequest("纳新届次接收人数必须在 1 至 500 人之间")
	}
	return userIDs, nil
}