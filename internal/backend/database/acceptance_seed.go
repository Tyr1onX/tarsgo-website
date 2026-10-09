package database

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

const AcceptanceFormTitle = "[TEST] Persistent Recruitment Acceptance"

type acceptanceAccount struct {
	key      string
	name     string
	email    string
	roleName string
	scope    string
}

var acceptanceAccounts = []acceptanceAccount{
	{key: "TARSGO_TEST_USER_PASSWORD", name: "[TEST_USER] 验收账号", email: "test-user@tarsgo.test", roleName: model.RoleNameUser, scope: model.AdminScopeNone},
	{key: "TARSGO_TEST_ADMIN_PASSWORD", name: "[TEST_ADMIN] 验收账号", email: "test-admin@tarsgo.test", roleName: model.RoleNameAdmin, scope: model.AdminScopeGlobal},
	{key: "TARSGO_TEST_SUPER_ADMIN_PASSWORD", name: "[TEST_SUPER_ADMIN] 验收账号", email: "test-super-admin@tarsgo.test", roleName: model.RoleNameSuperAdmin, scope: model.AdminScopeNone},
}

// EnsureAcceptanceEnvironment prevents the acceptance seed and reset command
// from ever targeting a non-local or non-dedicated database.
func EnsureAcceptanceEnvironment(appEnv, dbHost, dbPort, dbName string) error {
	if !strings.EqualFold(strings.TrimSpace(appEnv), "acceptance") ||
		strings.TrimSpace(dbHost) != "127.0.0.1" ||
		strings.TrimSpace(dbPort) != "3317" ||
		strings.TrimSpace(dbName) != "tarsgo_acceptance" {
		return errors.New("refusing acceptance data operation outside the isolated local acceptance database")
	}
	return nil
}

func seedAcceptanceTestData(db *gorm.DB, appEnv string) error {
	if !strings.EqualFold(strings.TrimSpace(appEnv), "acceptance") {
		return nil
	}
	if os.Getenv("TARSGO_ACCEPTANCE_SEED") != "true" {
		return errors.New("acceptance seed requires TARSGO_ACCEPTANCE_SEED=true")
	}
	if err := EnsureAcceptanceEnvironment(appEnv, os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_NAME")); err != nil {
		return err
	}
	passwords := make(map[string]string, len(acceptanceAccounts))
	for _, account := range acceptanceAccounts {
		password := os.Getenv(account.key)
		if strings.TrimSpace(password) == "" {
			return fmt.Errorf("acceptance account credential %s is required", account.key)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash acceptance account credential %s: %w", account.key, err)
		}
		passwords[account.email] = string(hash)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		roles := make(map[string]model.Role, 3)
		for _, roleName := range []string{model.RoleNameUser, model.RoleNameAdmin, model.RoleNameSuperAdmin} {
			var role model.Role
			if err := tx.Where("name = ?", roleName).First(&role).Error; err != nil {
				return fmt.Errorf("load acceptance role %s: %w", roleName, err)
			}
			roles[roleName] = role
		}

		group := model.UserGroup{}
		if err := tx.Where(&model.UserGroup{Name: "[TEST] Recruitment Acceptance Group"}).Attrs(model.UserGroup{
			Description: nullableSeedString("仅用于隔离验收环境的虚构招新组别"),
			Tags:        []string{"TEST", "验收数据"},
			Show:        1,
			Status:      model.UserGroupStatusActive,
		}).FirstOrCreate(&group).Error; err != nil {
			return fmt.Errorf("seed acceptance group: %w", err)
		}
		accounts := make(map[string]*model.User, len(acceptanceAccounts))
		for _, seed := range acceptanceAccounts {
			role := roles[seed.roleName]
			user := &model.User{}
			if err := tx.Where(&model.User{Email: seed.email}).Attrs(map[string]any{
				"role_id":       role.ID,
				"admin_scope":   seed.scope,
				"name":          seed.name,
				"real_name":     seed.name,
				"password_hash": passwords[seed.email],
				"status":        model.UserStatusEnabled,
			}).FirstOrCreate(user).Error; err != nil {
				return fmt.Errorf("seed acceptance account %s: %w", seed.email, err)
			}
			updates := map[string]any{
				"role_id": role.ID, "admin_scope": seed.scope, "management_group_id": nil,
				"name": seed.name, "real_name": seed.name, "status": model.UserStatusEnabled,
			}
			if user.PasswordHash == nil || strings.TrimSpace(*user.PasswordHash) == "" {
				updates["password_hash"] = passwords[seed.email]
			}
			if err := tx.Model(user).Updates(updates).Error; err != nil {
				return fmt.Errorf("refresh acceptance account %s: %w", seed.email, err)
			}
			if seed.roleName == model.RoleNameUser {
				if err := tx.Where(&model.UserGroupMember{GroupID: group.ID, UserID: user.ID}).Attrs(map[string]any{"role": model.UserGroupMemberRoleMember}).FirstOrCreate(&model.UserGroupMember{}).Error; err != nil {
					return fmt.Errorf("assign acceptance user to group: %w", err)
				}
			}
			accounts[seed.roleName] = user
		}

		form := &model.RegistrationForm{}
		if err := tx.Where(&model.RegistrationForm{Title: AcceptanceFormTitle}).Attrs(model.RegistrationForm{
			CreatorID:    accounts[model.RoleNameSuperAdmin].ID,
			Description:  nullableSeedString("[TEST] 持久化验收届次；所有报名记录均为虚构测试数据。"),
			FieldsSchema: acceptanceFormFields(),
			StartTime:    seedTimePtr(time.Now().Add(-24 * time.Hour)),
			EndTime:      seedTimePtr(time.Now().AddDate(1, 0, 0)),
			Status:       model.RegistrationFormStatusPublished,
		}).FirstOrCreate(form).Error; err != nil {
			return fmt.Errorf("seed acceptance recruitment form: %w", err)
		}
		sessions, err := ensureAcceptanceSessions(tx, form.ID)
		if err != nil {
			return err
		}
		return seedAcceptanceCandidates(tx, form, &group, accounts[model.RoleNameAdmin], sessions)
	})
}

func acceptanceFormFields() []model.FormField {
	return []model.FormField{
		{Key: "name", Label: "姓名", Type: "text", Required: true},
		{Key: "phone", Label: "手机号", Type: "phone", Required: true},
		{Key: "email", Label: "邮箱", Type: "email", Required: true},
		{Key: "preferred_group", Label: "意向组", Type: "user_group_select", Required: true},
		{Key: "note", Label: "测试说明", Type: "textarea", Required: false},
	}
}

func seedTimePtr(value time.Time) *time.Time {
	return &value
}

func ensureAcceptanceSessions(tx *gorm.DB, formID uint64) ([]model.InterviewSession, error) {
	formIDValue := formID
	now := time.Now().AddDate(1, 0, 0)
	sessions := []model.InterviewSession{
		{FormID: &formIDValue, Date: now.Format("2006-01-02"), Label: "[TEST] 验收场次 A", StartTime: "10:00", EndTime: "10:30", Location: "[TEST] 线上会议室 A", Enabled: true},
		{FormID: &formIDValue, Date: now.Format("2006-01-02"), Label: "[TEST] 验收场次 B", StartTime: "14:00", EndTime: "14:30", Location: "[TEST] 线上会议室 B", Enabled: true},
	}
	for i := range sessions {
		var count int64
		query := tx.Model(&model.InterviewSession{}).Where("form_id = ? AND label = ?", formID, sessions[i].Label)
		if err := query.Count(&count).Error; err != nil {
			return nil, fmt.Errorf("count acceptance interview sessions: %w", err)
		}
		if count == 0 {
			if err := tx.Create(&sessions[i]).Error; err != nil {
				return nil, fmt.Errorf("seed acceptance interview session: %w", err)
			}
			continue
		}
		var existing model.InterviewSession
		if err := query.First(&existing).Error; err != nil {
			return nil, fmt.Errorf("load acceptance interview session: %w", err)
		}
		sessions[i].ID = existing.ID
	}
	return sessions, nil
}

func seedAcceptanceCandidates(tx *gorm.DB, form *model.RegistrationForm, group *model.UserGroup, admin *model.User, sessions []model.InterviewSession) error {
	if len(sessions) != 2 {
		return errors.New("acceptance interview sessions are incomplete")
	}
	var userRole model.Role
	if err := tx.Where("name = ?", model.RoleNameUser).First(&userRole).Error; err != nil {
		return fmt.Errorf("load user role for acceptance candidate: %w", err)
	}
	cases := []struct {
		key, name, status, stage string
		sessionIndex             int
	}{
		{key: "pending-screening", name: "[TEST] 待初筛候选人", status: model.RecruitmentStatusPendingScreening, sessionIndex: -1},
		{key: "pending-interview", name: "[TEST] 待预约候选人", status: model.RecruitmentStatusPendingInterview, sessionIndex: -1},
		{key: "booked-interview", name: "[TEST] 已预约候选人", status: model.RecruitmentStatusPendingInterview, sessionIndex: 0},
		{key: "admitted", name: "[TEST] 已录取候选人", status: model.RecruitmentStatusAdmitted, sessionIndex: 0},
		{key: "rejected", name: "[TEST] 初筛未通过候选人", status: model.RecruitmentStatusRejected, stage: model.RecruitmentRejectedStageScreening, sessionIndex: -1},
	}
	for i, testCase := range cases {
		email := "test-candidate-" + testCase.key + "@tarsgo.test"
		candidate := &model.User{}
		if err := tx.Where(&model.User{Email: email}).Attrs(map[string]any{
			"role_id": userRole.ID, "name": testCase.name, "real_name": testCase.name,
			"status": model.UserStatusEnabled,
		}).FirstOrCreate(candidate).Error; err != nil {
			return fmt.Errorf("seed acceptance candidate %s: %w", email, err)
		}
		phone := fmt.Sprintf("13800002%03d", i)
		preferredGroupID := group.ID
		registration := model.Registration{
			FormID: form.ID, UserID: candidate.ID,
			FormData:    map[string]any{"name": testCase.name, "phone": phone, "email": email, "preferred_group": fmt.Sprint(group.ID), "note": "[TEST] 可重置的虚构验收记录"},
			ContactName: &testCase.name, ContactPhone: &phone, ContactEmail: &email,
			PreferredGroupID: &preferredGroupID, RecruitmentStatus: testCase.status,
			InterviewAttendance: model.InterviewAttendancePending,
			SubmittedAt:         time.Now().Add(-time.Duration(i+1) * time.Hour),
		}
		if testCase.status != model.RecruitmentStatusPendingScreening {
			screenedAt := time.Now().Add(-time.Duration(i+1) * time.Minute)
			remark := "[TEST] 初筛验收数据"
			registration.ScreenedBy = &admin.ID
			registration.ScreenedAt = &screenedAt
			registration.ScreeningRemark = &remark
		}
		if testCase.stage != "" {
			registration.RejectedStage = &testCase.stage
		}
		if testCase.sessionIndex >= 0 {
			sessionID := sessions[testCase.sessionIndex].ID
			registration.InterviewSessionID = &sessionID
			registration.InterviewAttendance = model.InterviewAttendanceAttending
		}
		if testCase.status == model.RecruitmentStatusAdmitted {
			interviewedAt := time.Now().Add(-time.Minute)
			remark := "[TEST] 录取流程验收数据"
			registration.InterviewerID = &admin.ID
			registration.InterviewedAt = &interviewedAt
			registration.InterviewRemark = &remark
		}
		var count int64
		query := tx.Model(&model.Registration{}).Where("form_id = ? AND user_id = ?", form.ID, candidate.ID)
		if err := query.Count(&count).Error; err != nil {
			return fmt.Errorf("count acceptance registration %s: %w", email, err)
		}
		if count == 0 {
			if err := tx.Create(&registration).Error; err != nil {
				return fmt.Errorf("seed acceptance registration %s: %w", email, err)
			}
		} else {
			var existing model.Registration
			if err := query.First(&existing).Error; err != nil {
				return fmt.Errorf("load acceptance registration %s: %w", email, err)
			}
		}
	}
	return nil
}

// ResetAcceptanceTestData deletes only data attached to the dedicated test
// form and recreates the fixtures. Account and group rows are intentionally kept.
func ResetAcceptanceTestData(db *gorm.DB, appEnv, dbHost, dbPort, dbName string) error {
	if err := EnsureAcceptanceEnvironment(appEnv, dbHost, dbPort, dbName); err != nil {
		return err
	}
	if os.Getenv("TARSGO_ACCEPTANCE_SEED") != "true" {
		return errors.New("acceptance reset requires TARSGO_ACCEPTANCE_SEED=true")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var testUserIDs []uint64
		if err := tx.Model(&model.User{}).Where("email LIKE ?", "%@tarsgo.test").Pluck("id", &testUserIDs).Error; err != nil {
			return fmt.Errorf("find acceptance test accounts: %w", err)
		}
		if len(testUserIDs) > 0 {
			if err := tx.Where("actor_id IN ?", testUserIDs).Delete(&model.AuditLog{}).Error; err != nil {
				return fmt.Errorf("delete acceptance audit records: %w", err)
			}
			if err := tx.Where("actor_id IN ? OR target_user_id IN ?", testUserIDs, testUserIDs).Delete(&model.ActivityEvent{}).Error; err != nil {
				return fmt.Errorf("delete acceptance activity events: %w", err)
			}
		}
		if err := tx.Where("email LIKE ?", "%@tarsgo.test").Delete(&model.EmailCode{}).Error; err != nil {
			return fmt.Errorf("delete acceptance email codes: %w", err)
		}
		var forms []model.RegistrationForm
		if err := tx.Where("title = ?", AcceptanceFormTitle).Find(&forms).Error; err != nil {
			return fmt.Errorf("find acceptance test forms: %w", err)
		}
		for _, form := range forms {
			if err := tx.Where("registration_id IN (?)", tx.Model(&model.Registration{}).Select("id").Where("form_id = ?", form.ID)).Delete(&model.RegistrationInterview{}).Error; err != nil {
				return fmt.Errorf("delete acceptance interview result links: %w", err)
			}
			if err := tx.Where("form_id = ?", form.ID).Delete(&model.Registration{}).Error; err != nil {
				return fmt.Errorf("delete acceptance registrations: %w", err)
			}
			if err := tx.Where("form_id = ?", form.ID).Delete(&model.InterviewSession{}).Error; err != nil {
				return fmt.Errorf("delete acceptance interview sessions: %w", err)
			}
			if err := tx.Delete(&form).Error; err != nil {
				return fmt.Errorf("delete acceptance form: %w", err)
			}
		}
		return seedAcceptanceTestData(tx, appEnv)
	})
}
