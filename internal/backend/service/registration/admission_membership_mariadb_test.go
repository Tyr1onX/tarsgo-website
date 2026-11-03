package registration

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"tarsgo-backend/model"
	"tarsgo-backend/service/adminuser"
)

func TestMariaDBAdmissionMembershipTransaction(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	var role, adminRole model.Role
	db.Where("name = ?", model.RoleNameUser).First(&role)
	db.Where("name = ?", model.RoleNameAdmin).First(&adminRole)
	var form model.RegistrationForm
	if err := db.Where("status = ?", model.RegistrationFormStatusPublished).First(&form).Error; err != nil {
		t.Fatal(err)
	}
	marker := time.Now().UnixNano()
	group := model.UserGroup{Name: fmt.Sprintf("[TEST] admission-%d", marker), Status: 1, Show: 1}
	if err := db.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	users := []uint64{}
	regs := []uint64{}
	t.Cleanup(func() {
		db.Where("registration_id IN ?", regs).Delete(&model.InterviewResultNotification{})
		db.Where("registration_id IN ?", regs).Delete(&model.InterviewResultRevision{})
		db.Where("id IN ?", regs).Delete(&model.Registration{})
		db.Where("user_id IN ?", users).Delete(&model.UserGroupMember{})
		db.Where("actor_id IN ?", users).Delete(&model.AuditLog{})
		db.Where("id IN ?", users).Delete(&model.User{})
		db.Delete(&group)
	})
	create := func(identity string, systemAdmin bool, existing bool) (model.User, model.Registration) {
		t.Helper()
		rid := role.ID
		if systemAdmin {
			rid = adminRole.ID
		}
		user := model.User{RoleID: rid, Email: fmt.Sprintf("admission-%d-%d@tarsgo.test", marker, len(users)), Status: 1, TeamIdentityStatus: identity}
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		users = append(users, user.ID)
		if existing {
			if err := db.Create(&model.UserGroupMember{UserID: user.ID, GroupID: group.ID, Role: model.UserGroupMemberRoleLeader}).Error; err != nil {
				t.Fatal(err)
			}
		}
		reg := model.Registration{FormID: form.ID, UserID: user.ID, PreferredGroupID: &group.ID, RecruitmentStatus: model.RecruitmentStatusPendingInterview, FormData: map[string]any{}, ContactEmail: &user.Email}
		if err := db.Create(&reg).Error; err != nil {
			t.Fatal(err)
		}
		regs = append(regs, reg.ID)
		return user, reg
	}
	// An ordinary admin's existing candidate authority is retained.
	actorUser, _ := create(model.TeamIdentityFormalMember, true, true)
	actor := RegistrationFormActor{ID: actorUser.ID, RoleName: model.RoleNameAdmin}
	service := NewRegistrationService(db)
	ctx := context.Background()
	assertState := func(userID, regID uint64, status, identity string, members int64) {
		t.Helper()
		var u model.User
		var r model.Registration
		var count int64
		if err := db.First(&u, userID).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.First(&r, regID).Error; err != nil {
			t.Fatal(err)
		}
		db.Model(&model.UserGroupMember{}).Where("user_id = ? AND group_id = ?", userID, group.ID).Count(&count)
		if u.TeamIdentityStatus != identity || r.RecruitmentStatus != status || count != members {
			t.Fatalf("inconsistent state: identity=%s status=%s members=%d", u.TeamIdentityStatus, r.RecruitmentStatus, count)
		}
	}
	t.Run("concurrent retries admission correction readmission", func(t *testing.T) {
		u, r := create(model.TeamIdentityCommunityMember, false, false)
		var wg sync.WaitGroup
		results := make(chan error, 6)
		for i := 0; i < 6; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"})
				results <- err
			}()
		}
		wg.Wait()
		close(results)
		for err := range results {
			if err != nil {
				t.Fatal(err)
			}
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusAdmitted, model.TeamIdentityTraineeMember, 1)
		other := model.UserGroup{Name: fmt.Sprintf("[TEST] alternate-%d", marker), Status: 1, Show: 1}
		if err := db.Create(&other).Error; err != nil {
			t.Fatal(err)
		}
		defer db.Delete(&other)
		if err := adminuser.NewRepository(db).UpdateCurrentRecruitmentGroup(ctx, u.ID, other.ID); err == nil {
			t.Fatal("admitted group changed without correcting result")
		}
		var unchanged model.Registration
		db.First(&unchanged, r.ID)
		if unchanged.PreferredGroupID == nil || *unchanged.PreferredGroupID != group.ID {
			t.Fatal("admitted group changed")
		}

		var revisions int64
		db.Model(&model.InterviewResultRevision{}).Where("registration_id = ?", r.ID).Count(&revisions)
		if revisions != 1 {
			t.Fatalf("duplicate result revisions: %d", revisions)
		}
		for i := 0; i < 2; i++ {
			if _, err := service.CorrectInterviewResult(ctx, actor, r.ID, CorrectInterviewResultInput{Decision: "reject", CorrectionReason: "测试纠错"}); err != nil {
				t.Fatal(err)
			}
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusRejected, model.TeamIdentityCommunityMember, 0)
		if _, err := service.CorrectInterviewResult(ctx, actor, r.ID, CorrectInterviewResultInput{Decision: "admit", CorrectionReason: "复核通过"}); err != nil {
			t.Fatal(err)
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusAdmitted, model.TeamIdentityTraineeMember, 1)
	})
	t.Run("notification failure rolls back all admission effects", func(t *testing.T) {
		u, r := create(model.TeamIdentityCommunityMember, false, false)
		callback := fmt.Sprintf("test:admission-failure-%d", marker)
		if err := db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
			if n, ok := tx.Statement.Dest.(*model.InterviewResultNotification); ok && n.RegistrationID == r.ID {
				tx.AddError(errors.New("injected outbox persistence failure"))
			}
		}); err != nil {
			t.Fatal(err)
		}
		defer db.Callback().Create().Remove(callback)
		if _, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"}); err == nil {
			t.Fatal("expected rollback")
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusPendingInterview, model.TeamIdentityCommunityMember, 0)
		var count int64
		db.Model(&model.InterviewResultRevision{}).Where("registration_id = ?", r.ID).Count(&count)
		if count != 0 {
			t.Fatal("revision not rolled back")
		}
	})
	t.Run("formal identity admin role and group leadership survive corrections", func(t *testing.T) {
		u, r := create(model.TeamIdentityFormalMember, true, true)
		if _, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"}); err != nil {
			t.Fatal(err)
		}
		if _, err := service.CorrectInterviewResult(ctx, actor, r.ID, CorrectInterviewResultInput{Decision: "reject", CorrectionReason: "测试纠错"}); err != nil {
			t.Fatal(err)
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusRejected, model.TeamIdentityFormalMember, 1)
		var current model.User
		db.First(&current, u.ID)
		if current.RoleID != adminRole.ID {
			t.Fatal("admin role overwritten")
		}
		var member model.UserGroupMember
		db.Where("user_id = ?", u.ID).First(&member)
		if member.Role != model.UserGroupMemberRoleLeader {
			t.Fatal("group role overwritten")
		}
	})
	t.Run("preexisting ordinary relationship survives correction", func(t *testing.T) {
		u, r := create(model.TeamIdentityTraineeMember, false, false)
		member := model.UserGroupMember{UserID: u.ID, GroupID: group.ID, Role: model.UserGroupMemberRoleMember}
		if err := db.Create(&member).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"}); err != nil {
			t.Fatal(err)
		}
		if _, err := service.CorrectInterviewResult(ctx, actor, r.ID, CorrectInterviewResultInput{Decision: "reject", CorrectionReason: "保留既有身份测试"}); err != nil {
			t.Fatal(err)
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusRejected, model.TeamIdentityTraineeMember, 1)
	})
	t.Run("disabled admitted group rolls back result", func(t *testing.T) {
		u, r := create(model.TeamIdentityCommunityMember, false, false)
		if err := db.Model(&group).UpdateColumn("status", model.UserGroupStatusDisabled).Error; err != nil {
			t.Fatal(err)
		}
		defer db.Model(&group).UpdateColumn("status", model.UserGroupStatusActive)
		if _, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"}); err == nil {
			t.Fatal("disabled group accepted")
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusPendingInterview, model.TeamIdentityCommunityMember, 0)
	})
	t.Run("admin correction removes only newly granted effects", func(t *testing.T) {
		u, r := create(model.TeamIdentityCommunityMember, true, false)
		if _, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"}); err != nil {
			t.Fatal(err)
		}
		if _, err := service.CorrectInterviewResult(ctx, actor, r.ID, CorrectInterviewResultInput{Decision: "reject", CorrectionReason: "撤回错误录取"}); err != nil {
			t.Fatal(err)
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusRejected, model.TeamIdentityCommunityMember, 0)
		var current model.User
		db.First(&current, u.ID)
		if current.RoleID != adminRole.ID {
			t.Fatal("admin role overwritten")
		}
	})
	t.Run("later formal promotion survives correction", func(t *testing.T) {
		u, r := create(model.TeamIdentityCommunityMember, false, false)
		if _, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"}); err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&u).UpdateColumn("team_identity_status", model.TeamIdentityFormalMember).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := service.CorrectInterviewResult(ctx, actor, r.ID, CorrectInterviewResultInput{Decision: "reject", CorrectionReason: "测试纠错"}); err != nil {
			t.Fatal(err)
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusRejected, model.TeamIdentityFormalMember, 1)
	})
	t.Run("historical admitted retry never backfills memberships", func(t *testing.T) {
		u, r := create(model.TeamIdentityCommunityMember, false, false)
		if err := db.Model(&r).Update("recruitment_status", model.RecruitmentStatusAdmitted).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecordInterviewResult(ctx, actor, r.ID, InterviewDecisionInput{Decision: "admit"}); err != nil {
			t.Fatal(err)
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusAdmitted, model.TeamIdentityCommunityMember, 0)
		if _, err := service.CorrectInterviewResult(ctx, actor, r.ID, CorrectInterviewResultInput{Decision: "reject", CorrectionReason: "历史纠错"}); err != nil {
			t.Fatal(err)
		}
		assertState(u.ID, r.ID, model.RecruitmentStatusRejected, model.TeamIdentityCommunityMember, 0)
	})
}
