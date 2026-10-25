package growth

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

// This opt-in test writes only synthetic [TEST_GROWTH] rows to the isolated
// local acceptance database and removes those rows when the test finishes.
func TestAcceptanceDatabaseGrowthTimeline(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to run the growth integration test outside the isolated local acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("open isolated acceptance database")
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal("open isolated acceptance SQL connection")
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	for _, table := range []string{
		"users", "user_groups", "user_group_members", "assignments", "assignment_targets", "assignment_submissions",
		"assignment_reviews", "training_questions", "training_question_posts", "training_question_growth_events", "weekly_reports",
	} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("acceptance database is missing required table %s", table)
		}
	}

	var technicalGroup, operationsGroup model.UserGroup
	if err := db.Where("name = ? AND status = ?", "机械组", model.UserGroupStatusActive).First(&technicalGroup).Error; err != nil {
		t.Fatalf("load active technical test group: %v", err)
	}
	if err := db.Where("name = ? AND status = ?", "运营组", model.UserGroupStatusActive).First(&operationsGroup).Error; err != nil {
		t.Fatalf("load active operations test group: %v", err)
	}
	var userRole model.Role
	if err := db.Where("name = ?", model.RoleNameUser).First(&userRole).Error; err != nil {
		t.Fatalf("load member role: %v", err)
	}

	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	createdUsers := make([]uint64, 0, 3)
	createdMemberships := make([]uint64, 0, 3)
	createdAssignmentIDs := make([]uint64, 0, 2)
	createdSubmissionIDs := make([]uint64, 0, 2)
	createdQuestionIDs := make([]uint64, 0, 2)
	createdQuestionPostIDs := make([]uint64, 0, 2)
	createdReportIDs := make([]uint64, 0, 1)
	t.Cleanup(func() {
		deleteRows := func(query string, ids []uint64, value any) {
			if len(ids) == 0 {
				return
			}
			if err := db.Where(query, ids).Delete(value).Error; err != nil {
				t.Errorf("remove synthetic growth test rows: %v", err)
			}
		}
		if len(createdReportIDs) > 0 {
			deleteRows("id IN ?", createdReportIDs, &model.WeeklyReport{})
		}
		if len(createdQuestionPostIDs) > 0 {
			deleteRows("id IN ?", createdQuestionPostIDs, &model.TrainingQuestionPost{})
		}
		if len(createdQuestionIDs) > 0 {
			deleteRows("question_id IN ?", createdQuestionIDs, &model.TrainingQuestionAttachment{})
			deleteRows("id IN ?", createdQuestionIDs, &model.TrainingQuestion{})
		}
		if len(createdSubmissionIDs) > 0 {
			deleteRows("submission_id IN ?", createdSubmissionIDs, &model.AssignmentReview{})
			deleteRows("submission_id IN ?", createdSubmissionIDs, &model.AssignmentSubmissionFile{})
			deleteRows("id IN ?", createdSubmissionIDs, &model.AssignmentSubmission{})
		}
		if len(createdAssignmentIDs) > 0 {
			deleteRows("assignment_id IN ?", createdAssignmentIDs, &model.AssignmentTarget{})
			deleteRows("id IN ?", createdAssignmentIDs, &model.Assignment{})
		}
		if len(createdMemberships) > 0 {
			deleteRows("id IN ?", createdMemberships, &model.UserGroupMember{})
		}
		if len(createdUsers) > 0 {
			deleteRows("id IN ?", createdUsers, &model.User{})
		}
	})

	createUser := func(label string) model.User {
		name := "[TEST_GROWTH] " + label
		realName := name
		user := model.User{
			RoleID: userRole.ID, Name: name, RealName: &realName,
			Email:  fmt.Sprintf("growth-%s-%s@tarsgo.test", nonce, strings.ToLower(label)),
			Status: model.UserStatusEnabled,
		}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create synthetic growth account: %v", err)
		}
		createdUsers = append(createdUsers, user.ID)
		return user
	}
	createMembership := func(userID, groupID uint64, joinedAt time.Time) {
		member := model.UserGroupMember{UserID: userID, GroupID: groupID, JoinedAt: joinedAt}
		if err := db.Create(&member).Error; err != nil {
			t.Fatalf("create synthetic growth membership: %v", err)
		}
		createdMemberships = append(createdMemberships, member.ID)
	}

	member := createUser("technical-member")
	peer := createUser("peer")
	operationsMember := createUser("operations-member")
	now := time.Now().UTC().Truncate(time.Second)
	createMembership(member.ID, technicalGroup.ID, now.Add(-90*24*time.Hour))
	createMembership(peer.ID, technicalGroup.ID, now.Add(-80*24*time.Hour))
	createMembership(operationsMember.ID, operationsGroup.ID, now.Add(-70*24*time.Hour))

	createAssignment := func(title string, dueAt time.Time) model.Assignment {
		item := model.Assignment{
			GroupID: technicalGroup.ID, CreatorID: peer.ID, Title: "[TEST_GROWTH] " + title,
			Description: "Synthetic acceptance task", DueAt: dueAt,
			AttachmentRequirements: "", IsGroupWide: false,
		}
		if err := db.Create(&item).Error; err != nil {
			t.Fatalf("create synthetic assignment: %v", err)
		}
		createdAssignmentIDs = append(createdAssignmentIDs, item.ID)
		if err := db.Create(&model.AssignmentTarget{AssignmentID: item.ID, UserID: member.ID}).Error; err != nil {
			t.Fatalf("create synthetic assignment target: %v", err)
		}
		return item
	}
	completed := createAssignment("passed task", now.Add(2*24*time.Hour))
	pending := createAssignment("next task", now.Add(4*24*time.Hour))
	first := model.AssignmentSubmission{AssignmentID: completed.ID, UserID: member.ID, Attempt: 1, SubmittedAt: now.Add(-10 * 24 * time.Hour)}
	second := model.AssignmentSubmission{AssignmentID: completed.ID, UserID: member.ID, Attempt: 2, SubmittedAt: now.Add(-6 * 24 * time.Hour)}
	for _, submission := range []*model.AssignmentSubmission{&first, &second} {
		if err := db.Create(submission).Error; err != nil {
			t.Fatalf("create synthetic submission attempt: %v", err)
		}
		createdSubmissionIDs = append(createdSubmissionIDs, submission.ID)
	}
	if err := db.Create(&model.AssignmentReview{SubmissionID: first.ID, ReviewerID: peer.ID, Score: 60, Decision: model.AssignmentReviewNeedsRedo, Comment: "补充一次验证", CreatedAt: now.Add(-8 * 24 * time.Hour)}).Error; err != nil {
		t.Fatalf("create synthetic redo review: %v", err)
	}
	if err := db.Create(&model.AssignmentReview{SubmissionID: second.ID, ReviewerID: peer.ID, Score: 92, Decision: model.AssignmentReviewPassed, Comment: "验证通过", CreatedAt: now.Add(-4 * 24 * time.Hour)}).Error; err != nil {
		t.Fatalf("create synthetic pass review: %v", err)
	}
	solvedAt := now.Add(-2 * 24 * time.Hour)
	faqAt := now.Add(-24 * time.Hour)
	question := model.TrainingQuestion{
		GroupID: technicalGroup.ID, AskerID: member.ID, Title: "[TEST_GROWTH] 公开问题",
		Body: "Synthetic acceptance question", Visibility: model.TrainingQuestionPublic,
		IsSolved: true, SolvedBy: &peer.ID, SolvedAt: &solvedAt, IsFAQ: true, FAQBy: &peer.ID, FAQAt: &faqAt,
	}
	if err := db.Create(&question).Error; err != nil {
		t.Fatalf("create synthetic public question: %v", err)
	}
	createdQuestionIDs = append(createdQuestionIDs, question.ID)
	peerAnswer := model.TrainingQuestionPost{QuestionID: question.ID, AuthorID: peer.ID, Kind: model.TrainingQuestionAnswer, Body: "Synthetic answer", CreatedAt: now.Add(-3 * 24 * time.Hour)}
	memberFollowUp := model.TrainingQuestionPost{QuestionID: question.ID, AuthorID: member.ID, Kind: model.TrainingQuestionFollowUp, Body: "Synthetic follow-up", CreatedAt: now.Add(-2*24*time.Hour + time.Hour)}
	for _, post := range []*model.TrainingQuestionPost{&peerAnswer, &memberFollowUp} {
		if err := db.Create(post).Error; err != nil {
			t.Fatalf("create synthetic discussion post: %v", err)
		}
		createdQuestionPostIDs = append(createdQuestionPostIDs, post.ID)
	}
	privateQuestion := model.TrainingQuestion{
		GroupID: technicalGroup.ID, AskerID: peer.ID, Title: "[TEST_GROWTH] PRIVATE_MARKER",
		Body: "Private question", Visibility: model.TrainingQuestionPrivate,
	}
	if err := db.Create(&privateQuestion).Error; err != nil {
		t.Fatalf("create synthetic private question: %v", err)
	}
	createdQuestionIDs = append(createdQuestionIDs, privateQuestion.ID)

	report := model.WeeklyReport{
		GroupID: &operationsGroup.ID, UserID: operationsMember.ID, WeekStart: model.WeeklyReportWeekStart(now.AddDate(0, 0, -7).Format(time.DateOnly)),
		Completed: "PRIVATE_REPORT_CONTENT_MARKER", Blockers: "Private", NextPlan: "Private",
	}
	if err := db.Create(&report).Error; err != nil {
		t.Fatalf("create synthetic weekly report: %v", err)
	}
	createdReportIDs = append(createdReportIDs, report.ID)

	service := NewService(db, assignment.NewService(db))
	service.Now = func() time.Time { return now }
	profile, err := service.GetMine(context.Background(), member.ID)
	if err != nil {
		t.Fatalf("read synthetic technical-member profile: %v", err)
	}
	if profile.DisplayName != "[TEST_GROWTH] technical-member" || profile.Stats.CompletedChallenges != 1 || profile.Stats.FirstSubmissions != 1 || profile.Stats.ResolvedQuestions != 1 || profile.Stats.FAQContributions != 1 || profile.Stats.DiscussionThreads != 1 {
		t.Fatalf("technical profile summary = %#v / %#v", profile.DisplayName, profile.Stats)
	}
	if profile.NextAction == nil || profile.NextAction.Title != "[TEST_GROWTH] next task" || profile.NextAction.Href != fmt.Sprintf("/dashboard/assignments?assignmentId=%d", pending.ID) {
		t.Fatalf("next training action = %#v", profile.NextAction)
	}
	if !containsEvent(profile.Events, "assignment_review_needs_redo") || !containsEvent(profile.Events, "assignment_resubmission") || !containsEvent(profile.Events, "assignment_review_passed") || !containsEvent(profile.Events, "discussion_participation") || !containsEvent(profile.Events, "question_solved") || !containsEvent(profile.Events, "faq_contribution") {
		t.Fatalf("technical timeline is missing a source-backed event: %#v", profile.Events)
	}
	if strings.Contains(fmt.Sprintf("%#v", profile), "PRIVATE_MARKER") || strings.Contains(fmt.Sprintf("%#v", profile), "PRIVATE_REPORT_CONTENT_MARKER") {
		t.Fatal("growth profile exposed a private question or report body")
	}
	for index := 1; index < len(profile.Events); index++ {
		if profile.Events[index-1].OccurredAt.After(profile.Events[index].OccurredAt) {
			t.Fatalf("growth timeline is not chronological: %#v", profile.Events)
		}
	}

	operationsProfile, err := service.GetMine(context.Background(), operationsMember.ID)
	if err != nil {
		t.Fatalf("read synthetic operations profile: %v", err)
	}
	if operationsProfile.Stats.WeeklyReports != 1 || len(operationsProfile.Events) != 2 || operationsProfile.Events[1].Kind != "weekly_report" {
		t.Fatalf("operations profile = %#v", operationsProfile)
	}
	if strings.Contains(fmt.Sprintf("%#v", operationsProfile), "PRIVATE_REPORT_CONTENT_MARKER") {
		t.Fatal("operations growth profile exposed a weekly-report body")
	}
}

func containsEvent(events []Event, kind string) bool {
	for _, event := range events {
		if event.Kind == kind {
			return true
		}
	}
	return false
}
