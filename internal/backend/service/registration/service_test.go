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

func TestRecruitmentNotificationTemplatesMatchCanonicalStages(t *testing.T) {
	name := "张三"
	group := &model.UserGroup{ID: 101, Name: "机械组"}
	reg := &model.Registration{
		User:           model.User{Name: name, Email: "zhangsan@example.com"},
		ContactName:    &name,
		Form:           model.RegistrationForm{Title: "2026 纳新报名"},
		PreferredGroup: group,
	}
	now := time.Date(2026, 9, 26, 0, 0, 0, 0, time.Local)

	screenPass := buildScreeningNotification(reg, true, now)
	if screenPass == nil || !strings.Contains(screenPass.Subject, "初筛") || !strings.Contains(screenPass.Body, "待面试") || strings.Contains(screenPass.Body, "已录取") {
		t.Fatalf("unexpected screening pass notification: %#v", screenPass)
	}
	screenFail := buildScreeningNotification(reg, false, now)
	if screenFail == nil || !strings.Contains(screenFail.Subject, "未通过") || !strings.Contains(screenFail.Body, "未能进入本次线下面试") {
		t.Fatalf("unexpected screening fail notification: %#v", screenFail)
	}

	admitted := buildAdmissionNotification(reg, now)
	if admitted == nil || !strings.Contains(admitted.Subject, "录取") || !strings.Contains(admitted.Body, "当前状态：已录取") {
		t.Fatalf("unexpected admission notification: %#v", admitted)
	}
	failed := buildInterviewRejectionNotification(reg, now)
	if failed == nil || !strings.Contains(failed.Subject, "未通过") || !strings.Contains(failed.Body, "当前状态：未通过") {
		t.Fatalf("unexpected interview fail notification: %#v", failed)
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

func TestRegistrationServiceNewSubmissionStartsPendingScreeningWithOnePreferredGroup(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	now := time.Date(2026, 10, 5, 8, 0, 0, 0, time.Local)
	service.now = func() time.Time { return now }

	result, err := service.SubmitRegistration(
		context.Background(),
		RegistrationFormActor{ID: 777, RoleName: model.RoleNameUser},
		SubmitRegistrationInput{
			FormID: 301,
			Values: map[string][]string{
				"name":            {"新候选人"},
				"phone":           {"13800138001"},
				"email":           {"candidate@example.com"},
				"preferred_group": {"101"},
				"direction":       {"mechanical"},
			},
		},
	)
	if err != nil {
		t.Fatalf("SubmitRegistration returned error: %v", err)
	}
	if result.RecruitmentStatus != model.RecruitmentStatusPendingScreening {
		t.Fatalf("new submission status = %q, want %q", result.RecruitmentStatus, model.RecruitmentStatusPendingScreening)
	}
	created := repo.createdRegistration
	if created == nil || created.PreferredGroupID == nil || *created.PreferredGroupID != 101 {
		t.Fatalf("expected preferred group 101, got %#v", created)
	}
	if created.InterviewAttendance != model.InterviewAttendancePending || created.InterviewSessionID != nil {
		t.Fatalf("new submission interview defaults = attendance %q session %v", created.InterviewAttendance, created.InterviewSessionID)
	}
	if created.Group1ID != nil || created.Group2ID != nil {
		t.Fatalf("new submission must not populate legacy dual-intent fields: group1=%v group2=%v", created.Group1ID, created.Group2ID)
	}
	if _, exists := created.FormData["group_1"]; exists {
		t.Fatalf("new submission must not write legacy group_1 form key: %#v", created.FormData)
	}
	if _, exists := created.FormData["group_2"]; exists {
		t.Fatalf("new submission must not write legacy group_2 form key: %#v", created.FormData)
	}
}

func TestRegistrationServiceScreeningNotificationFailureDoesNotRollbackState(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	mailer := &fakeInterviewMailer{err: errors.New("mail unavailable")}
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.mailer = mailer
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	detail, err := service.ScreenRegistration(
		context.Background(),
		actor,
		repo.registration.ID,
		ScreeningDecisionInput{Decision: "approve", Remark: "进入面试"},
	)
	if err != nil {
		t.Fatalf("screening result must not rollback on mail failure: %v", err)
	}
	if detail.Status != model.RecruitmentStatusPendingInterview || !strings.Contains(detail.NotificationWarning, "邮件发送失败") {
		t.Fatalf("expected saved pending-interview state plus warning, got %#v", detail)
	}
	if repo.registration.RecruitmentStatus != model.RecruitmentStatusPendingInterview {
		t.Fatalf("repository state rolled back unexpectedly: %q", repo.registration.RecruitmentStatus)
	}
}

func TestRegistrationServiceCanonicalWorkflowAdmitsPreferredGroup(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	now := time.Date(2026, 4, 14, 10, 0, 0, 0, time.Local)
	service.now = func() time.Time { return now }
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	screened, err := service.ScreenRegistration(context.Background(), actor, repo.registration.ID, ScreeningDecisionInput{Decision: "approve", Remark: "进入面试"})
	if err != nil {
		t.Fatalf("ScreenRegistration returned error: %v", err)
	}
	if screened.Status != model.RecruitmentStatusPendingInterview || !screened.CanInterview || screened.CanScreen {
		t.Fatalf("unexpected post-screening state: %#v", screened)
	}
	if screened.Screener == nil || screened.Screener.ID != actor.ID || screened.ScreeningRemark == nil || *screened.ScreeningRemark != "进入面试" {
		t.Fatalf("screening audit missing: %#v", screened)
	}
	if len(repo.addedMemberships) != 0 || len(repo.removedMemberships) != 0 {
		t.Fatalf("screening must not change memberships")
	}

	admitted, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "admit", Remark: "表现良好"})
	if err != nil {
		t.Fatalf("RecordInterviewResult returned error: %v", err)
	}
	if admitted.Status != model.RecruitmentStatusAdmitted || admitted.PreferredGroup == nil || admitted.PreferredGroup.ID != *repo.registration.PreferredGroupID {
		t.Fatalf("unexpected admitted result: %#v", admitted)
	}
	if admitted.Interviewer == nil || admitted.Interviewer.ID != actor.ID || admitted.InterviewRemark == nil || *admitted.InterviewRemark != "表现良好" {
		t.Fatalf("interview audit missing: %#v", admitted)
	}
	if len(repo.addedMemberships) != 0 || len(repo.removedMemberships) != 0 {
		t.Fatalf("admission must only record the recruitment result and must not change team membership")
	}
}

func TestRegistrationServiceScreeningRejectEndsWorkflow(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameSuperAdmin}

	detail, err := service.ScreenRegistration(context.Background(), actor, repo.registration.ID, ScreeningDecisionInput{Decision: "reject", Remark: "资料不匹配"})
	if err != nil {
		t.Fatalf("ScreenRegistration returned error: %v", err)
	}
	if detail.Status != model.RecruitmentStatusRejected || valueOrEmpty(detail.RejectedStage) != model.RecruitmentRejectedStageScreening || detail.CanInterview {
		t.Fatalf("unexpected screening rejection: %#v", detail)
	}
	if _, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "admit"}); err == nil {
		t.Fatal("screening-rejected candidate must not proceed to interview")
	}
}

func TestRegistrationServiceInterviewRejectEndsWorkflow(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	service := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	detail, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "reject", Remark: "面试未通过"})
	if err != nil {
		t.Fatalf("RecordInterviewResult returned error: %v", err)
	}
	if detail.Status != model.RecruitmentStatusRejected || valueOrEmpty(detail.RejectedStage) != model.RecruitmentRejectedStageInterview {
		t.Fatalf("unexpected interview rejection: %#v", detail)
	}
	if _, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "admit"}); err == nil {
		t.Fatal("rejected candidate must not be interviewed again")
	}
}

func TestRegistrationServiceRejectsInterviewBeforeScreeningAndAfterAdmission(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	if _, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "admit"}); err == nil {
		t.Fatal("pending-screening candidate must not be admitted directly")
	}
	repo.registration.RecruitmentStatus = model.RecruitmentStatusAdmitted
	if _, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "reject"}); err == nil {
		t.Fatal("admitted candidate must not be interviewed again")
	}
}

func TestRegistrationServiceOrdinaryUserCannotScreenOrInterview(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	user := RegistrationFormActor{ID: 501, RoleName: model.RoleNameUser}

	if _, err := service.ScreenRegistration(context.Background(), user, repo.registration.ID, ScreeningDecisionInput{Decision: "approve"}); err == nil {
		t.Fatal("ordinary user must not screen registrations")
	}
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	if _, err := service.RecordInterviewResult(context.Background(), user, repo.registration.ID, InterviewDecisionInput{Decision: "admit"}); err == nil {
		t.Fatal("ordinary user must not record interview results")
	}
}

func TestRegistrationServiceUndoScreeningOnlyBeforeInterview(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	if _, err := service.ScreenRegistration(context.Background(), actor, repo.registration.ID, ScreeningDecisionInput{Decision: "approve"}); err != nil {
		t.Fatalf("ScreenRegistration returned error: %v", err)
	}
	detail, err := service.UndoScreening(context.Background(), actor, repo.registration.ID)
	if err != nil {
		t.Fatalf("UndoScreening returned error: %v", err)
	}
	if detail.Status != model.RecruitmentStatusPendingScreening || detail.Screener != nil || detail.ScreenedAt != nil {
		t.Fatalf("unexpected undo result: %#v", detail)
	}

	if _, err := service.ScreenRegistration(context.Background(), actor, repo.registration.ID, ScreeningDecisionInput{Decision: "approve"}); err != nil {
		t.Fatalf("second screening returned error: %v", err)
	}
	if _, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "reject"}); err != nil {
		t.Fatalf("interview reject returned error: %v", err)
	}
	if _, err := service.UndoScreening(context.Background(), actor, repo.registration.ID); err == nil {
		t.Fatal("screening must not be undoable after interview")
	}
}

func TestRegistrationServiceUndoScreeningClearsInterviewBooking(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	session := repo.interviewSessions[1]
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.InterviewAttendance = model.InterviewAttendanceAttending
	repo.registration.InterviewSessionID = uint64Ptr(session.ID)
	repo.registration.InterviewSession = &session
	service := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	undone, err := service.UndoScreening(context.Background(), actor, repo.registration.ID)
	if err != nil {
		t.Fatalf("UndoScreening returned error: %v", err)
	}
	if undone.Status != model.RecruitmentStatusPendingScreening || undone.InterviewAttendance != model.InterviewAttendancePending || undone.InterviewSession != nil {
		t.Fatalf("unexpected state after undo: status=%q attendance=%q session=%#v", undone.Status, undone.InterviewAttendance, undone.InterviewSession)
	}
	if repo.registration.InterviewSessionID != nil {
		t.Fatalf("interview_session_id after undo = %v, want nil", *repo.registration.InterviewSessionID)
	}

	rescreened, err := service.ScreenRegistration(context.Background(), actor, repo.registration.ID, ScreeningDecisionInput{Decision: "approve"})
	if err != nil {
		t.Fatalf("ScreenRegistration returned error: %v", err)
	}
	if rescreened.Status != model.RecruitmentStatusPendingInterview || rescreened.InterviewAttendance != model.InterviewAttendancePending || rescreened.InterviewSession != nil {
		t.Fatalf("unexpected state after rescreening: status=%q attendance=%q session=%#v", rescreened.Status, rescreened.InterviewAttendance, rescreened.InterviewSession)
	}
	if repo.registration.InterviewSessionID != nil {
		t.Fatalf("interview_session_id after rescreening = %v, want nil", *repo.registration.InterviewSessionID)
	}
}

func TestRegistrationServiceNotificationFailureDoesNotRollbackResult(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	mailer := &fakeInterviewMailer{err: errors.New("mail unavailable")}
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.mailer = mailer
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	detail, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "reject"})
	if err != nil {
		t.Fatalf("business result must not rollback on mail failure: %v", err)
	}
	if detail.Status != model.RecruitmentStatusRejected || !strings.Contains(detail.NotificationWarning, "邮件发送失败") {
		t.Fatalf("expected saved rejection plus warning, got %#v", detail)
	}
	if repo.registration.RecruitmentStatus != model.RecruitmentStatusRejected {
		t.Fatalf("repository state rolled back unexpectedly: %q", repo.registration.RecruitmentStatus)
	}
}

func TestRegistrationServiceAdmissionEmbedsConfiguredImage(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	imageURL := "/upload/config/group/qq-group.png"
	repo.registration.PreferredGroup.AdmissionImageURL = &imageURL
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
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	if _, err := service.RecordInterviewResult(context.Background(), actor, repo.registration.ID, InterviewDecisionInput{Decision: "admit"}); err != nil {
		t.Fatalf("admission returned error: %v", err)
	}
	if string(mailer.image) != "png-image" || mailer.contentType != "image/png" || !strings.Contains(mailer.body, "扫描邮件内的图片加入录取群") {
		t.Fatalf("expected configured admission image, got %#v", mailer)
	}
}

func TestRegistrationServiceListRegistrationsReturnsPagination(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)

	status := model.RecruitmentStatusPendingScreening
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

func TestRegistrationServiceClosedRoundIsHistoricalAndCurrentQueueIsEmpty(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	repo.forms[301].Status = model.RegistrationFormStatusClosed
	svc := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}
	current, err := svc.ListRegistrations(context.Background(), actor, ListRegistrationsInput{})
	if err != nil || current.CurrentFormAvailable || current.ArchivedView || len(current.Items) != 0 || current.Summary.Total != 0 {
		t.Fatalf("closed round appeared in current queue: result=%#v err=%v", current, err)
	}
	id := uint64(301)
	archived, err := svc.ListRegistrations(context.Background(), actor, ListRegistrationsInput{FormID: &id})
	if err != nil || archived.CurrentFormAvailable || !archived.ArchivedView || archived.Summary.Total == 0 || len(archived.Items) == 0 {
		t.Fatalf("closed round not available in history: result=%#v err=%v", archived, err)
	}
	if got := *repo.statsFilters[len(repo.statsFilters)-1].FormID; got != id {
		t.Fatalf("historical statistics used wrong form: %d", got)
	}
}

func TestRegistrationServiceRejectsNonCurrentUnclosedFormSelection(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	draft := *cloneRegistrationFormModel(repo.forms[301])
	draft.ID = 302
	draft.Status = model.RegistrationFormStatusDraft
	repo.forms[302] = &draft
	svc := newRegistrationServiceWithDependencies(repo, nil)
	id := uint64(302)
	_, err := svc.ListRegistrations(context.Background(), RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}, ListRegistrationsInput{FormID: &id})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Status != 400 {
		t.Fatalf("draft form should not be available as history: %v", err)
	}
}

func TestRegistrationServiceClosedRoundDetailsAreReadOnly(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.Form.Status = model.RegistrationFormStatusClosed
	svc := newRegistrationServiceWithDependencies(repo, nil)
	actor := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}
	detail, err := svc.GetRegistration(context.Background(), actor, repo.registration.ID)
	if err != nil || detail == nil {
		t.Fatalf("cannot read closed candidate detail: %v", err)
	}
	if detail.CanScreen || detail.CanInterview || detail.CanUndoScreening {
		t.Fatalf("closed candidate must not have mutating actions: %#v", detail)
	}
	_, err = svc.ScreenRegistration(context.Background(), actor, repo.registration.ID, ScreeningDecisionInput{Decision: "approve"})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || (serviceErr.Status != 404 && serviceErr.Status != 409) {
		t.Fatalf("closed candidate screening should be rejected: %v", err)
	}
}

func TestRegistrationServiceListRegistrationsHasNoCurrentFormState(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	repo.forms = nil
	service := newRegistrationServiceWithDependencies(repo, nil)

	result, err := service.ListRegistrations(context.Background(), RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}, ListRegistrationsInput{})
	if err != nil {
		t.Fatalf("ListRegistrations returned error: %v", err)
	}
	if result.CurrentFormAvailable || len(result.Items) != 0 || result.Summary.Total != 0 || result.Pagination.Total != 0 {
		t.Fatalf("expected empty current-term result, got %#v", result)
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
	status := model.RecruitmentStatusAdmitted
	formID := uint64(301)

	tests := []struct {
		name                string
		actor               RegistrationFormActor
		input               ListRegistrationsInput
		wantKeyword         string
		wantFormID          *uint64
		wantVisibleGroupIDs []uint64
		wantCountStatus     *string
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
			name:                "admin role has full current-term review access",
			actor:               RegistrationFormActor{ID: 2001, RoleName: model.RoleNameAdmin},
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
			if statsFilter.FormID == nil || *statsFilter.FormID != 301 {
				t.Fatalf("expected current form ID 301, got %#v", statsFilter.FormID)
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
				t.Fatalf("expected pagination count status %q, got %#v", *tt.wantCountStatus, countStatus)
			}
		})
	}
}

func TestRegistrationServiceExportFormRegistrationsCSVUsesCanonicalWorkflowColumns(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)

	result, err := service.ExportFormRegistrationsCSV(
		context.Background(),
		RegistrationFormActor{ID: 9001, RoleName: model.RoleNameSuperAdmin},
		301,
		"https://admin.example.com",
	)
	if err != nil {
		t.Fatalf("ExportFormRegistrationsCSV returned error: %v", err)
	}
	if result.FileName != "registration-form-301-registrations.csv" {
		t.Fatalf("unexpected export filename %q", result.FileName)
	}

	content := strings.TrimPrefix(string(result.Content), "\ufeff")
	records, err := csv.NewReader(strings.NewReader(content)).ReadAll()
	if err != nil {
		t.Fatalf("failed to parse export csv: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 csv records, got %d", len(records))
	}

	expectedHeaders := []string{
		"报名记录ID",
		"报名表ID",
		"报名表标题",
		"姓名",
		"手机号",
		"邮箱",
		"意向组",
		"意向方向",
		"掌握技能",
		"简历",
		"作品集",
		"当前状态",
		"初筛人",
		"初筛时间",
		"初筛备注",
		"面试人",
		"面试时间",
		"面试结果 / 最终结果",
		"面试备注",
		"提交时间",
		"legacy_note",
	}
	if len(records[0]) != len(expectedHeaders) {
		t.Fatalf("expected %d csv headers, got %d: %v", len(expectedHeaders), len(records[0]), records[0])
	}
	headerIndex := make(map[string]int, len(records[0]))
	for index, header := range expectedHeaders {
		if records[0][index] != header {
			t.Fatalf("expected csv header[%d] = %q, got %q", index, header, records[0][index])
		}
		headerIndex[header] = index
	}
	for _, legacyHeader := range []string{"意向组别(1)", "意向组别(2)", "审核人(1)", "审核人(2)"} {
		if _, exists := headerIndex[legacyHeader]; exists {
			t.Fatalf("legacy dual-intent header must not be exported: %q", legacyHeader)
		}
	}

	row := records[1]
	if row[headerIndex["姓名"]] != "张三" {
		t.Fatalf("expected contact name 张三, got %q", row[headerIndex["姓名"]])
	}
	if row[headerIndex["意向组"]] != "机械组" {
		t.Fatalf("expected preferred group 机械组, got %q", row[headerIndex["意向组"]])
	}
	if row[headerIndex["当前状态"]] != "已录取" {
		t.Fatalf("expected canonical status 已录取, got %q", row[headerIndex["当前状态"]])
	}
	if row[headerIndex["初筛人"]] != "审核管理员" || row[headerIndex["初筛备注"]] != "资料通过" {
		t.Fatalf("unexpected screening audit columns: reviewer=%q remark=%q", row[headerIndex["初筛人"]], row[headerIndex["初筛备注"]])
	}
	if row[headerIndex["面试人"]] != "面试管理员" || row[headerIndex["面试结果 / 最终结果"]] != "面试通过并录取" || row[headerIndex["面试备注"]] != "表现稳定" {
		t.Fatalf("unexpected interview audit columns: interviewer=%q outcome=%q remark=%q", row[headerIndex["面试人"]], row[headerIndex["面试结果 / 最终结果"]], row[headerIndex["面试备注"]])
	}
	if row[headerIndex["初筛时间"]] == "" || row[headerIndex["面试时间"]] == "" {
		t.Fatalf("expected screening and interview timestamps, got screening=%q interview=%q", row[headerIndex["初筛时间"]], row[headerIndex["面试时间"]])
	}
	if row[headerIndex["意向方向"]] != "电控组" || row[headerIndex["掌握技能"]] != "C++；Go" {
		t.Fatalf("unexpected dynamic field export: direction=%q skills=%q", row[headerIndex["意向方向"]], row[headerIndex["掌握技能"]])
	}
	if row[headerIndex["简历"]] != "张三简历.pdf: https://admin.example.com/api/admin/registrations/7001/files/resume/0" {
		t.Fatalf("unexpected resume export value %q", row[headerIndex["简历"]])
	}
	if row[headerIndex["作品集"]] != "作品图1.png: https://admin.example.com/api/admin/registrations/7001/files/portfolio/0；作品图2.png: https://admin.example.com/api/admin/registrations/7001/files/portfolio/1" {
		t.Fatalf("unexpected portfolio export value %q", row[headerIndex["作品集"]])
	}
	if row[headerIndex["legacy_note"]] != "'=需要人工复核" {
		t.Fatalf("expected legacy note to remain formula-safe, got %q", row[headerIndex["legacy_note"]])
	}
}

func TestRegistrationServiceExportIgnoresLegacyAdminGroupScopeForSuperAdmin(t *testing.T) {
	repo := newFakeRegistrationListRepository()
	repo.leaderGroupIDs[2001] = []uint64{101}
	service := newRegistrationServiceWithDependencies(repo, nil)

	_, err := service.ExportFormRegistrationsCSV(
		context.Background(),
		RegistrationFormActor{ID: 2001, RoleName: model.RoleNameSuperAdmin},
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

func TestRegistrationServiceExportIsSuperAdminOnly(t *testing.T) {
	service := newRegistrationServiceWithDependencies(newFakeRegistrationListRepository(), nil)
	_, err := service.ExportFormRegistrationsCSV(context.Background(), RegistrationFormActor{
		ID: 9001, RoleName: model.RoleNameAdmin,
	}, 301, "https://admin.example.com")
	assertRegistrationServiceError(t, err, 403, "超级管理员")
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
				"name":            {"李四"},
				"phone":           {"13900139000"},
				"email":           {"lisi@example.com"},
				"preferred_group": {"102"},
				"direction":       {"embedded"},
			},
		},
	)
	if err != nil {
		t.Fatalf("UpdateRecruitmentRegistration returned error: %v", err)
	}

	if result.RecruitmentStatus != model.RecruitmentStatusPendingScreening {
		t.Fatalf("expected pending-screening status after resubmit, got %q", result.RecruitmentStatus)
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
	if repo.registration.PreferredGroupID == nil || *repo.registration.PreferredGroupID != 102 {
		t.Fatalf("expected updated preferred group, got %#v", repo.registration.PreferredGroupID)
	}
	if repo.registration.FormData["direction"] != "embedded" {
		t.Fatalf("expected updated direction, got %#v", repo.registration.FormData["direction"])
	}
	if repo.registration.FormData["group_1"] != "101" || repo.registration.FormData["group_2"] != "102" {
		t.Fatalf("legacy dual-intent form data must remain archived after edit: %#v", repo.registration.FormData)
	}
}

func TestRegistrationServiceUpdateRecruitmentRegistrationRejectsReviewedRegistration(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	now := time.Date(2026, 4, 14, 11, 0, 0, 0, time.Local)
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.ScreenedAt = &now
	service := newRegistrationServiceWithDependencies(repo, nil)

	_, err := service.UpdateRecruitmentRegistration(
		context.Background(),
		RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser},
		repo.registration.ID,
		SubmitRegistrationInput{
			Values: map[string][]string{
				"name":            {"李四"},
				"phone":           {"13900139000"},
				"email":           {"lisi@example.com"},
				"preferred_group": {"102"},
				"direction":       {"embedded"},
			},
		},
	)
	assertRegistrationServiceError(t, err, 409, "进入后续流程")
}

func TestRegistrationServiceCancelRecruitmentRegistrationWithdrawsEditablePendingRegistration(t *testing.T) {
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
	if repo.registration == nil || repo.registration.RecruitmentStatus != model.RecruitmentStatusWithdrawn {
		t.Fatalf("expected registration to be preserved as withdrawn, got %#v", repo.registration)
	}
}

func TestRegistrationServiceCancelRecruitmentRegistrationRejectsReviewedRegistration(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	now := time.Date(2026, 4, 14, 11, 0, 0, 0, time.Local)
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.ScreenedAt = &now
	service := newRegistrationServiceWithDependencies(repo, nil)

	err := service.CancelRecruitmentRegistration(
		context.Background(),
		RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser},
		repo.registration.ID,
	)
	assertRegistrationServiceError(t, err, 409, "进入后续流程")
}

func TestInterviewAttendanceWithoutOpenSessionsReturnsEmptyOptions(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.InterviewAttendance = model.InterviewAttendancePending
	for index := range repo.interviewSessions {
		repo.interviewSessions[index].Enabled = false
	}
	service := newRegistrationServiceWithDependencies(repo, nil)
	user := RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser}

	result, err := service.GetInterviewAttendance(context.Background(), user, repo.registration.ID)
	if err != nil {
		t.Fatalf("GetInterviewAttendance returned error: %v", err)
	}
	if result.Attendance != model.InterviewAttendancePending || !result.CanModify || len(result.AvailableSessions) != 0 {
		t.Fatalf("unexpected result without open sessions: %#v", result)
	}
}

func TestInterviewAttendanceRejectsArchivedRecruitmentForm(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.Form.Status = model.RegistrationFormStatusClosed
	service := newRegistrationServiceWithDependencies(repo, nil)
	user := RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser}

	if _, err := service.GetInterviewAttendance(context.Background(), user, repo.registration.ID); err == nil {
		t.Fatal("archived interview attendance must not be available")
	}
	sessionID := repo.interviewSessions[0].ID
	if _, err := service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceAttending, InterviewSessionID: &sessionID,
	}); err == nil {
		t.Fatal("archived interview attendance must not be mutable")
	}
}

func TestInterviewAttendanceFlowAndRestrictions(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.InterviewAttendance = model.InterviewAttendancePending
	service := newRegistrationServiceWithDependencies(repo, nil)
	user := RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser}

	firstID := uint64(802)
	result, err := service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceAttending, InterviewSessionID: &firstID,
	})
	if err != nil {
		t.Fatalf("attending update failed: %v", err)
	}
	if result.Attendance != model.InterviewAttendanceAttending || result.Session == nil || result.Session.ID != firstID {
		t.Fatalf("unexpected attending result: %#v", result)
	}

	secondID := uint64(803)
	result, err = service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceAttending, InterviewSessionID: &secondID,
	})
	if err != nil || result.Session == nil || result.Session.ID != secondID {
		t.Fatalf("session change failed: result=%#v err=%v", result, err)
	}

	result, err = service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceNotAttending,
	})
	if err != nil {
		t.Fatalf("not-attending update failed: %v", err)
	}
	if result.Attendance != model.InterviewAttendanceNotAttending || result.Session != nil || repo.registration.InterviewSessionID != nil {
		t.Fatalf("not-attending must clear session: %#v", result)
	}

	result, err = service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceAttending, InterviewSessionID: &firstID,
	})
	if err != nil || result.Session == nil || result.Session.ID != firstID {
		t.Fatalf("re-attending failed: result=%#v err=%v", result, err)
	}

	repo.interviewSessions[0].Enabled = false
	disabledID := repo.interviewSessions[0].ID
	if _, err := service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceAttending, InterviewSessionID: &disabledID,
	}); err == nil {
		t.Fatal("disabled session must not be selectable")
	}
	missingID := uint64(99999)
	if _, err := service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceAttending, InterviewSessionID: &missingID,
	}); err == nil {
		t.Fatal("missing session must not be selectable")
	}

	otherUser := RegistrationFormActor{ID: repo.registration.UserID + 1, RoleName: model.RoleNameUser}
	if _, err := service.UpdateInterviewAttendance(context.Background(), otherUser, repo.registration.ID, InterviewAttendanceInput{
		Attendance: model.InterviewAttendanceNotAttending,
	}); err == nil {
		t.Fatal("another user must not modify interview attendance")
	}
}

func TestInterviewAttendanceOnlyPendingInterviewCanModify(t *testing.T) {
	statuses := []string{
		model.RecruitmentStatusPendingScreening,
		model.RecruitmentStatusAdmitted,
		model.RecruitmentStatusRejected,
		model.RecruitmentStatusWithdrawn,
	}
	for _, status := range statuses {
		t.Run(status, func(t *testing.T) {
			repo := newFakeRegistrationReviewRepository()
			repo.registration.RecruitmentStatus = status
			service := newRegistrationServiceWithDependencies(repo, nil)
			user := RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser}
			if _, err := service.UpdateInterviewAttendance(context.Background(), user, repo.registration.ID, InterviewAttendanceInput{
				Attendance: model.InterviewAttendanceNotAttending,
			}); err == nil {
				t.Fatalf("%s must not modify interview attendance", status)
			}
		})
	}
}

func TestInterviewSessionAdminManagementAndUserPermission(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	admin := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}
	superAdmin := RegistrationFormActor{ID: 9002, RoleName: model.RoleNameSuperAdmin}
	if _, err := service.CreateInterviewSession(context.Background(), admin, UpsertInterviewSessionInput{
		Date: "2026-10-13", Label: "上午", StartTime: "09:00", EndTime: "11:30", Location: "吉甲大师双创基地", Enabled: true,
	}); err == nil {
		t.Fatal("ordinary admin must not create interview sessions")
	}

	created, err := service.CreateInterviewSession(context.Background(), superAdmin, UpsertInterviewSessionInput{
		Date: "2026-10-13", Label: "上午", StartTime: "09:00", EndTime: "11:30", Location: "吉甲大师双创基地", Enabled: true,
	})
	if err != nil {
		t.Fatalf("CreateInterviewSession returned error: %v", err)
	}
	if created.Label != "上午" || !created.Enabled {
		t.Fatalf("unexpected created session: %#v", created)
	}
	if _, err := service.UpdateInterviewSession(context.Background(), admin, created.ID, UpsertInterviewSessionInput{
		Date: "2026-10-13", Label: "上午", StartTime: "09:00", EndTime: "11:30", Location: "吉甲大师双创基地", Enabled: false,
	}); err == nil {
		t.Fatal("ordinary admin must not update interview sessions")
	}

	updated, err := service.UpdateInterviewSession(context.Background(), superAdmin, created.ID, UpsertInterviewSessionInput{
		Date: "2026-10-13", Label: "下午", StartTime: "14:00", EndTime: "17:30", Location: "吉甲大师双创基地", Enabled: false,
	})
	if err != nil {
		t.Fatalf("UpdateInterviewSession returned error: %v", err)
	}
	if updated.Label != "下午" || updated.StartTime != "14:00" || updated.EndTime != "17:30" || updated.Enabled {
		t.Fatalf("unexpected updated session: %#v", updated)
	}

	user := RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser}
	if _, err := service.CreateInterviewSession(context.Background(), user, UpsertInterviewSessionInput{
		Date: "2026-10-13", Label: "晚上", StartTime: "18:30", EndTime: "21:00", Location: "吉甲大师双创基地", Enabled: true,
	}); err == nil {
		t.Fatal("ordinary user must not create interview sessions")
	}
}

func TestDisablingSelectedInterviewSessionPreservesExistingSelection(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.InterviewAttendance = model.InterviewAttendanceAttending
	sessionID := uint64(802)
	repo.registration.InterviewSessionID = &sessionID
	repo.registration.InterviewSession = cloneInterviewSession(sessionByID(repo.interviewSessions, sessionID))
	service := newRegistrationServiceWithDependencies(repo, nil)
	admin := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameSuperAdmin}
	user := RegistrationFormActor{ID: repo.registration.UserID, RoleName: model.RoleNameUser}

	session := sessionByID(repo.interviewSessions, sessionID)
	_, err := service.UpdateInterviewSession(context.Background(), admin, sessionID, UpsertInterviewSessionInput{
		Date: session.Date, Label: session.Label, StartTime: session.StartTime, EndTime: session.EndTime, Location: session.Location, Enabled: false,
	})
	if err != nil {
		t.Fatalf("disable selected session failed: %v", err)
	}
	result, err := service.GetInterviewAttendance(context.Background(), user, repo.registration.ID)
	if err != nil {
		t.Fatalf("GetInterviewAttendance returned error: %v", err)
	}
	if result.Session == nil || result.Session.ID != sessionID || result.Attendance != model.InterviewAttendanceAttending {
		t.Fatalf("disabling session must preserve historical selection: %#v", result)
	}
}

func TestInterviewResultPreservesAttendanceHistory(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.InterviewAttendance = model.InterviewAttendanceAttending
	sessionID := uint64(802)
	repo.registration.InterviewSessionID = &sessionID
	repo.registration.InterviewSession = cloneInterviewSession(sessionByID(repo.interviewSessions, sessionID))
	service := newRegistrationServiceWithDependencies(repo, nil)
	admin := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	detail, err := service.RecordInterviewResult(context.Background(), admin, repo.registration.ID, InterviewDecisionInput{Decision: "admit"})
	if err != nil {
		t.Fatalf("RecordInterviewResult returned error: %v", err)
	}
	if detail.Status != model.RecruitmentStatusAdmitted {
		t.Fatalf("status = %q, want admitted", detail.Status)
	}
	if detail.InterviewAttendance != model.InterviewAttendanceAttending || detail.InterviewSession == nil || detail.InterviewSession.ID != sessionID {
		t.Fatalf("interview result must preserve attendance history: %#v", detail)
	}
}

func TestInterviewResultDoesNotRequireAttendanceConfirmation(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.registration.RecruitmentStatus = model.RecruitmentStatusPendingInterview
	repo.registration.InterviewAttendance = model.InterviewAttendancePending
	service := newRegistrationServiceWithDependencies(repo, nil)
	admin := RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin}

	detail, err := service.RecordInterviewResult(context.Background(), admin, repo.registration.ID, InterviewDecisionInput{Decision: "reject"})
	if err != nil {
		t.Fatalf("pending attendance must not block interview result: %v", err)
	}
	if detail.Status != model.RecruitmentStatusRejected || detail.InterviewAttendance != model.InterviewAttendancePending {
		t.Fatalf("unexpected detail after interview result: %#v", detail)
	}
}

type fakeRegistrationReviewRepository struct {
	registration        *model.Registration
	shownGroups         []model.UserGroup
	leaderGroupIDs      map[uint64][]uint64
	users               map[uint64]*model.User
	addedMemberships    []fakeAddedMembership
	removedMemberships  []fakeAddedMembership
	addedMembershipKV   map[fakeAddedMembership]struct{}
	removedMembershipKV map[fakeAddedMembership]struct{}
	interviewSessions   []model.InterviewSession
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
			ID:                7001,
			FormID:            301,
			UserID:            501,
			FormData:          map[string]any{"name": "张三", "group_1": "101", "group_2": "102"},
			ContactName:       stringPtr("张三"),
			ContactPhone:      stringPtr("13800138000"),
			ContactEmail:      stringPtr("zhangsan@example.com"),
			PreferredGroupID:  &group1ID,
			RecruitmentStatus: model.RecruitmentStatusPendingScreening,
			Group1ID:          &group1ID,
			Group1Status:      model.RegistrationStatusPending,
			Group2ID:          &group2ID,
			Group2Status:      model.RegistrationStatusPending,
			Status:            model.RegistrationStatusPending,
			SubmittedAt:       now.Add(-2 * time.Hour),
			UpdatedAt:         now.Add(-90 * time.Minute),
			Form: model.RegistrationForm{
				ID:           301,
				Title:        "2026 招新报名",
				FieldsSchema: validRegistrationFields(),
				Status:       model.RegistrationFormStatusPublished,
			},
			User:           model.User{ID: 501, Name: "张三", Email: "zhangsan@example.com"},
			PreferredGroup: &model.UserGroup{ID: group1ID, Name: "机械组", Show: 1},
			Group1:         &model.UserGroup{ID: group1ID, Name: "机械组", Show: 1},
			Group2:         &model.UserGroup{ID: group2ID, Name: "电控组", Show: 1},
		},
		shownGroups: []model.UserGroup{
			{ID: 101, Name: "机械组", Show: 1},
			{ID: 102, Name: "电控组", Show: 1},
		},
		leaderGroupIDs: map[uint64][]uint64{},
		users: map[uint64]*model.User{
			2001: {ID: 2001, Name: "机械组长", Email: "leader1@example.com"},
			2002: {ID: 2002, Name: "电控组长", Email: "leader2@example.com"},
			9001: {ID: 9001, Name: "审核管理员", Email: "admin@example.com"},
		},
		addedMembershipKV:   make(map[fakeAddedMembership]struct{}),
		removedMembershipKV: make(map[fakeAddedMembership]struct{}),
		interviewSessions: []model.InterviewSession{
			{ID: 801, FormID: uint64Ptr(301), Date: "2026-10-12", Label: "上午", StartTime: "09:00", EndTime: "11:30", Location: "吉甲大师双创基地", Enabled: true},
			{ID: 802, FormID: uint64Ptr(301), Date: "2026-10-12", Label: "下午", StartTime: "13:30", EndTime: "17:00", Location: "吉甲大师双创基地", Enabled: true},
			{ID: 803, FormID: uint64Ptr(301), Date: "2026-10-12", Label: "晚上", StartTime: "18:30", EndTime: "21:00", Location: "吉甲大师双创基地", Enabled: true},
		},
	}
}

func (r *fakeRegistrationReviewRepository) RunInTx(_ context.Context, fn func(repo registrationRepository) error) error {
	return fn(r)
}

func (r *fakeRegistrationReviewRepository) ListPublishedForms(_ context.Context) ([]model.RegistrationForm, error) {
	if r.registration == nil || r.registration.Form.Status != model.RegistrationFormStatusPublished {
		return nil, nil
	}
	return []model.RegistrationForm{r.registration.Form}, nil
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
	if value, ok := updates["preferred_group_id"].(*uint64); ok {
		r.registration.PreferredGroupID = copyUint64Ptr(value)
		r.registration.PreferredGroup = cloneGroupModel(groupByID(r.shownGroups, *value))
	} else if _, ok := updates["preferred_group_id"]; ok {
		r.registration.PreferredGroupID = nil
		r.registration.PreferredGroup = nil
	}
	if value, ok := updates["recruitment_status"].(string); ok {
		r.registration.RecruitmentStatus = value
	}
	if value, ok := updates["rejected_stage"].(string); ok {
		r.registration.RejectedStage = stringPtr(value)
	} else if _, ok := updates["rejected_stage"]; ok {
		r.registration.RejectedStage = nil
	}
	if value, ok := updates["screened_by"].(uint64); ok {
		r.registration.ScreenedBy = uint64Ptr(value)
		r.registration.Screener = cloneUserModel(r.users[value])
	} else if _, ok := updates["screened_by"]; ok {
		r.registration.ScreenedBy = nil
		r.registration.Screener = nil
	}
	if value, ok := updates["screened_at"].(time.Time); ok {
		r.registration.ScreenedAt = copyTimePtr(&value)
	} else if _, ok := updates["screened_at"]; ok {
		r.registration.ScreenedAt = nil
	}
	if value, ok := updates["screening_remark"].(*string); ok {
		r.registration.ScreeningRemark = copyStringPtr(value)
	} else if _, ok := updates["screening_remark"]; ok {
		r.registration.ScreeningRemark = nil
	}
	if value, ok := updates["interviewer_id"].(uint64); ok {
		r.registration.InterviewerID = uint64Ptr(value)
		r.registration.Interviewer = cloneUserModel(r.users[value])
	} else if _, ok := updates["interviewer_id"]; ok {
		r.registration.InterviewerID = nil
		r.registration.Interviewer = nil
	}
	if value, ok := updates["interviewed_at"].(time.Time); ok {
		r.registration.InterviewedAt = copyTimePtr(&value)
	} else if _, ok := updates["interviewed_at"]; ok {
		r.registration.InterviewedAt = nil
	}
	if value, ok := updates["interview_remark"].(*string); ok {
		r.registration.InterviewRemark = copyStringPtr(value)
	} else if _, ok := updates["interview_remark"]; ok {
		r.registration.InterviewRemark = nil
	}
	if value, ok := updates["interview_attendance"].(string); ok {
		r.registration.InterviewAttendance = value
	}
	if value, ok := updates["interview_session_id"].(uint64); ok {
		r.registration.InterviewSessionID = uint64Ptr(value)
		r.registration.InterviewSession = cloneInterviewSession(sessionByID(r.interviewSessions, value))
	} else if _, ok := updates["interview_session_id"]; ok {
		r.registration.InterviewSessionID = nil
		r.registration.InterviewSession = nil
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

func (r *fakeRegistrationReviewRepository) ListShownUserGroups(_ context.Context) ([]model.UserGroup, error) {
	return append([]model.UserGroup(nil), r.shownGroups...), nil
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

func (r *fakeRegistrationReviewRepository) ListInterviewSessions(_ context.Context, enabledOnly bool) ([]model.InterviewSession, error) {
	items := make([]model.InterviewSession, 0, len(r.interviewSessions))
	for _, session := range r.interviewSessions {
		if enabledOnly && !session.Enabled {
			continue
		}
		items = append(items, session)
	}
	return items, nil
}

func (r *fakeRegistrationReviewRepository) GetInterviewSessionByID(_ context.Context, sessionID uint64) (*model.InterviewSession, error) {
	session := sessionByID(r.interviewSessions, sessionID)
	if session == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneInterviewSession(session), nil
}

func (r *fakeRegistrationReviewRepository) GetInterviewSessionByIDForUpdate(ctx context.Context, sessionID uint64) (*model.InterviewSession, error) {
	return r.GetInterviewSessionByID(ctx, sessionID)
}

func (r *fakeRegistrationReviewRepository) CreateInterviewSession(_ context.Context, session *model.InterviewSession) error {
	if session.ID == 0 {
		session.ID = uint64(900 + len(r.interviewSessions) + 1)
	}
	r.interviewSessions = append(r.interviewSessions, *session)
	return nil
}

func (r *fakeRegistrationReviewRepository) UpdateInterviewSession(_ context.Context, sessionID uint64, updates map[string]any) error {
	session := sessionByID(r.interviewSessions, sessionID)
	if session == nil {
		return gorm.ErrRecordNotFound
	}
	if value, ok := updates["date"].(string); ok {
		session.Date = value
	}
	if value, ok := updates["label"].(string); ok {
		session.Label = value
	}
	if value, ok := updates["start_time"].(string); ok {
		session.StartTime = value
	}
	if value, ok := updates["end_time"].(string); ok {
		session.EndTime = value
	}
	if value, ok := updates["location"].(string); ok {
		session.Location = value
	}
	if value, ok := updates["enabled"].(bool); ok {
		session.Enabled = value
	}
	return nil
}

func (r *fakeRegistrationReviewRepository) CountInterviewSessionSelections(_ context.Context, sessionID uint64) (int64, error) {
	if r.registration != nil && r.registration.InterviewSessionID != nil && *r.registration.InterviewSessionID == sessionID && r.registration.InterviewAttendance == model.InterviewAttendanceAttending {
		return 1, nil
	}
	return 0, nil
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
	cloned.PreferredGroupID = copyUint64Ptr(registration.PreferredGroupID)
	cloned.RejectedStage = copyStringPtr(registration.RejectedStage)
	cloned.ScreenedBy = copyUint64Ptr(registration.ScreenedBy)
	cloned.ScreenedAt = copyTimePtr(registration.ScreenedAt)
	cloned.ScreeningRemark = copyStringPtr(registration.ScreeningRemark)
	cloned.InterviewerID = copyUint64Ptr(registration.InterviewerID)
	cloned.InterviewedAt = copyTimePtr(registration.InterviewedAt)
	cloned.InterviewRemark = copyStringPtr(registration.InterviewRemark)
	cloned.InterviewSessionID = copyUint64Ptr(registration.InterviewSessionID)
	cloned.InterviewSession = cloneInterviewSession(registration.InterviewSession)
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
	cloned.PreferredGroup = cloneGroupModel(registration.PreferredGroup)
	cloned.Screener = cloneUserModel(registration.Screener)
	cloned.Interviewer = cloneUserModel(registration.Interviewer)
	cloned.Group1 = cloneGroupModel(registration.Group1)
	cloned.Group2 = cloneGroupModel(registration.Group2)
	cloned.Reviewer1 = cloneUserModel(registration.Reviewer1)
	cloned.Reviewer2 = cloneUserModel(registration.Reviewer2)
	cloned.FinalGroup = cloneGroupModel(registration.FinalGroup)
	cloned.Finalizer = cloneUserModel(registration.Finalizer)
	return &cloned
}

func cloneInterviewSession(session *model.InterviewSession) *model.InterviewSession {
	if session == nil {
		return nil
	}
	cloned := *session
	return &cloned
}

func sessionByID(sessions []model.InterviewSession, id uint64) *model.InterviewSession {
	for i := range sessions {
		if sessions[i].ID == id {
			return &sessions[i]
		}
	}
	return nil
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
	items               []model.Registration
	createdRegistration *model.Registration
	forms               map[uint64]*model.RegistrationForm
	shownGroups         []model.UserGroup
	total               int64
	stats               RegistrationStats
	leaderGroupIDs      map[uint64][]uint64
	listFilters         []ListRegistrationsInput
	exportFilters       []ListRegistrationsInput
	countFilters        []ListRegistrationsInput
	statsFilters        []ListRegistrationsInput
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
				ContactName:       stringPtr("张三"),
				ContactPhone:      stringPtr("13800138000"),
				ContactEmail:      stringPtr("zhangsan@example.com"),
				PreferredGroupID:  &group1ID,
				RecruitmentStatus: model.RecruitmentStatusAdmitted,
				ScreenedBy:        uint64Ptr(9001),
				ScreenedAt:        ptrTime(now.Add(-75 * time.Minute)),
				ScreeningRemark:   stringPtr("资料通过"),
				InterviewerID:     uint64Ptr(9002),
				InterviewedAt:     ptrTime(now.Add(-30 * time.Minute)),
				InterviewRemark:   stringPtr("表现稳定"),
				Group1ID:          &group1ID,
				Group1Status:      model.RegistrationStatusApproved,
				Group2ID:          &group2ID,
				Group2Status:      model.RegistrationStatusRejected,
				Status:            model.RegistrationStatusApproved,
				SubmittedAt:       now.Add(-2 * time.Hour),
				UpdatedAt:         now.Add(-20 * time.Minute),
				Screener:          &model.User{ID: 9001, Name: "审核管理员", Email: "admin@example.com"},
				Interviewer:       &model.User{ID: 9002, Name: "面试管理员", Email: "interviewer@example.com"},
				Form:              *cloneRegistrationFormModel(form),
				PreferredGroup:    &model.UserGroup{ID: group1ID, Name: "机械组", Show: 1},
				Group1:            &model.UserGroup{ID: group1ID, Name: "机械组", Show: 1},
				Group2:            &model.UserGroup{ID: group2ID, Name: "电控组", Show: 1},
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
			Total:            24,
			PendingScreening: 9,
			PendingInterview: 4,
			Admitted:         4,
			Rejected:         5,
			Withdrawn:        2,
		},
		leaderGroupIDs: map[uint64][]uint64{},
	}
}

func (r *fakeRegistrationListRepository) RunInTx(_ context.Context, fn func(repo registrationRepository) error) error {
	return fn(r)
}

func (r *fakeRegistrationListRepository) ListPublishedForms(_ context.Context) ([]model.RegistrationForm, error) {
	items := make([]model.RegistrationForm, 0, len(r.forms))
	for _, form := range r.forms {
		if form.Status == model.RegistrationFormStatusPublished {
			items = append(items, *cloneRegistrationFormModel(form))
		}
	}
	return items, nil
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

func (r *fakeRegistrationListRepository) CreateRegistration(_ context.Context, registration *model.Registration) error {
	if registration.ID == 0 {
		registration.ID = 9901
	}
	r.createdRegistration = cloneRegistrationModel(registration)
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

func (r *fakeRegistrationListRepository) ListShownUserGroups(_ context.Context) ([]model.UserGroup, error) {
	return append([]model.UserGroup(nil), r.shownGroups...), nil
}

func (r *fakeRegistrationListRepository) ListLeaderGroupIDs(_ context.Context, userID uint64) ([]uint64, error) {
	groupIDs := r.leaderGroupIDs[userID]
	return append([]uint64(nil), groupIDs...), nil
}

func (r *fakeRegistrationListRepository) ListInterviewSessions(_ context.Context, _ bool) ([]model.InterviewSession, error) {
	return nil, nil
}

func (r *fakeRegistrationListRepository) GetInterviewSessionByID(_ context.Context, _ uint64) (*model.InterviewSession, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationListRepository) GetInterviewSessionByIDForUpdate(_ context.Context, _ uint64) (*model.InterviewSession, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationListRepository) CreateInterviewSession(_ context.Context, _ *model.InterviewSession) error {
	return nil
}

func (r *fakeRegistrationListRepository) UpdateInterviewSession(_ context.Context, _ uint64, _ map[string]any) error {
	return nil
}

func (r *fakeRegistrationListRepository) CountInterviewSessionSelections(_ context.Context, _ uint64) (int64, error) {
	return 0, nil
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
