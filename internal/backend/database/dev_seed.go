package database

import (
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

const developmentMockUserPassword = "TarsGo123!"

type mockGroupSeed struct {
	Name        string
	Description string
	Tags        []string
	IsDefault   bool
	Show        uint8
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

		var adminRole model.Role
		if err := tx.Where("name = ?", model.RoleNameAdmin).First(&adminRole).Error; err != nil {
			return fmt.Errorf("load mock admin role: %w", err)
		}
		groups := make(map[string]*model.UserGroup)
		users := make(map[string]*model.User)
		for _, groupSeed := range developmentMockGroupSeeds() {
			group, err := ensureMockGroup(tx, groupSeed)
			if err != nil {
				return err
			}
			groups[groupSeed.Name] = group

			for _, userSeed := range groupSeed.Users {
				user, err := ensureMockUser(tx, userRole.ID, string(passwordHash), userSeed)
				if err != nil {
					return err
				}

				if err := ensureMockMembership(tx, group.ID, user.ID, userSeed.MemberRole); err != nil {
					return err
				}
				users[normalizeSeedEmail(userSeed.Email)] = user
			}
		}

		reviewer, err := ensureMockUser(tx, adminRole.ID, string(passwordHash), mockUserSeed{
			Name:     "开发审核员",
			RealName: "开发审核员",
			Nickname: "审核测试",
			Email:    "reviewer@tarsgo.test",
		})
		if err != nil {
			return err
		}
		if err := seedDevelopmentRecruitmentFixtures(tx, reviewer, groups, users); err != nil {
			return err
		}
		if err := tx.Model(&model.User{}).Where("id = ?", reviewer.ID).Updates(map[string]any{"admin_scope": model.AdminScopeGlobal, "management_group_id": nil}).Error; err != nil {
			return fmt.Errorf("set mock global admin scope: %w", err)
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
			"is_default":  seed.IsDefault,
			"show":        seed.Show,
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
			Show:        1,
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
			Show:        1,
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
		{
			Name:        "开发候选人",
			Description: "开发环境招新流程测试账号所在的默认组",
			Tags:        []string{"开发演示", "招新测试"},
			IsDefault:   true,
			Show:        0,
			Users: []mockUserSeed{
				{Name: "待初筛测试", RealName: "待初筛测试", Nickname: "待初筛", Email: "review-pending@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "待面试测试", RealName: "待面试测试", Nickname: "待面试", Email: "review-approved@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "未通过测试", RealName: "未通过测试", Nickname: "未通过", Email: "review-rejected@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "已录取测试", RealName: "已录取测试", Nickname: "已录取", Email: "review-mixed@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
			},
		},
	}
}

type mockRecruitmentRegistrationSeed struct {
	Email           string
	Name            string
	Status          string
	RejectedStage   string
	ScreeningRemark string
	InterviewRemark string
}

func seedDevelopmentRecruitmentFixtures(
	tx *gorm.DB,
	reviewer *model.User,
	groups map[string]*model.UserGroup,
	users map[string]*model.User,
) error {
	visualGroup := groups["视觉组"]
	defaultGroup := groups["开发候选人"]
	if reviewer == nil || visualGroup == nil || defaultGroup == nil {
		return fmt.Errorf("development recruitment fixtures are incomplete")
	}

	form := &model.RegistrationForm{}
	formDescription := nullableSeedString("开发环境测试数据：用于验证单意向组的初筛、面试和录取流程。")
	if err := tx.
		Where(&model.RegistrationForm{Title: "招新流程功能测试"}).
		Attrs(&model.RegistrationForm{
			CreatorID:    reviewer.ID,
			Description:  formDescription,
			FieldsSchema: developmentRecruitmentFixtureFields(),
			Status:       model.RegistrationFormStatusClosed,
		}).
		FirstOrCreate(form).Error; err != nil {
		return fmt.Errorf("seed recruitment test form: %w", err)
	}

	seeds := []mockRecruitmentRegistrationSeed{
		{Email: "review-pending@tarsgo.test", Name: "待初筛测试", Status: model.RecruitmentStatusPendingScreening},
		{Email: "review-approved@tarsgo.test", Name: "待面试测试", Status: model.RecruitmentStatusPendingInterview, ScreeningRemark: "测试数据：初筛已通过"},
		{Email: "review-rejected@tarsgo.test", Name: "未通过测试", Status: model.RecruitmentStatusRejected, RejectedStage: model.RecruitmentRejectedStageScreening, ScreeningRemark: "测试数据：初筛未通过"},
		{Email: "review-mixed@tarsgo.test", Name: "已录取测试", Status: model.RecruitmentStatusAdmitted, ScreeningRemark: "测试数据：初筛已通过", InterviewRemark: "测试数据：面试通过并录取"},
	}

	for index, seed := range seeds {
		user := users[normalizeSeedEmail(seed.Email)]
		if user == nil {
			return fmt.Errorf("load recruitment test user %s", seed.Email)
		}
		if err := ensureMockRecruitmentRegistration(tx, form, reviewer, user, visualGroup, seed, index); err != nil {
			return err
		}
	}
	return nil
}

func developmentRecruitmentFixtureFields() []model.FormField {
	return []model.FormField{
		{Key: "name", Label: "姓名", Type: "text", Required: true},
		{Key: "phone", Label: "手机号", Type: "phone", Required: true},
		{Key: "email", Label: "邮箱", Type: "email", Required: true},
		{Key: "preferred_group", Label: "意向组", Type: "user_group_select", Required: true},
		{Key: "note", Label: "测试说明", Type: "textarea", Required: false},
	}
}

func ensureMockRecruitmentRegistration(
	tx *gorm.DB,
	form *model.RegistrationForm,
	reviewer *model.User,
	user *model.User,
	preferredGroup *model.UserGroup,
	seed mockRecruitmentRegistrationSeed,
	index int,
) error {
	submittedAt := time.Now().Add(-time.Duration(index+1) * time.Hour)
	contactPhone := fmt.Sprintf("139000010%02d", index)
	contactEmail := seed.Email
	registrationSeed := &model.Registration{
		FormData: map[string]any{
			"name":            seed.Name,
			"phone":           contactPhone,
			"email":           seed.Email,
			"preferred_group": fmt.Sprint(preferredGroup.ID),
			"note":            "单意向组招新流程开发测试数据",
		},
		ContactName:       &seed.Name,
		ContactPhone:      &contactPhone,
		ContactEmail:      &contactEmail,
		PreferredGroupID:  &preferredGroup.ID,
		RecruitmentStatus: seed.Status,
		SubmittedAt:       submittedAt,
	}
	if seed.RejectedStage != "" {
		registrationSeed.RejectedStage = &seed.RejectedStage
	}
	if seed.Status != model.RecruitmentStatusPendingScreening {
		screenedAt := submittedAt.Add(15 * time.Minute)
		registrationSeed.ScreenedBy = &reviewer.ID
		registrationSeed.ScreenedAt = &screenedAt
		if seed.ScreeningRemark != "" {
			registrationSeed.ScreeningRemark = &seed.ScreeningRemark
		}
	}
	if seed.Status == model.RecruitmentStatusAdmitted ||
		(seed.Status == model.RecruitmentStatusRejected && seed.RejectedStage == model.RecruitmentRejectedStageInterview) {
		interviewedAt := submittedAt.Add(45 * time.Minute)
		registrationSeed.InterviewerID = &reviewer.ID
		registrationSeed.InterviewedAt = &interviewedAt
		if seed.InterviewRemark != "" {
			registrationSeed.InterviewRemark = &seed.InterviewRemark
		}
	}

	registration := &model.Registration{}
	if err := tx.
		Where(&model.Registration{FormID: form.ID, UserID: user.ID}).
		Attrs(registrationSeed).
		FirstOrCreate(registration).Error; err != nil {
		return fmt.Errorf("seed recruitment registration %s: %w", seed.Email, err)
	}
	return nil
}
