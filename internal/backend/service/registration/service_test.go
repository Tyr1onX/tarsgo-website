package registration

import (
	"context"
	"encoding/csv"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"errors"
	"tarsgo-backend/model"
	"tarsgo-backend/service/email"
)

func TestBuildInterviewNotificationUsesRequestedTemplates(t *testing.T) {
	name := "张三"
	reg := &model.Registration{
		User:        model.User{Name: name, Email: "zhangsan@example.com"},
		ContactName: &name,
		Form:        model.RegistrationForm{Title: "2026 纳新报名"},
		Group1:      &model.UserGroup{ID: 101, Name: "机械组"},
	}
	now := time.Date(2026, 9, 26, 0, 0, 0, 0, time.Local)

	passed := buildInterviewNotification(reg, 101, model.RegistrationInterviewPassed, now)
	if passed == nil || passed.To != reg.User.Email || !strings.Contains(passed.Subject, "通过") {
		t.Fatalf("unexpected passed notification: %#v", passed)
	}
	for _, expected := range []string{"尊敬的 张三：", "报名项目：2026 纳新报名", "面试组别：机械组", "面试结果：通过", "本次结果仅代表当前面试环节的审核结果"} {
		if !strings.Contains(passed.Body, expected) {
			t.Fatalf("passed body missing %q: %s", expected, passed.Body)
		}
	}

	failed := buildInterviewNotification(reg, 101, model.RegistrationInterviewFailed, now)
	if failed == nil || !strings.Contains(failed.Subject, "未通过") {
		t.Fatalf("unexpected failed notification: %#v", failed)
	}
	for _, expected := range []string{"尊敬的 张三：", "经综合评估，很遗憾，你未能通过本轮面试。", "面试结果：未通过", "并不代表对个人能力与发展潜力的全面评价"} {
		if !strings.Contains(failed.Body, expected) {
			t.Fatalf("failed body missing %q: %s", expected, failed.Body)
		}
	}
}

type fakeInterviewMailer struct {
	to          string
	subject     string
	body        string
	image       []byte
	contentType string
	err         error
}

func (m *fakeInterviewMailer) SendEmail(_ context.Context, message email.Message) error {
	m.to, m.subject, m.body = message.To, message.Subject, message.Text
	m.image = append([]byte(nil), message.InlineImage...)
	m.contentType = message.InlineImageType
	return m.err
}

func TestRegistrationServiceInterviewSendsPassedAndFailedNotifications(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.User = model.User{ID: repo.registration.UserID, Name: "张三", Email: "zhangsan@example.com"}
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.Group2Status = model.RegistrationStatusApproved
	mailer := &fakeInterviewMailer{}
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.mailer = mailer
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}

	if _, err := service.UpdateRegistrationInterview(context.Background(), actor, repo.registration.ID, UpdateInterviewInput{GroupID: *repo.registration.Group1ID, Status: "passed"}); err != nil {
		t.Fatalf("passed interview update returned error: %v", err)
	}
	if mailer.to != "zhangsan@example.com" || !strings.Contains(mailer.subject, "录取") || !strings.Contains(mailer.body, "最终结果：已录取") {
		t.Fatalf("unexpected passed mail: %#v", mailer)
	}

	if _, err := service.UpdateRegistrationInterview(context.Background(), actor, repo.registration.ID, UpdateInterviewInput{GroupID: *repo.registration.Group2ID, Status: "failed"}); err != nil {
		t.Fatalf("failed interview update returned error: %v", err)
	}
	if !strings.Contains(mailer.subject, "未通过") || !strings.Contains(mailer.body, "面试结果：未通过") {
		t.Fatalf("unexpected failed mail: %#v", mailer)
	}
}

func TestRegistrationServiceAdmissionEmbedsConfiguredImageButFailedResultDoesNot(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.User = model.User{ID: repo.registration.UserID, Name: "张三", Email: "zhangsan@example.com"}
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.Group2Status = model.RegistrationStatusApproved
	imageURL := "/upload/config/group/qq-group.png"
	repo.registration.Group1.AdmissionImageURL = &imageURL
	repo.shownGroups[0].AdmissionImageURL = &imageURL

	mailer := &fakeInterviewMailer{}
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.mailer = mailer
	service.loadInlineImage = func(rawURL string) ([]byte, string, error) {
		if rawURL != imageURL {
			t.Fatalf("unexpected image URL: %q", rawURL)
		}
		return []byte("png-image"), "image/png", nil
	}
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}

	if _, err := service.UpdateRegistrationInterview(context.Background(), actor, repo.registration.ID, UpdateInterviewInput{GroupID: *repo.registration.Group1ID, Status: "passed"}); err != nil {
		t.Fatalf("passed interview update returned error: %v", err)
	}
	if string(mailer.image) != "png-image" || mailer.contentType != "image/png" {
		t.Fatalf("expected configured inline image, got image=%q contentType=%q", mailer.image, mailer.contentType)
	}
	if !strings.Contains(mailer.body, "扫描邮件内的图片加入录取群") {
		t.Fatalf("admission body does not mention the inline image: %s", mailer.body)
	}

	if _, err := service.UpdateRegistrationInterview(context.Background(), actor, repo.registration.ID, UpdateInterviewInput{GroupID: *repo.registration.Group2ID, Status: "failed"}); err != nil {
		t.Fatalf("failed interview update returned error: %v", err)
	}
	if len(mailer.image) != 0 || mailer.contentType != "" {
		t.Fatalf("failed result must not include an image, got image=%q contentType=%q", mailer.image, mailer.contentType)
	}
}

func TestRegistrationServiceReviewRegistrationFullAccessApproveDoesNotChangeMemberships(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.now = func() time.Time {
		return time.Date(2026, 4, 14, 10, 0, 0, 0, time.Local)
	}

	detail, err := service.ReviewRegistration(
		context.Background(),
		RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin},
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionApprove},
	)
	if err != nil {
		t.Fatalf("ReviewRegistration returned error: %v", err)
	}

	if detail.Group1Status != model.RegistrationStatusApproved {
		t.Fatalf("expected group 1 approved, got %d", detail.Group1Status)
	}
	if detail.Group2Status != model.RegistrationStatusApproved {
		t.Fatalf("expected group 2 approved, got %d", detail.Group2Status)
	}
	if detail.Status != model.RegistrationStatusApproved {
		t.Fatalf("expected overall approved, got %d", detail.Status)
	}

	if len(repo.addedMemberships) != 0 || len(repo.removedMemberships) != 0 {
		t.Fatalf("online review must not change memberships")
	}
}

func TestRegistrationServiceLegacyGroupScopedAdminHasFullReviewAccess(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	groupID := uint64(101)
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.now = func() time.Time {
		return time.Date(2026, 4, 14, 11, 0, 0, 0, time.Local)
	}

	detail, err := service.ReviewRegistration(
		context.Background(),
		RegistrationFormActor{
			ID:                2001,
			RoleName:          model.RoleNameAdmin,
			AdminScope:        model.AdminScopeGroup,
			ManagementGroupID: &groupID,
			GroupRole:         "leader",
		},
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionApprove},
	)
	if err != nil {
		t.Fatalf("legacy group-scoped admin review returned error: %v", err)
	}
	if detail.Group1Status != model.RegistrationStatusApproved || detail.Group2Status != model.RegistrationStatusApproved || detail.Status != model.RegistrationStatusApproved {
		t.Fatalf("admin should review the full registration regardless of legacy group scope: %#v", detail)
	}
	if len(repo.addedMemberships) != 0 || len(repo.removedMemberships) != 0 {
		t.Fatalf("online review must not change memberships")
	}
}

func TestRegistrationServiceUndoApprovedReviewRestoresPendingAndAllowsReviewAgain(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.now = func() time.Time {
		return time.Date(2026, 4, 14, 12, 0, 0, 0, time.Local)
	}
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	if _, err := service.ReviewRegistration(
		context.Background(),
		actor,
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionApprove, Remark: "首次通过"},
	); err != nil {
		t.Fatalf("ReviewRegistration returned error: %v", err)
	}

	detail, err := service.UndoRegistrationReview(context.Background(), actor, repo.registration.ID)
	if err != nil {
		t.Fatalf("UndoRegistrationReview returned error: %v", err)
	}
	if detail.Group1Status != model.RegistrationStatusPending || detail.Group2Status != model.RegistrationStatusPending {
		t.Fatalf("expected both groups pending after undo, got group1=%d group2=%d", detail.Group1Status, detail.Group2Status)
	}
	if detail.Status != model.RegistrationStatusPending {
		t.Fatalf("expected overall pending after undo, got %d", detail.Status)
	}
	if detail.Reviewer1 != nil || detail.Reviewer2 != nil || detail.ReviewedAt1 != nil || detail.ReviewedAt2 != nil || detail.ReviewRemark1 != nil || detail.ReviewRemark2 != nil {
		t.Fatalf("expected review metadata cleared after undo, got %#v", detail)
	}
	if !detail.CanApprove || !detail.CanReject || detail.CanUndo {
		t.Fatalf("expected review actions restored and undo disabled, got approve=%v reject=%v undo=%v", detail.CanApprove, detail.CanReject, detail.CanUndo)
	}
	if len(repo.addedMemberships) != 0 || len(repo.removedMemberships) != 0 {
		t.Fatalf("undo online review must not change memberships")
	}

	reviewedAgain, err := service.ReviewRegistration(
		context.Background(),
		actor,
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionReject, Remark: "重新审核"},
	)
	if err != nil {
		t.Fatalf("second ReviewRegistration returned error: %v", err)
	}
	if reviewedAgain.Status != model.RegistrationStatusRejected || !reviewedAgain.CanUndo {
		t.Fatalf("expected rejected result with undo enabled after re-review, got status=%d undo=%v", reviewedAgain.Status, reviewedAgain.CanUndo)
	}
}

func TestRegistrationServiceUndoRejectedReviewRestoresPendingWithoutMembershipChanges(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	if _, err := service.ReviewRegistration(
		context.Background(),
		actor,
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionReject},
	); err != nil {
		t.Fatalf("ReviewRegistration returned error: %v", err)
	}

	detail, err := service.UndoRegistrationReview(context.Background(), actor, repo.registration.ID)
	if err != nil {
		t.Fatalf("UndoRegistrationReview returned error: %v", err)
	}
	if detail.Status != model.RegistrationStatusPending {
		t.Fatalf("expected pending after undoing rejection, got %d", detail.Status)
	}
	if len(repo.addedMemberships) != 0 || len(repo.removedMemberships) != 0 {
		t.Fatalf("expected rejection undo not to change memberships, got added=%v removed=%v", repo.addedMemberships, repo.removedMemberships)
	}
}

func TestRegistrationServiceInterviewKeepsUnresolvedAdmissionUnfinalized(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.Group2Status = model.RegistrationStatusApproved
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.now = func() time.Time {
		return time.Date(2026, 4, 14, 14, 0, 0, 0, time.Local)
	}
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}

	detail, err := service.UpdateRegistrationInterview(
		context.Background(), actor, repo.registration.ID,
		UpdateInterviewInput{GroupID: *repo.registration.Group2ID, Status: "passed"},
	)
	if err != nil {
		t.Fatalf("UpdateRegistrationInterview returned error: %v", err)
	}
	if detail.FinalStatus != model.RegistrationFinalStatusPending || detail.FinalGroup != nil {
		t.Fatalf("expected unresolved admission to remain pending, got status=%d group=%#v", detail.FinalStatus, detail.FinalGroup)
	}
	if detail.FinalizedAt != nil || detail.Finalizer != nil {
		t.Fatalf("pending admission must not have finalization metadata, got at=%#v by=%#v", detail.FinalizedAt, detail.Finalizer)
	}
	if len(repo.addedMemberships) != 0 || len(repo.removedMemberships) != 0 {
		t.Fatalf("unresolved admission must not change memberships, got added=%v removed=%v", repo.addedMemberships, repo.removedMemberships)
	}
}

func TestRegistrationServiceInterviewAdmitsFirstChoiceAndMovesMembership(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.Group2Status = model.RegistrationStatusApproved
	service := newRegistrationServiceWithDependencies(repo, nil)
	now := time.Date(2026, 4, 14, 15, 0, 0, 0, time.Local)
	service.now = func() time.Time { return now }
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}

	detail, err := service.UpdateRegistrationInterview(
		context.Background(), actor, repo.registration.ID,
		UpdateInterviewInput{GroupID: *repo.registration.Group1ID, Status: "passed"},
	)
	if err != nil {
		t.Fatalf("UpdateRegistrationInterview returned error: %v", err)
	}
	if detail.FinalStatus != model.RegistrationFinalStatusAdmitted || detail.FinalGroup == nil || detail.FinalGroup.ID != *repo.registration.Group1ID {
		t.Fatalf("expected first-choice admission, got status=%d group=%#v", detail.FinalStatus, detail.FinalGroup)
	}
	if detail.FinalizedAt == nil || !detail.FinalizedAt.Equal(now) || detail.Finalizer == nil || detail.Finalizer.ID != actor.ID {
		t.Fatalf("expected finalization metadata for admission, got at=%#v by=%#v", detail.FinalizedAt, detail.Finalizer)
	}
	assertRemovedMemberships(t, repo.removedMemberships, []fakeAddedMembership{{GroupID: 1, UserID: repo.registration.UserID}})
	assertAddedMemberships(t, repo.addedMemberships, []fakeAddedMembership{{GroupID: *repo.registration.Group1ID, UserID: repo.registration.UserID}})
}

func TestRegistrationServiceResetInterviewRevokesAdmissionAndRestoresDefaultGroup(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.Group2Status = model.RegistrationStatusApproved
	service := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}

	if _, err := service.UpdateRegistrationInterview(
		context.Background(), actor, repo.registration.ID,
		UpdateInterviewInput{GroupID: *repo.registration.Group1ID, Status: "passed"},
	); err != nil {
		t.Fatalf("first UpdateRegistrationInterview returned error: %v", err)
	}
	repo.addedMemberships = nil
	repo.removedMemberships = nil
	repo.addedMembershipKV = make(map[fakeAddedMembership]struct{})
	repo.removedMembershipKV = make(map[fakeAddedMembership]struct{})

	detail, err := service.UpdateRegistrationInterview(
		context.Background(), actor, repo.registration.ID,
		UpdateInterviewInput{GroupID: *repo.registration.Group1ID, Status: "pending"},
	)
	if err != nil {
		t.Fatalf("second UpdateRegistrationInterview returned error: %v", err)
	}
	if detail.FinalStatus != model.RegistrationFinalStatusPending || detail.FinalGroup != nil || detail.FinalizedAt != nil || detail.Finalizer != nil {
		t.Fatalf("expected admission reset to clear final result, got %#v", detail)
	}
	assertRemovedMemberships(t, repo.removedMemberships, []fakeAddedMembership{{GroupID: 101, UserID: repo.registration.UserID}})
	assertAddedMemberships(t, repo.addedMemberships, []fakeAddedMembership{{GroupID: 1, UserID: repo.registration.UserID}})
}

func TestRegistrationServiceAdminUndoReviewResetsFullReview(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	now := time.Date(2026, 4, 14, 11, 0, 0, 0, time.Local)
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.Group2Status = model.RegistrationStatusRejected
	repo.registration.Status = model.RegistrationStatusApproved
	repo.registration.ReviewerID1 = uint64Ptr(2001)
	repo.registration.Reviewer1 = cloneUserModel(repo.users[2001])
	repo.registration.ReviewedAt1 = &now
	repo.registration.ReviewerID2 = uint64Ptr(2002)
	repo.registration.Reviewer2 = cloneUserModel(repo.users[2002])
	repo.registration.ReviewedAt2 = &now
	repo.leaderGroupIDs[2001] = []uint64{101}
	service := newRegistrationServiceWithDependencies(repo, nil)

	detail, err := service.UndoRegistrationReview(
		context.Background(),
		RegistrationFormActor{ID: 2001, RoleName: model.RoleNameAdmin},
		repo.registration.ID,
	)
	if err != nil {
		t.Fatalf("UndoRegistrationReview returned error: %v", err)
	}
	if detail.Group1Status != model.RegistrationStatusPending || detail.Group2Status != model.RegistrationStatusPending {
		t.Fatalf("expected full review reset, got group1=%d group2=%d", detail.Group1Status, detail.Group2Status)
	}
	if detail.Reviewer1 != nil || detail.ReviewedAt1 != nil || detail.Reviewer2 != nil || detail.ReviewedAt2 != nil {
		t.Fatalf("expected all review metadata cleared")
	}
}

func TestRegistrationAccessScopeReviewActionAvailabilityForLeaderSlot1(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	scope := newRegistrationAccessScope(false, []uint64{101})

	item := toRegistrationListItem(repo.registration, scope)
	if !item.CanApprove || !item.CanReject {
		t.Fatalf("expected both actions enabled for leader reviewing group 1, got approve=%v reject=%v", item.CanApprove, item.CanReject)
	}
}

func TestRegistrationAccessScopeReviewActionAvailabilityAllowsUndoReviewedSlot(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.Group1Status = model.RegistrationStatusApproved
	scope := newRegistrationAccessScope(false, []uint64{101})

	item := toRegistrationListItem(repo.registration, scope)
	if item.CanApprove || item.CanReject || !item.CanUndo {
		t.Fatalf("expected only undo enabled for reviewed leader slot, got approve=%v reject=%v undo=%v", item.CanApprove, item.CanReject, item.CanUndo)
	}
}

func TestRegistrationAccessScopeReviewActionAvailabilityForLeaderSlot2(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	scope := newRegistrationAccessScope(false, []uint64{102})

	item := toRegistrationListItem(repo.registration, scope)
	if !item.CanApprove || !item.CanReject {
		t.Fatalf("expected both actions enabled for leader reviewing group 2, got approve=%v reject=%v", item.CanApprove, item.CanReject)
	}
}

func TestRegistrationServiceListRegistrationsReturnsPagination(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)

	status := uint8(model.RegistrationStatusPending)
	formID := uint64(301)
	result, err := service.ListRegistrations(
		context.Background(),
		RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin},
		ListRegistrationsInput{
			Page:     5,
			PageSize: 10,
			Keyword:  " 张三 ",
			Status:   &status,
			FormID:   &formID,
		},
	)
	if err != nil {
		t.Fatalf("ListRegistrations returned error: %v", err)
	}

	if result.Pagination.Page != 3 {
		t.Fatalf("expected clamped page 3, got %d", result.Pagination.Page)
	}
	if result.Pagination.PageSize != 10 {
		t.Fatalf("expected page size 10, got %d", result.Pagination.PageSize)
	}
	if result.Pagination.Total != 23 {
		t.Fatalf("expected total 23, got %d", result.Pagination.Total)
	}
	if result.Pagination.TotalPages != 3 {
		t.Fatalf("expected total pages 3, got %d", result.Pagination.TotalPages)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 list item, got %d", len(result.Items))
	}
	if len(repo.listFilters) != 1 {
		t.Fatalf("expected 1 list filter call, got %d", len(repo.listFilters))
	}
	if repo.listFilters[0].Page != 3 {
		t.Fatalf("expected repository list page 3, got %d", repo.listFilters[0].Page)
	}
	if repo.listFilters[0].Keyword != "张三" {
		t.Fatalf("expected trimmed keyword, got %q", repo.listFilters[0].Keyword)
	}
	if len(repo.statsFilters) != 1 {
		t.Fatalf("expected 1 stats filter call, got %d", len(repo.statsFilters))
	}
	if repo.statsFilters[0].Status != nil {
		t.Fatalf("expected stats filter status cleared, got %v", *repo.statsFilters[0].Status)
	}
}

func TestRegistrationServiceListRegistrationsNormalizesDefaultPageParams(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)

	result, err := service.ListRegistrations(
		context.Background(),
		RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin},
		ListRegistrationsInput{},
	)
	if err != nil {
		t.Fatalf("ListRegistrations returned error: %v", err)
	}

	if result.Pagination.Page != 1 {
		t.Fatalf("expected default page 1, got %d", result.Pagination.Page)
	}
	if result.Pagination.PageSize != 10 {
		t.Fatalf("expected default page size 10, got %d", result.Pagination.PageSize)
	}
	if len(repo.listFilters) != 1 {
		t.Fatalf("expected 1 list filter call, got %d", len(repo.listFilters))
	}
	if repo.listFilters[0].Page != 1 {
		t.Fatalf("expected repository page 1, got %d", repo.listFilters[0].Page)
	}
	if repo.listFilters[0].PageSize != 10 {
		t.Fatalf("expected repository page size 10, got %d", repo.listFilters[0].PageSize)
	}
}

func TestRegistrationServiceListRegistrationsPreservesStatsFilterSemantics(t *testing.T) {
	status := uint8(model.RegistrationStatusApproved)
	formID := uint64(301)
	groupID := uint64(101)

	tests := []struct {
		name                string
		actor               RegistrationFormActor
		input               ListRegistrationsInput
		wantKeyword         string
		wantFormID          *uint64
		wantVisibleGroupIDs []uint64
		wantCountStatus     *uint8
	}{
		{
			name:  "no filters",
			actor: RegistrationFormActor{ID: 9001, RoleName: model.RoleNameSuperAdmin},
		},
		{
			name:            "status filter only affects pagination total and list",
			actor:           RegistrationFormActor{ID: 9001, RoleName: model.RoleNameSuperAdmin},
			input:           ListRegistrationsInput{Status: &status},
			wantCountStatus: &status,
		},
		{
			name:        "keyword is normalized and preserved for stats",
			actor:       RegistrationFormActor{ID: 9001, RoleName: model.RoleNameSuperAdmin},
			input:       ListRegistrationsInput{Keyword: " 张三 "},
			wantKeyword: "张三",
		},
		{
			name:       "form filter is preserved for stats",
			actor:      RegistrationFormActor{ID: 9001, RoleName: model.RoleNameSuperAdmin},
			input:      ListRegistrationsInput{FormID: &formID},
			wantFormID: &formID,
		},
		{
			name: "legacy group scope does not restrict admin stats",
			actor: RegistrationFormActor{
				ID:                2001,
				RoleName:          model.RoleNameAdmin,
				AdminScope:        model.AdminScopeGroup,
				ManagementGroupID: &groupID,
				GroupRole:         "leader",
			},
			wantVisibleGroupIDs: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newFakeRegistrationListRepository()
			service := newRegistrationServiceWithDependencies(repo, nil)

			result, err := service.ListRegistrations(context.Background(), tt.actor, tt.input)
			if err != nil {
				t.Fatalf("ListRegistrations returned error: %v", err)
			}
			if result.Summary != repo.stats {
				t.Fatalf("expected all stats fields %#v, got %#v", repo.stats, result.Summary)
			}
			if len(repo.statsFilters) != 1 {
				t.Fatalf("expected 1 stats filter call, got %d", len(repo.statsFilters))
			}
			statsFilter := repo.statsFilters[0]
			if statsFilter.Status != nil {
				t.Fatalf("expected stats filter to ignore current status, got %v", *statsFilter.Status)
			}
			if statsFilter.Keyword != tt.wantKeyword {
				t.Fatalf("expected stats keyword %q, got %q", tt.wantKeyword, statsFilter.Keyword)
			}
			if tt.wantFormID == nil {
				if statsFilter.FormID != nil {
					t.Fatalf("expected no stats form filter, got %d", *statsFilter.FormID)
				}
			} else if statsFilter.FormID == nil || *statsFilter.FormID != *tt.wantFormID {
				t.Fatalf("expected stats form ID %d, got %#v", *tt.wantFormID, statsFilter.FormID)
			}
			if len(statsFilter.VisibleGroupIDs) != len(tt.wantVisibleGroupIDs) {
				t.Fatalf("expected stats visible groups %v, got %v", tt.wantVisibleGroupIDs, statsFilter.VisibleGroupIDs)
			}
			for index, groupID := range tt.wantVisibleGroupIDs {
				if statsFilter.VisibleGroupIDs[index] != groupID {
					t.Fatalf("expected stats visible groups %v, got %v", tt.wantVisibleGroupIDs, statsFilter.VisibleGroupIDs)
				}
			}
			if len(repo.countFilters) != 1 {
				t.Fatalf("expected 1 count filter call, got %d", len(repo.countFilters))
			}
			countStatus := repo.countFilters[0].Status
			if tt.wantCountStatus == nil {
				if countStatus != nil {
					t.Fatalf("expected pagination count without status filter, got %v", *countStatus)
				}
			} else if countStatus == nil || *countStatus != *tt.wantCountStatus {
				t.Fatalf("expected pagination count status %d, got %#v", *tt.wantCountStatus, countStatus)
			}
		})
	}
}

func TestRegistrationServiceExportFormRegistrationsCSVIncludesDynamicFieldsAndExtraKeys(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)

	result, err := service.ExportFormRegistrationsCSV(
		context.Background(),
		RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin},
		301,
		"https://admin.example.com",
	)
	if err != nil {
		t.Fatalf("ExportFormRegistrationsCSV returned error: %v", err)
	}

	if result.FileName != "registration-form-301-registrations.csv" {
		t.Fatalf("unexpected export filename %q", result.FileName)
	}
	if len(repo.exportFilters) != 1 {
		t.Fatalf("expected 1 export filter call, got %d", len(repo.exportFilters))
	}
	if repo.exportFilters[0].FormID == nil || *repo.exportFilters[0].FormID != 301 {
		t.Fatalf("expected export filter form ID 301, got %#v", repo.exportFilters[0].FormID)
	}
	if len(repo.exportFilters[0].VisibleGroupIDs) != 0 {
		t.Fatalf("expected full-access export to omit visible group filters, got %v", repo.exportFilters[0].VisibleGroupIDs)
	}

	content := strings.TrimPrefix(string(result.Content), "\ufeff")
	records, err := csv.NewReader(strings.NewReader(content)).ReadAll()
	if err != nil {
		t.Fatalf("failed to parse export csv: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 csv records, got %d", len(records))
	}

	headerIndex := make(map[string]int, len(records[0]))
	for index, item := range records[0] {
		headerIndex[item] = index
	}

	expectedHeaders := []string{
		"报名记录ID",
		"报名表ID",
		"报名表标题",
		"姓名",
		"手机号",
		"邮箱",
		"意向组别(1)",
		"意向组别(1)审核状态",
		"审核人(1)",
		"审核时间(1)",
		"审核备注(1)",
		"意向组别(2)",
		"意向组别(2)审核状态",
		"审核人(2)",
		"审核时间(2)",
		"审核备注(2)",
		"意向方向",
		"掌握技能",
		"简历",
		"作品集",
		"报名状态",
		"提交时间",
		"legacy_note",
	}
	if len(records[0]) != len(expectedHeaders) {
		t.Fatalf("expected %d csv headers, got %d: %v", len(expectedHeaders), len(records[0]), records[0])
	}
	for index, header := range expectedHeaders {
		if records[0][index] != header {
			t.Fatalf("expected csv header[%d] = %q, got %q", index, header, records[0][index])
		}
	}

	row := records[1]
	if row[headerIndex["姓名"]] != "张三" {
		t.Fatalf("expected contact name column 张三, got %q", row[headerIndex["姓名"]])
	}
	if row[headerIndex["手机号"]] != "13800138000" {
		t.Fatalf("expected contact phone column 13800138000, got %q", row[headerIndex["手机号"]])
	}
	if row[headerIndex["邮箱"]] != "zhangsan@example.com" {
		t.Fatalf("expected contact email column zhangsan@example.com, got %q", row[headerIndex["邮箱"]])
	}
	if row[headerIndex["报名状态"]] != "已通过" {
		t.Fatalf("expected overall status label 已通过, got %q", row[headerIndex["报名状态"]])
	}
	if row[headerIndex["意向组别(1)"]] != "机械组" {
		t.Fatalf("expected group_1 label 机械组, got %q", row[headerIndex["意向组别(1)"]])
	}
	if row[headerIndex["意向方向"]] != "电控组" {
		t.Fatalf("expected direction option label 电控组, got %q", row[headerIndex["意向方向"]])
	}
	if row[headerIndex["掌握技能"]] != "C++；Go" {
		t.Fatalf("expected checkbox options joined by full-width separator, got %q", row[headerIndex["掌握技能"]])
	}
	if row[headerIndex["简历"]] != "张三简历.pdf: https://admin.example.com/api/admin/registrations/7001/files/resume/0" {
		t.Fatalf("unexpected resume export value %q", row[headerIndex["简历"]])
	}
	if row[headerIndex["作品集"]] != "作品图1.png: https://admin.example.com/api/admin/registrations/7001/files/portfolio/0；作品图2.png: https://admin.example.com/api/admin/registrations/7001/files/portfolio/1" {
		t.Fatalf("unexpected portfolio export value %q", row[headerIndex["作品集"]])
	}
	if row[headerIndex["意向组别(1)审核状态"]] != "已通过" {
		t.Fatalf("expected group_1 review status 已通过, got %q", row[headerIndex["意向组别(1)审核状态"]])
	}
	if row[headerIndex["审核人(1)"]] != "审核管理员" {
		t.Fatalf("expected reviewer1 审核管理员, got %q", row[headerIndex["审核人(1)"]])
	}
	if row[headerIndex["意向组别(2)审核状态"]] != "已拒绝" {
		t.Fatalf("expected group_2 review status 已拒绝, got %q", row[headerIndex["意向组别(2)审核状态"]])
	}
	if row[headerIndex["审核人(2)"]] != "复核管理员" {
		t.Fatalf("expected reviewer2 复核管理员, got %q", row[headerIndex["审核人(2)"]])
	}
	if _, exists := headerIndex["更新时间"]; exists {
		t.Fatalf("did not expect 更新时间 column, got %v", records[0])
	}
	if row[headerIndex["legacy_note"]] != "'=需要人工复核" {
		t.Fatalf("expected legacy note to be formula-safe, got %q", row[headerIndex["legacy_note"]])
	}
}

func TestRegistrationServiceExportIgnoresLegacyAdminGroupScope(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	repo.leaderGroupIDs[2001] = []uint64{101}
	service := newRegistrationServiceWithDependencies(repo, nil)

	_, err := service.ExportFormRegistrationsCSV(
		context.Background(),
		RegistrationFormActor{ID: 2001, RoleName: model.RoleNameAdmin},
		301,
		"https://admin.example.com",
	)
	if err != nil {
		t.Fatalf("ExportFormRegistrationsCSV returned error: %v", err)
	}

	if len(repo.exportFilters) != 1 {
		t.Fatalf("expected 1 export filter call, got %d", len(repo.exportFilters))
	}
	if len(repo.exportFilters[0].VisibleGroupIDs) != 0 {
		t.Fatalf("admin export should not be restricted by legacy group scope, got %v", repo.exportFilters[0].VisibleGroupIDs)
	}
}

func TestRegistrationServiceUpdateRecruitmentRegistrationAllowsEditablePendingRegistration(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.now = func() time.Time {
		return time.Date(2026, 4, 14, 12, 0, 0, 0, time.Local)
	}

	result, err := service.UpdateRecruitmentRegistration(
		context.Background(),
		RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser},
		repo.registration.ID,
		SubmitRegistrationInput{
			Values: map[string][]string{
				"name":      {"李四"},
				"phone":     {"13900139000"},
				"email":     {"lisi@example.com"},
				"group_1":   {"102"},
				"group_2":   {"101"},
				"direction": {"embedded"},
			},
		},
	)
	if err != nil {
		t.Fatalf("UpdateRecruitmentRegistration returned error: %v", err)
	}

	if result.Status != model.RegistrationStatusPending {
		t.Fatalf("expected pending status after resubmit, got %d", result.Status)
	}
	if repo.registration == nil {
		t.Fatalf("expected registration to remain present after update")
	}
	if repo.registration.ContactName == nil || *repo.registration.ContactName != "李四" {
		t.Fatalf("expected updated contact name, got %#v", repo.registration.ContactName)
	}
	if repo.registration.ContactPhone == nil || *repo.registration.ContactPhone != "13900139000" {
		t.Fatalf("expected updated contact phone, got %#v", repo.registration.ContactPhone)
	}
	if repo.registration.ContactEmail == nil || *repo.registration.ContactEmail != "lisi@example.com" {
		t.Fatalf("expected updated contact email, got %#v", repo.registration.ContactEmail)
	}
	if repo.registration.Group1ID == nil || *repo.registration.Group1ID != 102 {
		t.Fatalf("expected updated group 1, got %#v", repo.registration.Group1ID)
	}
	if repo.registration.Group2ID == nil || *repo.registration.Group2ID != 101 {
		t.Fatalf("expected updated group 2, got %#v", repo.registration.Group2ID)
	}
	if repo.registration.FormData["direction"] != "embedded" {
		t.Fatalf("expected updated direction, got %#v", repo.registration.FormData["direction"])
	}
}

func TestRegistrationServiceUpdateRecruitmentRegistrationRejectsReviewedRegistration(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	now := time.Date(2026, 4, 14, 11, 0, 0, 0, time.Local)
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.ReviewedAt1 = &now
	service := newRegistrationServiceWithDependencies(repo, nil)

	_, err := service.UpdateRecruitmentRegistration(
		context.Background(),
		RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser},
		repo.registration.ID,
		SubmitRegistrationInput{
			Values: map[string][]string{
				"name":      {"李四"},
				"phone":     {"13900139000"},
				"email":     {"lisi@example.com"},
				"group_1":   {"102"},
				"group_2":   {"101"},
				"direction": {"embedded"},
			},
		},
	)
	assertRegistrationServiceError(t, err, 409, "进入审核")
}

func TestRegistrationServiceCancelRecruitmentRegistrationDeletesEditablePendingRegistration(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)

	err := service.CancelRecruitmentRegistration(
		context.Background(),
		RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser},
		repo.registration.ID,
	)
	if err != nil {
		t.Fatalf("CancelRecruitmentRegistration returned error: %v", err)
	}
	if repo.registration != nil {
		t.Fatalf("expected registration to be deleted after cancel")
	}
}

func TestRegistrationServiceCancelRecruitmentRegistrationRejectsReviewedRegistration(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	now := time.Date(2026, 4, 14, 11, 0, 0, 0, time.Local)
	repo.registration.Group2Status = model.RegistrationStatusRejected
	repo.registration.ReviewedAt2 = &now
	service := newRegistrationServiceWithDependencies(repo, nil)

	err := service.CancelRecruitmentRegistration(
		context.Background(),
		RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser},
		repo.registration.ID,
	)
	assertRegistrationServiceError(t, err, 409, "进入审核")
}

type fakeRegistrationReviewRepository struct {
	registration        *model.Registration
	shownGroups         []model.UserGroup
	defaultGroupIDs     []uint64
	leaderGroupIDs      map[uint64][]uint64
	users               map[uint64]*model.User
	addedMemberships    []fakeAddedMembership
	removedMemberships  []fakeAddedMembership
	addedMembershipKV   map[fakeAddedMembership]struct{}
	removedMembershipKV map[fakeAddedMembership]struct{}
}

type fakeAddedMembership struct {
	GroupID uint64
	UserID  uint64
}

func newFakeRegistrationReviewRepository() *fakeRegistrationReviewRepository {
	group1ID := uint64(101)
	group2ID := uint64(102)
	now := time.Date(2026, 4, 14, 9, 0, 0, 0, time.Local)

	return &fakeRegistrationReviewRepository{
		registration: &model.Registration{
			ID:           7001,
			FormID:       301,
			UserID:       501,
			FormData:     map[string]any{"name": "张三", "group_1": "101", "group_2": "102"},
			ContactName:  stringPtr("张三"),
			ContactPhone: stringPtr("13800138000"),
			ContactEmail: stringPtr("zhangsan@example.com"),
			Group1ID:     &group1ID,
			Group1Status: model.RegistrationStatusPending,
			Group2ID:     &group2ID,
			Group2Status: model.RegistrationStatusPending,
			Status:       model.RegistrationStatusPending,
			SubmittedAt:  now.Add(-2 * time.Hour),
			UpdatedAt:    now.Add(-90 * time.Minute),
			Form: model.RegistrationForm{
				ID:           301,
				Title:        "2026 招新报名",
				FieldsSchema: validRegistrationFields(),
				Status:       model.RegistrationFormStatusPublished,
			},
			Group1: &model.UserGroup{ID: group1ID, Name: "机械组", Show: 1},
			Group2: &model.UserGroup{ID: group2ID, Name: "电控组", Show: 1},
		},
		shownGroups: []model.UserGroup{
			{ID: 101, Name: "机械组", Show: 1},
			{ID: 102, Name: "电控组", Show: 1},
		},
		defaultGroupIDs: []uint64{1},
		leaderGroupIDs:  map[uint64][]uint64{},
		users: map[uint64]*model.User{
			2001: {ID: 2001, Name: "机械组长", Email: "leader1@example.com"},
			2002: {ID: 2002, Name: "电控组长", Email: "leader2@example.com"},
			9001: {ID: 9001, Name: "审核管理员", Email: "admin@example.com"},
		},
		addedMembershipKV:   make(map[fakeAddedMembership]struct{}),
		removedMembershipKV: make(map[fakeAddedMembership]struct{}),
	}
}

func (r *fakeRegistrationReviewRepository) RunInTx(_ context.Context, fn func(repo registrationRepository) error) error {
	return fn(r)
}

func (r *fakeRegistrationReviewRepository) ListPublishedForms(_ context.Context) ([]model.RegistrationForm, error) {
	return nil, nil
}

func (r *fakeRegistrationReviewRepository) GetFormByID(_ context.Context, _ uint64) (*model.RegistrationForm, error) {
	if r.registration == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneRegistrationFormModel(&r.registration.Form), nil
}

func (r *fakeRegistrationReviewRepository) FindRegistrationByFormAndUser(_ context.Context, _, _ uint64) (*model.Registration, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationReviewRepository) CountRegistrationsByFormID(_ context.Context, _ uint64) (int64, error) {
	return 0, nil
}

func (r *fakeRegistrationReviewRepository) CreateRegistration(_ context.Context, _ *model.Registration) error {
	return nil
}

func (r *fakeRegistrationReviewRepository) UpdateRegistration(_ context.Context, registrationID uint64, updates map[string]any) error {
	if r.registration == nil || r.registration.ID != registrationID {
		return gorm.ErrRecordNotFound
	}

	if value, ok := updates["contact_name"].(*string); ok {
		r.registration.ContactName = copyStringPtr(value)
	} else if updates["contact_name"] == nil {
		r.registration.ContactName = nil
	}
	if value, ok := updates["contact_phone"].(*string); ok {
		r.registration.ContactPhone = copyStringPtr(value)
	} else if updates["contact_phone"] == nil {
		r.registration.ContactPhone = nil
	}
	if value, ok := updates["contact_email"].(*string); ok {
		r.registration.ContactEmail = copyStringPtr(value)
	} else if updates["contact_email"] == nil {
		r.registration.ContactEmail = nil
	}
	if value, ok := updates["group_1"].(*uint64); ok {
		r.registration.Group1ID = copyUint64Ptr(value)
	}
	if value, ok := updates["group_2"].(*uint64); ok {
		r.registration.Group2ID = copyUint64Ptr(value)
	}
	if value, ok := updates["group_1_status"].(uint8); ok {
		r.registration.Group1Status = value
	}
	if value, ok := updates["group_2_status"].(uint8); ok {
		r.registration.Group2Status = value
	}
	if value, ok := updates["status"].(uint8); ok {
		r.registration.Status = value
	}
	if value, ok := updates["reviewer_id_1"].(uint64); ok {
		r.registration.ReviewerID1 = uint64Ptr(value)
		r.registration.Reviewer1 = cloneUserModel(r.users[value])
	} else if _, ok := updates["reviewer_id_1"]; ok {
		r.registration.ReviewerID1 = nil
		r.registration.Reviewer1 = nil
	}
	if value, ok := updates["reviewer_id_2"].(uint64); ok {
		r.registration.ReviewerID2 = uint64Ptr(value)
		r.registration.Reviewer2 = cloneUserModel(r.users[value])
	} else if _, ok := updates["reviewer_id_2"]; ok {
		r.registration.ReviewerID2 = nil
		r.registration.Reviewer2 = nil
	}
	if value, ok := updates["reviewed_at_1"].(time.Time); ok {
		r.registration.ReviewedAt1 = copyTimePtr(&value)
	} else if _, ok := updates["reviewed_at_1"]; ok {
		r.registration.ReviewedAt1 = nil
	}
	if value, ok := updates["reviewed_at_2"].(time.Time); ok {
		r.registration.ReviewedAt2 = copyTimePtr(&value)
	} else if _, ok := updates["reviewed_at_2"]; ok {
		r.registration.ReviewedAt2 = nil
	}
	if value, ok := updates["review_remark_1"].(*string); ok {
		r.registration.ReviewRemark1 = copyStringPtr(value)
	} else if updates["review_remark_1"] == nil {
		r.registration.ReviewRemark1 = nil
	}
	if value, ok := updates["review_remark_2"].(*string); ok {
		r.registration.ReviewRemark2 = copyStringPtr(value)
	} else if updates["review_remark_2"] == nil {
		r.registration.ReviewRemark2 = nil
	}
	if value, ok := updates["submitted_at"].(time.Time); ok {
		r.registration.SubmittedAt = value
	}
	if value, ok := updates["final_status"].(uint8); ok {
		r.registration.FinalStatus = value
	}
	if value, ok := updates["final_group_id"].(*uint64); ok && value != nil {
		r.registration.FinalGroupID = copyUint64Ptr(value)
		r.registration.FinalGroup = cloneGroupModel(groupByID(r.shownGroups, *value))
	} else if _, ok := updates["final_group_id"]; ok {
		r.registration.FinalGroupID = nil
		r.registration.FinalGroup = nil
	}
	if value, ok := updates["finalized_at"].(*time.Time); ok {
		r.registration.FinalizedAt = copyTimePtr(value)
	} else if _, ok := updates["finalized_at"]; ok {
		r.registration.FinalizedAt = nil
	}
	if value, ok := updates["finalized_by"].(*uint64); ok {
		r.registration.FinalizedBy = copyUint64Ptr(value)
		r.registration.Finalizer = cloneUserModel(r.users[*value])
	} else if _, ok := updates["finalized_by"]; ok {
		r.registration.FinalizedBy = nil
		r.registration.Finalizer = nil
	}

	updatedAt := time.Now()
	r.registration.UpdatedAt = updatedAt
	return nil
}

func (r *fakeRegistrationReviewRepository) UpsertRegistrationInterview(_ context.Context, interview *model.RegistrationInterview) error {
	for i := range r.registration.Interviews {
		if r.registration.Interviews[i].GroupID == interview.GroupID {
			r.registration.Interviews[i] = *interview
			return nil
		}
	}
	r.registration.Interviews = append(r.registration.Interviews, *interview)
	return nil
}

func (r *fakeRegistrationReviewRepository) UpdateRegistrationFormData(_ context.Context, registrationID uint64, formData map[string]any) error {
	if r.registration == nil || r.registration.ID != registrationID {
		return gorm.ErrRecordNotFound
	}
	r.registration.FormData = cloneMap(formData)
	return nil
}

func (r *fakeRegistrationReviewRepository) ListRegistrations(_ context.Context, _ ListRegistrationsInput) ([]model.Registration, error) {
	return nil, nil
}

func (r *fakeRegistrationReviewRepository) ListRegistrationsForExport(_ context.Context, _ ListRegistrationsInput) ([]model.Registration, error) {
	return nil, nil
}

func (r *fakeRegistrationReviewRepository) CountRegistrations(_ context.Context, _ ListRegistrationsInput) (int64, error) {
	return 0, nil
}

func (r *fakeRegistrationReviewRepository) GetRegistrationStats(_ context.Context, _ ListRegistrationsInput) (RegistrationStats, error) {
	return RegistrationStats{}, nil
}

func (r *fakeRegistrationReviewRepository) GetRegistrationByID(_ context.Context, registrationID uint64) (*model.Registration, error) {
	if r.registration == nil || r.registration.ID != registrationID {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneRegistrationModel(r.registration), nil
}

func (r *fakeRegistrationReviewRepository) GetRegistrationByIDForUpdate(_ context.Context, registrationID uint64) (*model.Registration, error) {
	return r.GetRegistrationByID(context.Background(), registrationID)
}

func (r *fakeRegistrationReviewRepository) DeleteRegistration(_ context.Context, registrationID uint64) error {
	if r.registration == nil || r.registration.ID != registrationID {
		return gorm.ErrRecordNotFound
	}
	r.registration = nil
	return nil
}

func (r *fakeRegistrationReviewRepository) ListShownUserGroups(_ context.Context) ([]model.UserGroup, error) {
	return append([]model.UserGroup(nil), r.shownGroups...), nil
}

func (r *fakeRegistrationReviewRepository) ListDefaultGroupIDs(_ context.Context) ([]uint64, error) {
	return append([]uint64(nil), r.defaultGroupIDs...), nil
}

func (r *fakeRegistrationReviewRepository) ListLeaderGroupIDs(_ context.Context, userID uint64) ([]uint64, error) {
	groupIDs := r.leaderGroupIDs[userID]
	return append([]uint64(nil), groupIDs...), nil
}

func (r *fakeRegistrationReviewRepository) AddUserToGroupIfAbsent(_ context.Context, groupID uint64, userID uint64) error {
	key := fakeAddedMembership{GroupID: groupID, UserID: userID}
	if _, exists := r.addedMembershipKV[key]; exists {
		return nil
	}
	r.addedMembershipKV[key] = struct{}{}
	r.addedMemberships = append(r.addedMemberships, key)
	return nil
}

func (r *fakeRegistrationReviewRepository) RemoveUserFromGroupIfPresent(_ context.Context, groupID uint64, userID uint64) error {
	key := fakeAddedMembership{GroupID: groupID, UserID: userID}
	if _, exists := r.removedMembershipKV[key]; exists {
		return nil
	}
	r.removedMembershipKV[key] = struct{}{}
	r.removedMemberships = append(r.removedMemberships, key)
	return nil
}

func cloneRegistrationModel(registration *model.Registration) *model.Registration {
	if registration == nil {
		return nil
	}

	cloned := *registration
	cloned.FormData = cloneMap(registration.FormData)
	cloned.ContactName = copyStringPtr(registration.ContactName)
	cloned.ContactPhone = copyStringPtr(registration.ContactPhone)
	cloned.ContactEmail = copyStringPtr(registration.ContactEmail)
	cloned.Group1ID = copyUint64Ptr(registration.Group1ID)
	cloned.Group2ID = copyUint64Ptr(registration.Group2ID)
	cloned.ReviewerID1 = copyUint64Ptr(registration.ReviewerID1)
	cloned.ReviewerID2 = copyUint64Ptr(registration.ReviewerID2)
	cloned.ReviewedAt1 = copyTimePtr(registration.ReviewedAt1)
	cloned.ReviewedAt2 = copyTimePtr(registration.ReviewedAt2)
	cloned.ReviewRemark1 = copyStringPtr(registration.ReviewRemark1)
	cloned.ReviewRemark2 = copyStringPtr(registration.ReviewRemark2)
	cloned.FinalGroupID = copyUint64Ptr(registration.FinalGroupID)
	cloned.FinalizedAt = copyTimePtr(registration.FinalizedAt)
	cloned.FinalizedBy = copyUint64Ptr(registration.FinalizedBy)
	cloned.Interviews = append([]model.RegistrationInterview(nil), registration.Interviews...)
	cloned.Form = *cloneRegistrationFormModel(&registration.Form)
	cloned.Group1 = cloneGroupModel(registration.Group1)
	cloned.Group2 = cloneGroupModel(registration.Group2)
	cloned.Reviewer1 = cloneUserModel(registration.Reviewer1)
	cloned.Reviewer2 = cloneUserModel(registration.Reviewer2)
	cloned.FinalGroup = cloneGroupModel(registration.FinalGroup)
	cloned.Finalizer = cloneUserModel(registration.Finalizer)
	return &cloned
}

func groupByID(groups []model.UserGroup, id uint64) *model.UserGroup {
	for i := range groups {
		if groups[i].ID == id {
			return &groups[i]
		}
	}
	return nil
}

type fakeRegistrationListRepository struct {
	items          []model.Registration
	forms          map[uint64]*model.RegistrationForm
	shownGroups    []model.UserGroup
	total          int64
	stats          RegistrationStats
	leaderGroupIDs map[uint64][]uint64
	listFilters    []ListRegistrationsInput
	exportFilters  []ListRegistrationsInput
	countFilters   []ListRegistrationsInput
	statsFilters   []ListRegistrationsInput
}

func newFakeRegistrationListRepository() *fakeRegistrationListRepository {
	group1ID := uint64(101)
	group2ID := uint64(102)
	now := time.Date(2026, 4, 14, 9, 0, 0, 0, time.Local)
	fields := []model.FormField{
		{Key: "name", Label: "姓名", Type: "text", Required: true},
		{Key: "phone", Label: "手机号", Type: "phone", Required: true},
		{Key: "email", Label: "邮箱", Type: "email", Required: true},
		{Key: "group_1", Label: "意向组别(1)", Type: "user_group_select", Required: true},
		{Key: "group_2", Label: "意向组别(2)", Type: "user_group_select", Required: true},
		{
			Key:      "direction",
			Label:    "意向方向",
			Type:     "select",
			Required: true,
			Options: []model.FormFieldOption{
				{Label: "机械组", Value: "mechanical"},
				{Label: "电控组", Value: "embedded"},
			},
		},
		{
			Key:      "skills",
			Label:    "掌握技能",
			Type:     "checkbox",
			Required: false,
			Options: []model.FormFieldOption{
				{Label: "C++", Value: "cpp"},
				{Label: "Go", Value: "go"},
			},
		},
		{Key: "resume", Label: "简历", Type: "file", Required: false},
		{Key: "portfolio", Label: "作品集", Type: "image", Required: false},
	}
	form := &model.RegistrationForm{
		ID:           301,
		Title:        "2026 招新报名",
		FieldsSchema: fields,
		Status:       model.RegistrationFormStatusPublished,
	}

	return &fakeRegistrationListRepository{
		items: []model.Registration{
			{
				ID:     7001,
				FormID: 301,
				UserID: 501,
				FormData: map[string]any{
					"name":        "张三",
					"phone":       "13800138000",
					"email":       "zhangsan@example.com",
					"group_1":     "101",
					"group_2":     "102",
					"direction":   "embedded",
					"skills":      []any{"cpp", "go"},
					"legacy_note": "=需要人工复核",
					"resume": map[string]any{
						"file_name":    "张三简历.pdf",
						"file_url":     "/api/admin/registrations/7001/files/resume/0",
						"file_size":    1024,
						"storage_path": "upload/recruitment/301/501/resume/resume.pdf",
						"content_type": "application/pdf",
					},
					"portfolio": []any{
						map[string]any{
							"file_name":    "作品图1.png",
							"file_url":     "/api/admin/registrations/7001/files/portfolio/0",
							"file_size":    2048,
							"storage_path": "upload/recruitment/301/501/portfolio/0.png",
							"content_type": "image/png",
						},
						map[string]any{
							"file_name":    "作品图2.png",
							"file_url":     "/api/admin/registrations/7001/files/portfolio/1",
							"file_size":    4096,
							"storage_path": "upload/recruitment/301/501/portfolio/1.png",
							"content_type": "image/png",
						},
					},
				},
				ContactName:   stringPtr("张三"),
				ContactPhone:  stringPtr("13800138000"),
				ContactEmail:  stringPtr("zhangsan@example.com"),
				Group1ID:      &group1ID,
				Group1Status:  model.RegistrationStatusApproved,
				Group2ID:      &group2ID,
				Group2Status:  model.RegistrationStatusRejected,
				Status:        model.RegistrationStatusApproved,
				SubmittedAt:   now.Add(-2 * time.Hour),
				UpdatedAt:     now.Add(-90 * time.Minute),
				Reviewer1:     &model.User{ID: 9001, Name: "审核管理员", Email: "admin@example.com"},
				ReviewedAt1:   ptrTime(now.Add(-75 * time.Minute)),
				ReviewRemark1: stringPtr("一志愿通过"),
				Reviewer2:     &model.User{ID: 9002, Name: "复核管理员", Email: "reviewer@example.com"},
				ReviewedAt2:   ptrTime(now.Add(-60 * time.Minute)),
				ReviewRemark2: stringPtr("二志愿名额已满"),
				Form:          *cloneRegistrationFormModel(form),
				Group1:        &model.UserGroup{ID: group1ID, Name: "机械组", Show: 1},
				Group2:        &model.UserGroup{ID: group2ID, Name: "电控组", Show: 1},
			},
		},
		forms: map[uint64]*model.RegistrationForm{
			301: form,
		},
		shownGroups: []model.UserGroup{
			{ID: group1ID, Name: "机械组", Show: 1},
			{ID: group2ID, Name: "电控组", Show: 1},
		},
		total: 23,
		stats: RegistrationStats{
			Total:     24,
			Pending:   9,
			Approved:  8,
			Rejected:  5,
			Cancelled: 2,
		},
		leaderGroupIDs: map[uint64][]uint64{},
	}
}

func (r *fakeRegistrationListRepository) RunInTx(_ context.Context, fn func(repo registrationRepository) error) error {
	return fn(r)
}

func (r *fakeRegistrationListRepository) ListPublishedForms(_ context.Context) ([]model.RegistrationForm, error) {
	return nil, nil
}

func (r *fakeRegistrationListRepository) GetFormByID(_ context.Context, formID uint64) (*model.RegistrationForm, error) {
	form, exists := r.forms[formID]
	if !exists {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneRegistrationFormModel(form), nil
}

func (r *fakeRegistrationListRepository) FindRegistrationByFormAndUser(_ context.Context, _, _ uint64) (*model.Registration, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationListRepository) CountRegistrationsByFormID(_ context.Context, _ uint64) (int64, error) {
	return 0, nil
}

func (r *fakeRegistrationListRepository) CreateRegistration(_ context.Context, _ *model.Registration) error {
	return nil
}

func (r *fakeRegistrationListRepository) UpdateRegistration(_ context.Context, _ uint64, _ map[string]any) error {
	return nil
}

func (r *fakeRegistrationListRepository) UpsertRegistrationInterview(_ context.Context, _ *model.RegistrationInterview) error {
	return nil
}

func (r *fakeRegistrationListRepository) UpdateRegistrationFormData(_ context.Context, _ uint64, _ map[string]any) error {
	return nil
}

func (r *fakeRegistrationListRepository) ListRegistrations(_ context.Context, filter ListRegistrationsInput) ([]model.Registration, error) {
	r.listFilters = append(r.listFilters, filter)
	return r.filteredRegistrations(filter), nil
}

func (r *fakeRegistrationListRepository) ListRegistrationsForExport(_ context.Context, filter ListRegistrationsInput) ([]model.Registration, error) {
	r.exportFilters = append(r.exportFilters, filter)
	return r.filteredRegistrations(filter), nil
}

func (r *fakeRegistrationListRepository) filteredRegistrations(filter ListRegistrationsInput) []model.Registration {
	registrations := make([]model.Registration, 0, len(r.items))
	for i := range r.items {
		if filter.FormID != nil && r.items[i].FormID != *filter.FormID {
			continue
		}
		if len(filter.VisibleGroupIDs) > 0 && !registrationMatchesVisibleGroups(&r.items[i], filter.VisibleGroupIDs) {
			continue
		}
		registrations = append(registrations, *cloneRegistrationModel(&r.items[i]))
	}
	return registrations
}

func (r *fakeRegistrationListRepository) CountRegistrations(_ context.Context, filter ListRegistrationsInput) (int64, error) {
	r.countFilters = append(r.countFilters, filter)
	return r.total, nil
}

func (r *fakeRegistrationListRepository) GetRegistrationStats(_ context.Context, filter ListRegistrationsInput) (RegistrationStats, error) {
	r.statsFilters = append(r.statsFilters, filter)
	return r.stats, nil
}

func (r *fakeRegistrationListRepository) GetRegistrationByID(_ context.Context, _ uint64) (*model.Registration, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationListRepository) GetRegistrationByIDForUpdate(_ context.Context, _ uint64) (*model.Registration, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationListRepository) DeleteRegistration(_ context.Context, _ uint64) error {
	return nil
}

func (r *fakeRegistrationListRepository) ListShownUserGroups(_ context.Context) ([]model.UserGroup, error) {
	return append([]model.UserGroup(nil), r.shownGroups...), nil
}

func (r *fakeRegistrationListRepository) ListDefaultGroupIDs(_ context.Context) ([]uint64, error) {
	return nil, nil
}

func (r *fakeRegistrationListRepository) ListLeaderGroupIDs(_ context.Context, userID uint64) ([]uint64, error) {
	groupIDs := r.leaderGroupIDs[userID]
	return append([]uint64(nil), groupIDs...), nil
}

func (r *fakeRegistrationListRepository) AddUserToGroupIfAbsent(_ context.Context, _ uint64, _ uint64) error {
	return nil
}

func (r *fakeRegistrationListRepository) RemoveUserFromGroupIfPresent(_ context.Context, _ uint64, _ uint64) error {
	return nil
}

func registrationMatchesVisibleGroups(registration *model.Registration, visibleGroupIDs []uint64) bool {
	if registration == nil || len(visibleGroupIDs) == 0 {
		return true
	}
	for _, groupID := range visibleGroupIDs {
		if registration.Group1ID != nil && *registration.Group1ID == groupID {
			return true
		}
		if registration.Group2ID != nil && *registration.Group2ID == groupID {
			return true
		}
	}
	return false
}

func cloneGroupModel(group *model.UserGroup) *model.UserGroup {
	if group == nil {
		return nil
	}
	cloned := *group
	cloned.Description = copyStringPtr(group.Description)
	cloned.Tags = append([]string(nil), group.Tags...)
	return &cloned
}

func cloneUserModel(user *model.User) *model.User {
	if user == nil {
		return nil
	}
	cloned := *user
	cloned.Name = user.Name
	cloned.Email = user.Email
	cloned.PasswordHash = user.PasswordHash
	cloned.GitHubID = copyStringPtr(user.GitHubID)
	cloned.AvatarURL = copyStringPtr(user.AvatarURL)
	cloned.LastLoginAt = copyTimePtr(user.LastLoginAt)
	return &cloned
}

func cloneMap(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func stringPtr(value string) *string {
	return &value
}

func uint64Ptr(value uint64) *uint64 {
	return &value
}

func ptrTime(value time.Time) *time.Time {
	return &value
}

func assertRegistrationServiceError(t *testing.T, err error, status int, contains string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error, got nil")
	}

	serviceErr, ok := err.(*ServiceError)
	if !ok {
		t.Fatalf("expected ServiceError, got %T", err)
	}
	if serviceErr.Status != status {
		t.Fatalf("expected status %d, got %d", status, serviceErr.Status)
	}
	if contains != "" && !strings.Contains(serviceErr.Message, contains) {
		t.Fatalf("expected message %q to contain %q", serviceErr.Message, contains)
	}
}

func assertAddedMemberships(t *testing.T, actual []fakeAddedMembership, expected []fakeAddedMembership) {
	t.Helper()
	if len(actual) != len(expected) {
		t.Fatalf("expected %d memberships, got %d", len(expected), len(actual))
	}

	expectedSet := make(map[fakeAddedMembership]struct{}, len(expected))
	for _, item := range expected {
		expectedSet[item] = struct{}{}
	}
	for _, item := range actual {
		if _, ok := expectedSet[item]; !ok {
			t.Fatalf("unexpected membership added: group=%d user=%d", item.GroupID, item.UserID)
		}
	}
}

func assertRemovedMemberships(t *testing.T, actual []fakeAddedMembership, expected []fakeAddedMembership) {
	t.Helper()
	if len(actual) != len(expected) {
		t.Fatalf("expected %d removed memberships, got %d", len(expected), len(actual))
	}

	expectedSet := make(map[fakeAddedMembership]struct{}, len(expected))
	for _, item := range expected {
		expectedSet[item] = struct{}{}
	}
	for _, item := range actual {
		if _, ok := expectedSet[item]; !ok {
			t.Fatalf("unexpected removed membership: group=%d user=%d", item.GroupID, item.UserID)
		}
	}
}

func TestInterviewNotificationFailurePreservesAdmission(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.User = model.User{ID: repo.registration.UserID, Name: "张三", Email: "zhangsan@example.com"}
	repo.registration.Group1Status = model.RegistrationStatusApproved
	repo.registration.Group2Status = model.RegistrationStatusApproved
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.mailer = &fakeInterviewMailer{err: errors.New("邮件服务额度受限")}
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}
	detail, err := service.UpdateRegistrationInterview(context.Background(), actor, repo.registration.ID, UpdateInterviewInput{GroupID: *repo.registration.Group1ID, Status: "passed"})
	if err != nil {
		t.Fatalf("saved admission must succeed: %v", err)
	}
	if detail.FinalStatus != model.RegistrationFinalStatusAdmitted || repo.registration.FinalStatus != model.RegistrationFinalStatusAdmitted {
		t.Fatal("admission was lost after email failure")
	}
	if !strings.Contains(detail.NotificationWarning, "面试结果已保存") || !strings.Contains(detail.NotificationWarning, "邮件服务额度受限") {
		t.Fatal("missing administrator warning")
	}
}
