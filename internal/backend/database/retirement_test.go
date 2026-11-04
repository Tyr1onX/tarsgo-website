package database

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
	"tarsgo-backend/service/recruitmentrecords"
	"tarsgo-backend/service/recruitmentanalytics"
)

func TestMariaDBRetirementPreservesRecruitmentAndAssignmentHistory(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated database")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var user model.User
	must(tx.Where("email=?", "test-super-admin@tarsgo.test").First(&user).Error)
	groups := make([]model.UserGroup, 3)
	for i := range groups {
		groups[i] = model.UserGroup{Name: fmt.Sprintf("[RETIREMENT] group %d", i)}
		must(tx.Create(&groups[i]).Error)
	}
	form := model.RegistrationForm{Title: "[RETIREMENT] synthetic", CreatorID: user.ID, FieldsSchema: []model.FormField{}}
	must(tx.Create(&form).Error)
	at := time.Date(2026, 11, 3, 8, 1, 2, 0, time.UTC)
	// Each row has its own synthetic form to honor the unique form/user constraint.
	ids := []uint64{}
	for i := 0; i < 28; i++ {
		if i > 0 {
			form.ID = 0
			must(tx.Create(&form).Error)
		}
		row := model.Registration{FormID: form.ID, UserID: user.ID, FormData: map[string]any{"group_1": "old-first", "group_2": "old-second", "essay": "keep original answer"}, ContactName: strPtr("Synthetic applicant"), PreferredGroupID: &groups[1].ID, Group1ID: &groups[0].ID, Group2ID: &groups[2].ID, FinalGroupID: &groups[2].ID, FinalStatus: 1, Group1Status: 1, ReviewRemark1: strPtr("remove old review"), RecruitmentStatus: model.RecruitmentStatusAdmitted, InterviewerID: &user.ID, InterviewedAt: &at, InterviewRemark: strPtr("keep current interview"), SubmittedAt: at, UpdatedAt: at}
		if i == 1 {
			row.FinalGroupID = nil
		}
		if i == 2 {
			row.FinalGroupID = nil
			row.PreferredGroupID = nil
		}
		if i == 3 {
			row.FinalGroupID = nil
			row.PreferredGroupID = nil
			row.Group1ID = nil
			row.Group2ID = nil
		}
		must(tx.Create(&row).Error)
		ids = append(ids, row.ID)
		must(tx.Create(&model.RegistrationInterview{RegistrationID: row.ID, GroupID: groups[0].ID, Status: 1, Remark: strPtr("remove legacy interview"), InterviewerID: &user.ID, InterviewedAt: &at}).Error)
	}
	// Approved retired datasets contain synthetic data before cleanup.
	node := skillNodeLegacy{GroupID: groups[0].ID, Name: "[RETIREMENT] skill", CreatedBy: user.ID}
	must(tx.Create(&node).Error)
	must(tx.Create(&skillNodeProgressLegacy{SkillNodeID: node.ID, UserID: user.ID, StartedAt: at}).Error)
	dim := capabilityDimensionLegacy{GroupID: groups[0].ID, Name: "[RETIREMENT] dimension", CreatedBy: user.ID}
	must(tx.Create(&dim).Error)
	assignment := model.Assignment{GroupID: groups[0].ID, CreatorID: user.ID, Title: "[RETIREMENT] retained assignment", Description: "keep", DueAt: at}
	must(tx.Create(&assignment).Error)
	must(tx.Create(&capabilityDimensionSourceLegacy{GroupID: groups[0].ID, DimensionID: dim.ID, SourceType: "assignment", SourceID: assignment.ID}).Error)
	must(tx.Create(&skillNodeAssignmentLegacy{SkillNodeID: node.ID, AssignmentID: assignment.ID}).Error)
	// Both operations are repeatable DML; no DDL may implicitly commit this transaction.
	for i := 0; i < 2; i++ {
		must(clearRetiredLearningData(tx))
		must(archiveRetiredRecruitment(tx))
	}
	for _, table := range []string{"skill_nodes", "skill_node_progress", "skill_node_prerequisites", "skill_node_assignments", "skill_review_events", "capability_dimensions", "capability_dimension_sources", "capability_manual_reviews", "registration_interviews"} {
		var n int64
		must(tx.Table(table).Count(&n).Error)
		if n != 0 {
			t.Fatalf("retired data remains in %s", table)
		}
	}
	var kept model.Assignment
	must(tx.First(&kept, assignment.ID).Error)
	if kept.Title != assignment.Title {
		t.Fatal("assignment modified")
	}
	for i, id := range ids {
		var row model.Registration
		must(tx.First(&row, id).Error)
		if row.RecruitmentStatus != model.RecruitmentStatusAdmitted || row.InterviewRemark == nil || *row.InterviewRemark != "keep current interview" || row.InterviewerID == nil || *row.InterviewerID != user.ID || row.InterviewedAt == nil || !row.InterviewedAt.Equal(at) || row.FormData["essay"] != "keep original answer" || !row.UpdatedAt.Equal(at) {
			t.Fatalf("current record changed: %d", id)
		}
		if row.Group1ID != nil || row.Group2ID != nil || row.FinalGroupID != nil || row.ReviewRemark1 != nil {
			t.Fatal("old fields retained")
		}
		if _, exists := row.FormData["group_2"]; exists {
			t.Fatal("old JSON group retained")
		}
		var archive struct {
			MainGroupID *uint64
			GroupSource string
			FinalStatus uint8
		}
		must(tx.Table("registration_legacy_archives").Where("id=?", id).Take(&archive).Error)
		want := groups[2].ID
		if i == 1 {
			want = groups[1].ID
		}
		if i == 2 {
			want = groups[0].ID
		}
		if i == 3 {
			if archive.MainGroupID != nil || archive.GroupSource != "unknown" {
				t.Fatal("invented missing group")
			}
		} else if archive.MainGroupID == nil || *archive.MainGroupID != want {
			t.Fatalf("group precedence wrong row=%d", i)
		}
		if archive.FinalStatus != 1 {
			t.Fatal("final outcome lost")
		}
	}
	// Public report must still count each archived synthetic registration once,
	// using retained main-group snapshots rather than cleared legacy columns.
	report, err := recruitmentanalytics.NewService(tx).GetReport(context.Background(), "super_admin")
	must(err)
	total := int64(0)
	for _, cohort := range report.Cohorts {
		for _, id := range ids {
			var formID uint64
			must(tx.Model(&model.Registration{}).Select("form_id").Where("id=?", id).Scan(&formID).Error)
			if cohort.FormID == formID {
				for _, group := range cohort.Groups {
					total += group.RegistrationCount
				}
			}
		}
	}
	if total != 27 {
		t.Fatalf("archived group aggregate=%d want27", total)
	}
	svc := recruitmentrecords.NewService(tx)
	for _, role := range []string{"user", "admin", ""} {
		if _, err := svc.List(context.Background(), role, "recruitment", ""); err != recruitmentrecords.ErrForbidden {
			t.Fatal("archive access expanded")
		}
	}
	for _, key := range []string{"skills", "interviews", "registrations;DROP TABLE users"} {
		if _, err := svc.List(context.Background(), "super_admin", key, ""); err != recruitmentrecords.ErrInvalid {
			t.Fatal("arbitrary dataset accepted")
		}
	}
	for _, cursor := range []string{"-1", "0", "1 OR 1=1", "18446744073709551616"} {
		if _, err := svc.List(context.Background(), "super_admin", "recruitment", cursor); err != recruitmentrecords.ErrInvalid {
			t.Fatal("invalid cursor accepted")
		}
	}
	seen := map[string]bool{}
	cursor := ""
	for {
		page, err := svc.List(context.Background(), "super_admin", "recruitment", cursor)
		must(err)
		if len(page.Rows) > 25 {
			t.Fatal("unbounded archive")
		}
		for _, row := range page.Rows {
			if seen[row[0]] {
				t.Fatal("duplicate page row")
			}
			seen[row[0]] = true
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	for _, id := range ids {
		var count int64
		must(tx.Table("registration_legacy_archives").Where("id=?", id).Count(&count).Error)
		if count != 1 {
			t.Fatal("archive missing")
		}
	}
	if len(seen) < 28 {
		t.Fatal("archive pagination lost rows")
	}
	for _, key := range []string{"cultivation-notes"} {
		_, err := svc.List(context.Background(), "super_admin", key, "")
		must(err)
	}
}
func strPtr(s string) *string { return &s }
