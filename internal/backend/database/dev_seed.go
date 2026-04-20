package database

import (
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

const developmentMockUserPassword = "TarsGo123!"

type mockGroupSeed struct {
	Name        string
	Description string
	Tags        []string
	Users       []mockUserSeed
}

type mockUserSeed struct {
	Name       string
	RealName   string
	Nickname   string
	Email      string
	MemberRole uint8
}

func seedDevelopmentMockData(db *gorm.DB, appEnv string) error {
	if !shouldSeedDevelopmentMockData(appEnv) {
		return nil
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(developmentMockUserPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash mock user password: %w", err)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		var userRole model.Role
		if err := tx.Where("name = ?", model.RoleNameUser).First(&userRole).Error; err != nil {
			return fmt.Errorf("load mock user role: %w", err)
		}

		for _, groupSeed := range developmentMockGroupSeeds() {
			group, err := ensureMockGroup(tx, groupSeed)
			if err != nil {
				return err
			}

			for _, userSeed := range groupSeed.Users {
				user, err := ensureMockUser(tx, userRole.ID, string(passwordHash), userSeed)
				if err != nil {
					return err
				}

				if err := ensureMockMembership(tx, group.ID, user.ID, userSeed.MemberRole); err != nil {
					return err
				}
			}
		}

		return nil
	})
}

func shouldSeedDevelopmentMockData(appEnv string) bool {
	switch strings.ToLower(strings.TrimSpace(appEnv)) {
	case "", "development", "dev", "local":
		return true
	default:
		return false
	}
}

func ensureMockGroup(tx *gorm.DB, seed mockGroupSeed) (*model.UserGroup, error) {
	group := &model.UserGroup{}
	if err := tx.
		Where(&model.UserGroup{Name: seed.Name}).
		Attrs(map[string]any{
			"description": nullableSeedString(seed.Description),
			"tags":        seed.Tags,
			"is_default":  false,
			"show":        uint8(1),
			"status":      model.UserGroupStatusActive,
		}).
		FirstOrCreate(group).Error; err != nil {
		return nil, fmt.Errorf("seed mock group %s: %w", seed.Name, err)
	}

	return group, nil
}

func ensureMockUser(tx *gorm.DB, roleID uint64, passwordHash string, seed mockUserSeed) (*model.User, error) {
	email := normalizeSeedEmail(seed.Email)
	if email == "" {
		return nil, fmt.Errorf("seed mock user %s has empty email", seed.Name)
	}

	user := &model.User{}
	if err := tx.
		Where(&model.User{Email: email}).
		Attrs(map[string]any{
			"role_id":       roleID,
			"name":          seed.Name,
			"password_hash": passwordHash,
			"nickname":      nullableSeedString(seed.Nickname),
			"real_name":     nullableSeedString(seed.RealName),
			"status":        model.UserStatusEnabled,
		}).
		FirstOrCreate(user).Error; err != nil {
		return nil, fmt.Errorf("seed mock user %s: %w", email, err)
	}

	return user, nil
}

func ensureMockMembership(tx *gorm.DB, groupID uint64, userID uint64, role uint8) error {
	member := &model.UserGroupMember{}
	if err := tx.
		Where(&model.UserGroupMember{GroupID: groupID, UserID: userID}).
		Attrs(map[string]any{
			"role": role,
		}).
		FirstOrCreate(member).Error; err != nil {
		return fmt.Errorf("seed mock membership group=%d user=%d: %w", groupID, userID, err)
	}

	return nil
}

func normalizeSeedEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func nullableSeedString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func developmentMockGroupSeeds() []mockGroupSeed {
	return []mockGroupSeed{
		{
			Name:        "视觉组",
			Description: "开发环境演示数据：视觉组",
			Tags:        []string{"开发演示", "虚假数据", "视觉"},
			Users: []mockUserSeed{
				{Name: "林知夏", RealName: "林知夏", Nickname: "视觉01", Email: "vision01@tarsgo.test", MemberRole: model.UserGroupMemberRoleLeader},
				{Name: "许星野", RealName: "许星野", Nickname: "视觉02", Email: "vision02@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "沈明澈", RealName: "沈明澈", Nickname: "视觉03", Email: "vision03@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "顾晚晴", RealName: "顾晚晴", Nickname: "视觉04", Email: "vision04@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "周映雪", RealName: "周映雪", Nickname: "视觉05", Email: "vision05@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "宋南栀", RealName: "宋南栀", Nickname: "视觉06", Email: "vision06@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "江语晨", RealName: "江语晨", Nickname: "视觉07", Email: "vision07@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "唐若川", RealName: "唐若川", Nickname: "视觉08", Email: "vision08@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "叶清和", RealName: "叶清和", Nickname: "视觉09", Email: "vision09@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "陆景初", RealName: "陆景初", Nickname: "视觉10", Email: "vision10@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
			},
		},
		{
			Name:        "电控组",
			Description: "开发环境演示数据：电控组",
			Tags:        []string{"开发演示", "虚假数据", "电控"},
			Users: []mockUserSeed{
				{Name: "陈向北", RealName: "陈向北", Nickname: "电控01", Email: "electrical01@tarsgo.test", MemberRole: model.UserGroupMemberRoleLeader},
				{Name: "韩启航", RealName: "韩启航", Nickname: "电控02", Email: "electrical02@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "郑泽远", RealName: "郑泽远", Nickname: "电控03", Email: "electrical03@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "孙牧川", RealName: "孙牧川", Nickname: "电控04", Email: "electrical04@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "高以恒", RealName: "高以恒", Nickname: "电控05", Email: "electrical05@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "何景行", RealName: "何景行", Nickname: "电控06", Email: "electrical06@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "曹星河", RealName: "曹星河", Nickname: "电控07", Email: "electrical07@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "罗子昂", RealName: "罗子昂", Nickname: "电控08", Email: "electrical08@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "邓嘉树", RealName: "邓嘉树", Nickname: "电控09", Email: "electrical09@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "彭书远", RealName: "彭书远", Nickname: "电控10", Email: "electrical10@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
			},
		},
	}
}
