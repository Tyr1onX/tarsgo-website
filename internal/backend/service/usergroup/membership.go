package usergroup

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const (
	MembershipStateUnassigned = "unassigned"
	MembershipStateAssigned   = "assigned"
	MembershipStatePending    = "pending"
)

type MembershipOption struct {
	GroupID uint64 `json:"groupId"`
	Name    string `json:"name"`
	Role    uint8  `json:"role"`
}

type MembershipResolution struct {
	State          string             `json:"state"`
	Groups         []MembershipOption `json:"groups"`
	CanSelfConfirm bool               `json:"canSelfConfirm"`
}

type MembershipService struct {
	db *gorm.DB
}

func NewMembershipService(db *gorm.DB) *MembershipService {
	return &MembershipService{db: db}
}

func (s *MembershipService) CurrentState(ctx context.Context, userID uint64) (*MembershipResolution, error) {
	if userID == 0 {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "登录状态无效"}
	}
	user, err := loadUserMemberships(s.db.WithContext(ctx), userID, false)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "账号不存在或已失效"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取所属组别失败", Err: err}
	}
	return buildMembershipResolution(user), nil
}

func (s *MembershipService) Confirm(ctx context.Context, userID, groupID uint64) (*MembershipResolution, error) {
	if userID == 0 || groupID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "请选择当前账号已有的有效组别"}
	}
	var resolution *MembershipResolution
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user, err := loadUserMemberships(tx, userID, true)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusUnauthorized, Message: "账号不存在或已失效"}
			}
			return err
		}
		before := buildMembershipResolution(user)
		if before.State == MembershipStateAssigned && len(before.Groups) == 1 && before.Groups[0].GroupID == groupID {
			resolution = before
			return nil
		}
		if before.State != MembershipStatePending {
			return &ServiceError{Status: http.StatusConflict, Message: "组别关系已更新，请刷新后重试"}
		}
		if !before.CanSelfConfirm {
			return &ServiceError{Status: http.StatusConflict, Message: "该账号含有受保护的组织身份，需由管理员处理组别关系"}
		}
		if !containsMembershipGroup(before.Groups, groupID) {
			return &ServiceError{Status: http.StatusForbidden, Message: "只能确认账号当前已有的有效组别"}
		}
		if err := ReplaceUserGroupTx(tx, user, &groupID, userID, "user.group.confirmed"); err != nil {
			return err
		}
		updated, err := loadUserMemberships(tx, userID, false)
		if err != nil {
			return err
		}
		resolution = buildMembershipResolution(updated)
		return nil
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "确认所属组别失败", Err: err}
	}
	return resolution, nil
}

func ReplaceUserGroup(ctx context.Context, db *gorm.DB, actorID, userID uint64, groupID *uint64) error {
	if actorID == 0 || userID == 0 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "账号信息不合法"}
	}
	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user, err := loadUserMemberships(tx, userID, true)
		if err != nil {
			return err
		}
		if user.Role.Name == model.RoleNameSuperAdmin {
			return &ServiceError{Status: http.StatusForbidden, Message: "超级管理员账号不能调整所属组别"}
		}
		return ReplaceUserGroupTx(tx, user, groupID, actorID, "admin.user_group.replaced")
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return serviceErr
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusNotFound, Message: "用户不存在"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "调整用户所属组别失败", Err: err}
	}
	return nil
}

func UpdateUserGroupRole(ctx context.Context, db *gorm.DB, actorID, userID, groupID uint64, role uint8) error {
	if actorID == 0 || userID == 0 || groupID == 0 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "账号或组别信息不合法"}
	}
	if !isAssignableOrganizationRole(role) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "组织身份不合法；仅支持普通成员或组长"}
	}
	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user, err := loadUserMemberships(tx, userID, true)
		if err != nil {
			return err
		}
		if user.Role.Name == model.RoleNameSuperAdmin {
			return &ServiceError{Status: http.StatusForbidden, Message: "超级管理员账号不能设置组织身份"}
		}
		var member model.UserGroupMember
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Group").
			Where("user_id = ? AND group_id = ?", userID, groupID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusConflict, Message: "该账号已不属于所选组别，请刷新后重试"}
			}
			return err
		}
		if member.Role == role {
			return nil
		}
		before := membershipAuditSnapshot([]model.UserGroupMember{member})
		if err := tx.Model(&model.UserGroupMember{}).Where("id = ?", member.ID).Update("role", role).Error; err != nil {
			return err
		}
		member.Role = role
		after := membershipAuditSnapshot([]model.UserGroupMember{member})
		metadata, err := json.Marshal(map[string]any{
			"targetUserId": user.ID,
			"before":       before,
			"after":        after,
		})
		if err != nil {
			return err
		}
		return tx.Create(&model.AuditLog{
			ActorID:  &actorID,
			Action:   "admin.user_group.role_changed",
			Method:   http.MethodPatch,
			Path:     "/api/admin/users/" + uintToString(user.ID) + "/group-role",
			Status:   http.StatusOK,
			Metadata: string(metadata),
		}).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return serviceErr
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusNotFound, Message: "用户不存在"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "更新组织身份失败", Err: err}
	}
	return nil
}

// ReplaceUserGroupTx serializes every membership change on the user row. That
// keeps concurrent application requests from creating a new dual-group user
// while historical rows are being resolved and the database unique index is
// still deferred.
func ReplaceUserGroupTx(tx *gorm.DB, user *model.User, groupID *uint64, actorID uint64, action string) error {
	if groupID != nil {
		if *groupID == 0 {
			return &ServiceError{Status: http.StatusBadRequest, Message: "所属组别不合法"}
		}
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", *groupID, model.UserGroupStatusActive).First(&group).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusConflict, Message: "所选组别不存在或已停用"}
			}
			return err
		}
	}

	before := membershipAuditSnapshot(user.GroupMembers)
	selectedPresent := false
	for _, member := range user.GroupMembers {
		if groupID != nil && member.GroupID == *groupID {
			selectedPresent = true
			continue
		}
	}

	if !selectedPresent && groupID != nil {
		if err := tx.Create(&model.UserGroupMember{
			GroupID: *groupID,
			UserID:  user.ID,
			Role:    model.UserGroupMemberRoleMember,
		}).Error; err != nil {
			return err
		}
	}
	deleteQuery := tx.Where("user_id = ?", user.ID)
	if groupID != nil {
		deleteQuery = deleteQuery.Where("group_id <> ?", *groupID)
	}
	if err := deleteQuery.Delete(&model.UserGroupMember{}).Error; err != nil {
		return err
	}

	after := []membershipAuditEntry{}
	if groupID != nil {
		var member model.UserGroupMember
		if err := tx.Preload("Group").Where("user_id = ? AND group_id = ?", user.ID, *groupID).First(&member).Error; err != nil {
			return err
		}
		after = membershipAuditSnapshot([]model.UserGroupMember{member})
	}
	metadata, err := json.Marshal(map[string]any{
		"targetUserId": user.ID,
		"before":       before,
		"after":        after,
	})
	if err != nil {
		return err
	}
	method, path := http.MethodPatch, "/api/admin/users/"+uintToString(user.ID)+"/group"
	if action == "user.group.confirmed" {
		method, path = http.MethodPost, "/api/user-group/confirmation"
	}
	return tx.Create(&model.AuditLog{
		ActorID:  &actorID,
		Action:   action,
		Method:   method,
		Path:     path,
		Status:   http.StatusOK,
		Metadata: string(metadata),
	}).Error
}

type membershipAuditEntry struct {
	GroupID uint64 `json:"groupId"`
	Name    string `json:"name"`
	Status  uint8  `json:"status"`
	Role    uint8  `json:"role"`
	Joined  string `json:"joinedAt"`
}

func membershipAuditSnapshot(members []model.UserGroupMember) []membershipAuditEntry {
	result := make([]membershipAuditEntry, 0, len(members))
	for _, member := range members {
		result = append(result, membershipAuditEntry{
			GroupID: member.GroupID,
			Name:    member.Group.Name,
			Status:  member.Group.Status,
			Role:    member.Role,
			Joined:  member.JoinedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].GroupID < result[j].GroupID })
	return result
}

func loadUserMemberships(db *gorm.DB, userID uint64, lock bool) (*model.User, error) {
	query := db.Preload("Role").Preload("GroupMembers.Group").Where("id = ?", userID)
	if lock {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	var user model.User
	if err := query.First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func buildMembershipResolution(user *model.User) *MembershipResolution {
	groups := make([]MembershipOption, 0, len(user.GroupMembers))
	protectedTitle := false
	for _, member := range user.GroupMembers {
		if member.Group.Status != model.UserGroupStatusActive {
			if member.Role == model.UserGroupMemberRoleLeader {
				protectedTitle = true
			}
			continue
		}
		groups = append(groups, MembershipOption{GroupID: member.GroupID, Name: member.Group.Name, Role: member.Role})
		if member.Role == model.UserGroupMemberRoleLeader {
			protectedTitle = true
		}
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Name == groups[j].Name {
			return groups[i].GroupID < groups[j].GroupID
		}
		return groups[i].Name < groups[j].Name
	})
	state := MembershipStateUnassigned
	if len(groups) == 1 {
		state = MembershipStateAssigned
	} else if len(groups) > 1 {
		state = MembershipStatePending
	}
	canConfirm := state == MembershipStatePending && !protectedTitle && user.Role.Name != model.RoleNameSuperAdmin
	return &MembershipResolution{State: state, Groups: groups, CanSelfConfirm: canConfirm}
}

func containsMembershipGroup(groups []MembershipOption, groupID uint64) bool {
	for _, group := range groups {
		if group.GroupID == groupID {
			return true
		}
	}
	return false
}

func isAssignableOrganizationRole(role uint8) bool {
	return role == model.UserGroupMemberRoleMember || role == model.UserGroupMemberRoleLeader
}

func uintToString(value uint64) string {
	return strconv.FormatUint(value, 10)
}
