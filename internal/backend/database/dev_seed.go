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
		var superAdminRole model.Role
		if err := tx.Where("name = ?", model.RoleNameSuperAdmin).First(&superAdminRole).Error; err != nil {
			return fmt.Errorf("load mock super admin role: %w", err)
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
				if userSeed.MemberRole == model.UserGroupMemberRoleLeader || userSeed.MemberRole == model.UserGroupMemberRoleGroupAdmin {
					if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Updates(map[string]any{"role_id": adminRole.ID, "admin_scope": model.AdminScopeGroup, "management_group_id": group.ID}).Error; err != nil {
						return fmt.Errorf("promote mock group manager: %w", err)
					}
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
		portalAdmin, err := ensureMockUser(tx, superAdminRole.ID, string(passwordHash), mockUserSeed{
			Name: "门户内容管理员", RealName: "门户内容管理员", Nickname: "门户管理员", Email: "portal-admin@tarsgo.test",
		})
		if err != nil {
			return err
		}
		if err := seedDevelopmentReviewFixtures(tx, reviewer, groups, users); err != nil {
			return err
		}
		if err := tx.Model(&model.User{}).Where("id = ?", reviewer.ID).Updates(map[string]any{"admin_scope": model.AdminScopeGlobal, "management_group_id": nil}).Error; err != nil {
			return fmt.Errorf("set mock global admin scope: %w", err)
		}
		if err := seedDevelopmentAnnouncementFixtures(tx, portalAdmin, groups); err != nil {
			return err
		}
		if err := seedDevelopmentEventFixtures(tx, portalAdmin, groups); err != nil {
			return err
		}
		if err := seedDevelopmentLinkFixtures(tx, portalAdmin); err != nil {
			return err
		}

		return nil
	})
}

func seedDevelopmentLinkFixtures(tx *gorm.DB, creator *model.User) error {
	if creator == nil {
		return fmt.Errorf("development link fixtures are incomplete")
	}
	seeds := []model.PortalLink{
		{Name: "官方规则手册", URL: "https://www.robomaster.com/zh-CN/resource/pages/announcement/1764", IconKey: "book", SortOrder: 10, IsEnabled: true, OpenInNewWindow: true, AudienceType: model.PortalAudienceAll, CreatorID: creator.ID, UpdatedByID: creator.ID},
		{Name: "技术文档库", URL: "https://github.com/吉林大学TARS-GO战队", IconKey: "folder", SortOrder: 20, IsEnabled: true, OpenInNewWindow: true, AudienceType: model.PortalAudienceAll, CreatorID: creator.ID, UpdatedByID: creator.ID},
		{Name: "返回官网", URL: "/", IconKey: "home", SortOrder: 30, IsEnabled: true, AudienceType: model.PortalAudienceAll, CreatorID: creator.ID, UpdatedByID: creator.ID},
	}
	for _, seed := range seeds {
		row := &model.PortalLink{}
		if err := tx.Where("name = ?", seed.Name).Attrs(&seed).FirstOrCreate(row).Error; err != nil {
			return fmt.Errorf("seed portal link %s: %w", seed.Name, err)
		}
	}
	return nil
}

func seedDevelopmentEventFixtures(tx *gorm.DB, creator *model.User, groups map[string]*model.UserGroup) error {
	visualGroup := groups["视觉组"]
	if creator == nil || visualGroup == nil {
		return fmt.Errorf("development event fixtures are incomplete")
	}
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return fmt.Errorf("load Shanghai timezone: %w", err)
	}
	now := time.Now().In(location)
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	monday := dayStart.AddDate(0, 0, -((int(now.Weekday()) + 6) % 7))
	seeds := []struct {
		title, description, place, status, audience string
		startsAt, endsAt                            time.Time
		groups                                      []uint64
	}{
		{title: "开发日程：全队周会", description: "验证全员本周日程。", place: "南岭实验室 B201", status: model.TeamEventStatusPublished, audience: model.PortalAudienceAll, startsAt: monday.Add(19 * time.Hour), endsAt: monday.Add(21 * time.Hour)},
		{title: "开发日程：视觉组分享", description: "验证指定组日程。", place: "视觉组工位", status: model.TeamEventStatusPublished, audience: model.PortalAudienceGroups, startsAt: monday.AddDate(0, 0, 2).Add(19 * time.Hour), endsAt: monday.AddDate(0, 0, 2).Add(21 * time.Hour), groups: []uint64{visualGroup.ID}},
		{title: "开发日程：跨天联调", description: "验证跨天事件展示。", place: "工程训练中心", status: model.TeamEventStatusPublished, audience: model.PortalAudienceAll, startsAt: monday.AddDate(0, 0, 5).Add(20 * time.Hour), endsAt: monday.AddDate(0, 0, 6).Add(2 * time.Hour)},
		{title: "开发日程：已取消训练", description: "取消日程不应显示。", place: "工程训练中心", status: model.TeamEventStatusCancelled, audience: model.PortalAudienceAll, startsAt: monday.AddDate(0, 0, 4).Add(14 * time.Hour), endsAt: monday.AddDate(0, 0, 4).Add(16 * time.Hour)},
	}
	for _, seed := range seeds {
		row := &model.TeamEvent{}
		if err := tx.Where("title = ?", seed.title).Attrs(&model.TeamEvent{Title: seed.title, Description: nullableSeedString(seed.description), Location: nullableSeedString(seed.place), StartsAt: seed.startsAt, EndsAt: seed.endsAt, Status: seed.status, AudienceType: seed.audience, CreatorID: creator.ID, UpdatedByID: creator.ID}).FirstOrCreate(row).Error; err != nil {
			return fmt.Errorf("seed event %s: %w", seed.title, err)
		}
		for _, groupID := range seed.groups {
			target := &model.TeamEventTargetGroup{}
			if err := tx.Where("event_id = ? AND group_id = ?", row.ID, groupID).Attrs(&model.TeamEventTargetGroup{EventID: row.ID, GroupID: groupID}).FirstOrCreate(target).Error; err != nil {
				return fmt.Errorf("seed event target %s: %w", seed.title, err)
			}
		}
	}
	return nil
}

func seedDevelopmentAnnouncementFixtures(tx *gorm.DB, creator *model.User, groups map[string]*model.UserGroup) error {
	visualGroup := groups["视觉组"]
	if creator == nil || visualGroup == nil {
		return fmt.Errorf("development announcement fixtures are incomplete")
	}
	now := time.Now()
	future := now.Add(7 * 24 * time.Hour)
	expiredPublish := now.Add(-14 * 24 * time.Hour)
	expiredAt := now.Add(-7 * 24 * time.Hour)
	seeds := []struct {
		title        string
		content      string
		category     string
		publishAt    *time.Time
		expireAt     *time.Time
		audienceType string
		groupIDs     []uint64
	}{
		{title: "开发公告：全员训练安排", content: "本公告用于验证所有已登录用户都能在主页看到已发布公告。", category: "training", audienceType: model.PortalAudienceAll},
		{title: "开发公告：视觉组专项通知", content: "本公告用于验证指定用户组的当前成员可见。", category: "team", audienceType: model.PortalAudienceGroups, groupIDs: []uint64{visualGroup.ID}},
		{title: "开发公告：未来发布", content: "本公告在发布时间到达前不应出现在主页。", category: "system", publishAt: &future, audienceType: model.PortalAudienceAll},
		{title: "开发公告：已过期", content: "本公告已超过失效时间，不应出现在主页。", category: "competition", publishAt: &expiredPublish, expireAt: &expiredAt, audienceType: model.PortalAudienceAll},
	}
	for _, seed := range seeds {
		row := &model.Announcement{}
		if err := tx.Where("title = ?", seed.title).Attrs(&model.Announcement{
			Title: seed.title, Content: seed.content, Category: seed.category,
			Status: model.AnnouncementStatusPublished, PublishAt: seed.publishAt, ExpireAt: seed.expireAt,
			AudienceType: seed.audienceType, CreatorID: creator.ID, UpdatedByID: creator.ID,
		}).FirstOrCreate(row).Error; err != nil {
			return fmt.Errorf("seed announcement %s: %w", seed.title, err)
		}
		for _, groupID := range seed.groupIDs {
			target := &model.AnnouncementTargetGroup{}
			if err := tx.Where("announcement_id = ? AND group_id = ?", row.ID, groupID).
				Attrs(&model.AnnouncementTargetGroup{AnnouncementID: row.ID, GroupID: groupID}).
				FirstOrCreate(target).Error; err != nil {
				return fmt.Errorf("seed announcement target %s: %w", seed.title, err)
			}
		}
	}
	return nil
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
			Description: "开发环境撤销审核测试账号所在的默认组",
			Tags:        []string{"开发演示", "审核测试"},
			IsDefault:   true,
			Show:        0,
			Users: []mockUserSeed{
				{Name: "待审核测试", RealName: "待审核测试", Nickname: "待审核", Email: "review-pending@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "撤销通过测试", RealName: "撤销通过测试", Nickname: "撤销通过", Email: "review-approved@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "撤销拒绝测试", RealName: "撤销拒绝测试", Nickname: "撤销拒绝", Email: "review-rejected@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
				{Name: "混合结果测试", RealName: "混合结果测试", Nickname: "混合审核", Email: "review-mixed@tarsgo.test", MemberRole: model.UserGroupMemberRoleMember},
			},
		},
	}
}

type mockReviewRegistrationSeed struct {
	Email        string
	Name         string
	Group1Status uint8
	Group2Status uint8
	Status       uint8
	Remark1      string
	Remark2      string
}

func seedDevelopmentReviewFixtures(
	tx *gorm.DB,
	reviewer *model.User,
	groups map[string]*model.UserGroup,
	users map[string]*model.User,
) error {
	visualGroup := groups["视觉组"]
	electricalGroup := groups["电控组"]
	defaultGroup := groups["开发候选人"]
	if reviewer == nil || visualGroup == nil || electricalGroup == nil || defaultGroup == nil {
		return fmt.Errorf("development review fixtures are incomplete")
	}

	form := &model.RegistrationForm{}
	formDescription := nullableSeedString("开发环境测试数据：用于验证撤销通过、撤销拒绝和重新审核。")
	if err := tx.
		Where(&model.RegistrationForm{Title: "撤销审核功能测试"}).
		Attrs(&model.RegistrationForm{
			CreatorID:    reviewer.ID,
			Description:  formDescription,
			FieldsSchema: developmentReviewFixtureFields(),
			Status:       model.RegistrationFormStatusClosed,
		}).
		FirstOrCreate(form).Error; err != nil {
		return fmt.Errorf("seed review test form: %w", err)
	}

	seeds := []mockReviewRegistrationSeed{
		{Email: "review-pending@tarsgo.test", Name: "待审核测试", Group1Status: model.RegistrationStatusPending, Group2Status: model.RegistrationStatusPending, Status: model.RegistrationStatusPending},
		{Email: "review-approved@tarsgo.test", Name: "撤销通过测试", Group1Status: model.RegistrationStatusApproved, Group2Status: model.RegistrationStatusApproved, Status: model.RegistrationStatusApproved, Remark1: "测试数据：第一志愿已通过", Remark2: "测试数据：第二志愿已通过"},
		{Email: "review-rejected@tarsgo.test", Name: "撤销拒绝测试", Group1Status: model.RegistrationStatusRejected, Group2Status: model.RegistrationStatusRejected, Status: model.RegistrationStatusRejected, Remark1: "测试数据：第一志愿已拒绝", Remark2: "测试数据：第二志愿已拒绝"},
		{Email: "review-mixed@tarsgo.test", Name: "混合结果测试", Group1Status: model.RegistrationStatusApproved, Group2Status: model.RegistrationStatusRejected, Status: model.RegistrationStatusApproved, Remark1: "测试数据：第一志愿已通过", Remark2: "测试数据：第二志愿已拒绝"},
	}

	for index, seed := range seeds {
		user := users[normalizeSeedEmail(seed.Email)]
		if user == nil {
			return fmt.Errorf("load review test user %s", seed.Email)
		}
		if err := ensureMockReviewRegistration(tx, form, reviewer, user, visualGroup, electricalGroup, seed, index); err != nil {
			return err
		}
	}
	return nil
}

func developmentReviewFixtureFields() []model.FormField {
	return []model.FormField{
		{Key: "name", Label: "姓名", Type: "text", Required: true},
		{Key: "phone", Label: "手机号", Type: "phone", Required: true},
		{Key: "email", Label: "邮箱", Type: "email", Required: true},
		{Key: "group_1", Label: "第一志愿", Type: "user_group_select", Required: true},
		{Key: "group_2", Label: "第二志愿", Type: "user_group_select", Required: true},
		{Key: "note", Label: "测试说明", Type: "textarea", Required: false},
	}
}

func ensureMockReviewRegistration(
	tx *gorm.DB,
	form *model.RegistrationForm,
	reviewer *model.User,
	user *model.User,
	visualGroup *model.UserGroup,
	electricalGroup *model.UserGroup,
	seed mockReviewRegistrationSeed,
	index int,
) error {
	submittedAt := time.Now().Add(-time.Duration(index+1) * time.Hour)
	contactPhone := fmt.Sprintf("139000010%02d", index)
	contactEmail := seed.Email
	registrationSeed := &model.Registration{
		FormData: map[string]any{
			"name":    seed.Name,
			"phone":   contactPhone,
			"email":   seed.Email,
			"group_1": fmt.Sprint(visualGroup.ID),
			"group_2": fmt.Sprint(electricalGroup.ID),
			"note":    "撤销后可重新选择通过或拒绝",
		},
		ContactName:  &seed.Name,
		ContactPhone: &contactPhone,
		ContactEmail: &contactEmail,
		Group1ID:     &visualGroup.ID,
		Group1Status: seed.Group1Status,
		Group2ID:     &electricalGroup.ID,
		Group2Status: seed.Group2Status,
		Status:       seed.Status,
		SubmittedAt:  submittedAt,
	}
	if seed.Group1Status != model.RegistrationStatusPending {
		reviewedAt := submittedAt.Add(15 * time.Minute)
		registrationSeed.ReviewerID1 = &reviewer.ID
		registrationSeed.ReviewedAt1 = &reviewedAt
		registrationSeed.ReviewRemark1 = &seed.Remark1
	}
	if seed.Group2Status != model.RegistrationStatusPending {
		reviewedAt := submittedAt.Add(30 * time.Minute)
		registrationSeed.ReviewerID2 = &reviewer.ID
		registrationSeed.ReviewedAt2 = &reviewedAt
		registrationSeed.ReviewRemark2 = &seed.Remark2
	}

	registration := &model.Registration{}
	if err := tx.
		Where(&model.Registration{FormID: form.ID, UserID: user.ID}).
		Attrs(registrationSeed).
		FirstOrCreate(registration).Error; err != nil {
		return fmt.Errorf("seed review registration %s: %w", seed.Email, err)
	}
	return nil
}
