package growth

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

type assignmentReaderStub struct {
	called bool
	userID uint64
	items  []assignment.AssignmentView
}

func (s *assignmentReaderStub) ListMine(_ context.Context, actor assignment.Actor) ([]assignment.AssignmentView, error) {
	s.called = true
	s.userID = actor.ID
	return s.items, nil
}

func newGrowthMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("open GORM over SQL mock: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = sqlDB.Close()
	})
	return db, mock
}

func TestGetMineBuildsChronologicalTrainingTimelineFromSourceRows(t *testing.T) {
	db, mock := newGrowthMock(t)
	now := time.Date(2026, 10, 20, 8, 0, 0, 0, time.UTC)
	groupJoinedAt := now.Add(-90 * 24 * time.Hour)
	firstSubmittedAt := now.Add(-10 * 24 * time.Hour)
	returnedAt := now.Add(-8 * 24 * time.Hour)
	resubmittedAt := now.Add(-6 * 24 * time.Hour)
	passedAt := now.Add(-4 * 24 * time.Hour)
	askedAt := now.Add(-3 * 24 * time.Hour)
	repliedAt := now.Add(-2 * 24 * time.Hour)
	priorSolvedAt := now.Add(-30 * time.Hour)
	solvedAt := now.Add(-24 * time.Hour)
	priorFAQAt := now.Add(-13 * time.Hour)
	faqAt := now.Add(-12 * time.Hour)
	skillMasteredAt := now.Add(-6 * time.Hour)

	mock.ExpectQuery("SELECT .* FROM `users` WHERE id = \\? AND status = \\?.*LIMIT \\?").
		WithArgs(uint64(12), model.UserStatusEnabled, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "nickname", "real_name", "status"}).AddRow(12, "account", "昵称", "成员甲", model.UserStatusEnabled))
	mock.ExpectQuery("SELECT .* FROM `user_group_members` JOIN user_groups ON.*WHERE user_group_members\\.user_id = \\? AND user_groups\\.status = \\?.*ORDER BY user_group_members\\.joined_at ASC, user_group_members\\.id ASC").
		WithArgs(uint64(12), model.UserGroupStatusActive).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "joined_at", "group_name"}).AddRow(501, 41, groupJoinedAt, "机械组"))
	mock.ExpectQuery("SELECT skill_review_events\\.id, skill_review_events\\.skill_node_id, skill_review_events\\.group_id, skill_review_events\\.action, skill_review_events\\.evidence_note, skill_review_events\\.created_at, skill_review_events\\.skill_name AS node_name, user_groups\\.name AS group_name, skill_review_events\\.actor_name FROM `skill_review_events` JOIN user_groups ON.*WHERE skill_review_events\\.user_id = \\? AND skill_review_events\\.group_id IN \\(\\?\\).*ORDER BY skill_review_events\\.created_at ASC, skill_review_events\\.id ASC").
		WithArgs(uint64(12), uint64(41)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "skill_node_id", "group_id", "action", "evidence_note", "created_at", "node_name", "group_name", "actor_name"}).
			AddRow(1101, 77, 41, "mastered", "完成独立实操", skillMasteredAt, "结构建模", "机械组", "张老师"))
	mock.ExpectQuery("SELECT .* FROM `assignment_submissions` JOIN assignments ON.*JOIN user_groups ON.*WHERE assignment_submissions\\.user_id = \\? AND assignments\\.group_id IN \\(\\?\\).*ORDER BY assignment_submissions\\.submitted_at ASC, assignment_submissions\\.id ASC").
		WithArgs(uint64(12), uint64(41)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "assignment_id", "attempt", "submitted_at", "title", "group_name"}).
			AddRow(601, 71, 1, firstSubmittedAt, "基础控制任务", "机械组").
			AddRow(602, 71, 2, resubmittedAt, "基础控制任务", "机械组"))
	mock.ExpectQuery("SELECT .* FROM `assignment_reviews` JOIN assignment_submissions ON.*JOIN assignments ON.*JOIN user_groups ON.*WHERE assignment_submissions\\.user_id = \\? AND assignments\\.group_id IN \\(\\?\\).*ORDER BY assignment_reviews\\.created_at ASC, assignment_reviews\\.id ASC").
		WithArgs(uint64(12), uint64(41)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "submission_id", "score", "decision", "comment", "created_at", "assignment_id", "attempt", "title", "group_name"}).
			AddRow(701, 601, 62, model.AssignmentReviewNeedsRedo, "补充验证", returnedAt, 71, 1, "基础控制任务", "机械组").
			AddRow(702, 602, 91, model.AssignmentReviewPassed, "完成扎实", passedAt, 71, 2, "基础控制任务", "机械组"))
	mock.ExpectQuery("SELECT .* FROM `training_questions` JOIN user_groups ON.*WHERE training_questions\\.group_id IN \\(\\?\\) AND \\(training_questions\\.asker_id = \\? OR \\(training_questions\\.visibility = \\? AND EXISTS.*training_question_posts\\.author_id = \\?\\)\\).*ORDER BY training_questions\\.created_at ASC, training_questions\\.id ASC").
		WithArgs(uint64(41), uint64(12), model.TrainingQuestionPublic, uint64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "asker_id", "title", "visibility", "is_solved", "solved_at", "is_faq", "faq_at", "created_at", "group_name"}).
			AddRow(801, 41, 12, "电机无法启动", model.TrainingQuestionPublic, true, solvedAt, true, faqAt, askedAt, "机械组"))
	mock.ExpectQuery("SELECT .* FROM `training_question_growth_events` WHERE question_id IN \\(\\?\\).*ORDER BY occurred_at ASC, id ASC").
		WithArgs(uint64(801)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "question_id", "kind", "occurred_at"}).
			AddRow(1001, 801, model.TrainingQuestionGrowthSolved, priorSolvedAt).
			AddRow(1002, 801, model.TrainingQuestionGrowthSolved, solvedAt).
			AddRow(1003, 801, model.TrainingQuestionGrowthFAQ, priorFAQAt).
			AddRow(1004, 801, model.TrainingQuestionGrowthFAQ, faqAt))
	mock.ExpectQuery("SELECT .* FROM `training_question_posts` JOIN training_questions ON.*WHERE training_question_posts\\.author_id = \\? AND training_question_posts\\.question_id IN \\(\\?\\).*ORDER BY training_question_posts\\.created_at ASC, training_question_posts\\.id ASC").
		WithArgs(uint64(12), uint64(801)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "question_id", "kind", "created_at"}).AddRow(901, 801, model.TrainingQuestionAnswer, repliedAt))
	mock.ExpectQuery("SELECT .* FROM `weekly_reports` LEFT JOIN user_groups ON.*WHERE weekly_reports\\.user_id = \\?.*ORDER BY weekly_reports\\.week_start ASC, weekly_reports\\.id ASC").
		WithArgs(uint64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "week_start", "updated_at", "group_name"}))

	assignments := &assignmentReaderStub{items: []assignment.AssignmentView{
		{ID: 72, Title: "待完成任务", GroupName: "机械组", DueAt: now.Add(time.Hour), Status: "pending"},
		{ID: 71, Title: "已完成任务", GroupName: "机械组", Status: model.AssignmentReviewPassed},
	}}
	service := NewService(db, assignments)
	service.Now = func() time.Time { return now }
	profile, err := service.GetMine(context.Background(), 12)
	if err != nil {
		t.Fatalf("get growth profile: %v", err)
	}
	if profile.DisplayName != "成员甲" || len(profile.Groups) != 1 || profile.Groups[0] != "机械组" {
		t.Fatalf("identity = %#v, groups = %#v", profile.DisplayName, profile.Groups)
	}
	if !assignments.called || assignments.userID != 12 {
		t.Fatalf("next assignment lookup did not use authenticated member: %#v", assignments)
	}
	wantStats := (Statistics{CompletedChallenges: 1, FirstSubmissions: 1, QuestionsAsked: 1, DiscussionThreads: 1, ResolvedQuestions: 1, FAQContributions: 1})
	if profile.Stats != wantStats {
		t.Fatalf("stats = %#v, want %#v", profile.Stats, wantStats)
	}
	if profile.NextAction == nil || profile.NextAction.Href != "/dashboard/assignments?assignmentId=72" {
		t.Fatalf("next action = %#v", profile.NextAction)
	}
	wantKinds := []string{"membership", "assignment_first_submission", "assignment_review_needs_redo", "assignment_resubmission", "assignment_review_passed", "question_asked", "discussion_participation", "question_solved", "question_solved", "faq_contribution", "faq_contribution", "skill_mastered"}
	if len(profile.Events) != len(wantKinds) {
		t.Fatalf("events = %#v; want %d events", profile.Events, len(wantKinds))
	}
	seenKeys := make(map[string]struct{}, len(profile.Events))
	for i, event := range profile.Events {
		if event.Kind != wantKinds[i] {
			t.Fatalf("event[%d].Kind = %q, want %q", i, event.Kind, wantKinds[i])
		}
		if _, exists := seenKeys[event.Key]; exists {
			t.Fatalf("duplicate event key %q", event.Key)
		}
		seenKeys[event.Key] = struct{}{}
		if i > 0 && profile.Events[i-1].OccurredAt.After(event.OccurredAt) {
			t.Fatalf("events not chronological: %s after %s", profile.Events[i-1].OccurredAt, event.OccurredAt)
		}
		if event.Kind != "membership" && event.Href == "" {
			t.Fatalf("business event %q has no source link", event.Kind)
		}
	}
	skillEvent := profile.Events[len(profile.Events)-1]
	if skillEvent.Key != "skill-review:1101" || skillEvent.Href != "/dashboard/skills?groupId=41&nodeId=77" || skillEvent.Description != "确认人：张老师 · 完成独立实操" {
		t.Fatalf("skill review event does not retain its source and basis: %#v", skillEvent)
	}
}

func TestGetMineForAnyGroupIncludesOnlyWeeklyReportMetadata(t *testing.T) {
	db, mock := newGrowthMock(t)
	joinedAt := time.Date(2026, 6, 1, 8, 0, 0, 0, time.UTC)
	updatedAt := time.Date(2026, 10, 19, 9, 30, 0, 0, time.UTC)
	mock.ExpectQuery("SELECT .* FROM `users` WHERE id = \\? AND status = \\?.*LIMIT \\?").
		WithArgs(uint64(21), model.UserStatusEnabled, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "nickname", "real_name", "status"}).AddRow(21, "ops", nil, nil, model.UserStatusEnabled))
	mock.ExpectQuery("SELECT .* FROM `user_group_members` JOIN user_groups ON.*WHERE user_group_members\\.user_id = \\? AND user_groups\\.status = \\?.*ORDER BY user_group_members\\.joined_at ASC, user_group_members\\.id ASC").
		WithArgs(uint64(21), model.UserGroupStatusActive).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "joined_at", "group_name"}).AddRow(510, 45, joinedAt, "运营组"))
	mock.ExpectQuery("SELECT skill_review_events\\.id, skill_review_events\\.skill_node_id, skill_review_events\\.group_id, skill_review_events\\.action, skill_review_events\\.evidence_note, skill_review_events\\.created_at, skill_review_events\\.skill_name AS node_name, user_groups\\.name AS group_name, skill_review_events\\.actor_name FROM `skill_review_events` JOIN user_groups ON.*WHERE skill_review_events\\.user_id = \\? AND skill_review_events\\.group_id IN \\(\\?\\).*ORDER BY skill_review_events\\.created_at ASC, skill_review_events\\.id ASC").
		WithArgs(uint64(21), uint64(45)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "skill_node_id", "group_id", "action", "evidence_note", "created_at", "node_name", "group_name", "actor_name"}))
	mock.ExpectQuery("SELECT .* FROM `weekly_reports` LEFT JOIN user_groups ON.*WHERE weekly_reports\\.user_id = \\?.*ORDER BY weekly_reports\\.week_start ASC, weekly_reports\\.id ASC").
		WithArgs(uint64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "week_start", "updated_at", "group_name"}).AddRow(330, "2026-10-12", updatedAt, "运营组"))
	service := NewService(db, nil)
	service.Now = func() time.Time { return time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC) }
	profile, err := service.GetMine(context.Background(), 21)
	if err != nil {
		t.Fatalf("get operations growth profile: %v", err)
	}
	if profile.Stats.WeeklyReports != 1 || len(profile.Events) != 2 {
		t.Fatalf("operations profile stats/events = %#v / %#v", profile.Stats, profile.Events)
	}
	reportEvent := profile.Events[1]
	if reportEvent.Kind != "weekly_report" || reportEvent.Href != "/dashboard/weekly-reports?weekStart=2026-10-12" || reportEvent.Description != "2026-10-12" {
		t.Fatalf("unexpected weekly-report event: %#v", reportEvent)
	}
	if profile.NextAction == nil || profile.NextAction.Href != "/dashboard/weekly-reports" {
		t.Fatalf("operations next action = %#v", profile.NextAction)
	}
}

func TestGetMineRejectsMissingIdentityBeforeReading(t *testing.T) {
	db, _ := newGrowthMock(t)
	_, err := NewService(db, nil).GetMine(context.Background(), 0)
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusUnauthorized {
		t.Fatalf("error = %v, want unauthorized service error", err)
	}
}
