package database

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
)

func TestAllMembersInCohort(t *testing.T) {
	for _, tc := range []struct {
		submitted, eligible []uint64
		want                bool
	}{
		{[]uint64{8, 9}, []uint64{7, 8, 9}, true},
		{[]uint64{8, 12}, []uint64{7, 8, 9}, false},
		{nil, []uint64{7, 8, 9}, false},
		{[]uint64{8}, nil, false},
	} {
		if got := allMembersInCohort(tc.submitted, tc.eligible); got != tc.want {
			t.Fatalf("allMembersInCohort(%v, %v) = %t, want %t", tc.submitted, tc.eligible, got, tc.want)
		}
	}
}

func TestAcceptanceDatabaseLegacyAssignmentCohortCorrection(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to inspect or change any database except isolated acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	if !db.Migrator().HasTable(&legacyAssignmentTargetArchiveV75{}) {
		t.Fatal("migration v75 archive table is missing")
	}

	testRollback := errors.New("deliberate rollback of synthetic legacy cohort test")
	err = db.Transaction(func(tx *gorm.DB) error {
		var role model.Role
		if err := tx.Where("name = ?", model.RoleNameUser).First(&role).Error; err != nil {
			return err
		}
		now := time.Now().UTC().Truncate(time.Second)
		nonce := fmt.Sprint(time.Now().UnixNano())
		for _, groupName := range []string{"AI组", "视觉组"} {
			var group model.UserGroup
			err := tx.Where("name = ?", groupName).First(&group).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				group = model.UserGroup{Name: groupName, Status: model.UserGroupStatusActive}
				err = tx.Create(&group).Error
			}
			if err != nil {
				return err
			}
			if group.Status != model.UserGroupStatusActive {
				t.Fatalf("acceptance group %s is inactive", groupName)
			}

			users := make([]model.User, 3)
			for i := range users {
				users[i] = model.User{
					RoleID: role.ID, Name: "cohort-test-" + nonce,
					Email:  fmt.Sprintf("cohort-%s-%s-%d@test.invalid", nonce, groupName, i),
					Status: model.UserStatusEnabled, TeamIdentityStatus: model.TeamIdentityTraineeMember,
				}
				if err := tx.Create(&users[i]).Error; err != nil {
					return err
				}
				if err := tx.Create(&model.UserGroupMember{GroupID: group.ID, UserID: users[i].ID, Role: model.UserGroupMemberRoleMember}).Error; err != nil {
					return err
				}
			}

			older := model.RegistrationForm{CreatorID: users[0].ID, Title: "cohort-old-" + nonce, Status: model.RegistrationFormStatusClosed,
				FieldsSchema: []model.FormField{}, CreatedAt: now.Add(-40 * 24 * time.Hour)}
			latest := model.RegistrationForm{CreatorID: users[0].ID, Title: "cohort-new-" + nonce, Status: model.RegistrationFormStatusClosed,
				FieldsSchema: []model.FormField{}, CreatedAt: now.Add(2 * time.Minute)}
			for _, form := range []*model.RegistrationForm{&older, &latest} {
				if err := tx.Create(form).Error; err != nil {
					return err
				}
			}
			for i, user := range users {
				formID := latest.ID
				if i == 2 {
					formID = older.ID
				}
				r := model.Registration{FormID: formID, UserID: user.ID, FormData: map[string]any{},
					RecruitmentStatus: model.RecruitmentStatusAdmitted, PreferredGroupID: &group.ID}
				if err := tx.Create(&r).Error; err != nil {
					return err
				}
			}

			makeAssignment := func(label string, submitter uint64) (model.Assignment, error) {
				item := model.Assignment{GroupID: group.ID, CreatorID: users[0].ID, Title: label,
					Description: "synthetic only", DueAt: now.Add(5 * 24 * time.Hour),
					IsGroupWide: true, PublicationStatus: model.AssignmentPublicationPublished,
					CreatedAt: now.Add(5 * time.Minute)}
				if err := tx.Create(&item).Error; err != nil {
					return item, err
				}
				for _, user := range users {
					if err := tx.Create(&model.AssignmentTarget{AssignmentID: item.ID, UserID: user.ID}).Error; err != nil {
						return item, err
					}
				}
				if submitter != 0 {
					if err := tx.Create(&model.AssignmentSubmission{AssignmentID: item.ID, UserID: submitter,
						Attempt: 1, SubmittedAt: now}).Error; err != nil {
						return item, err
					}
				}
				return item, nil
			}
			valid, err := makeAssignment("cohort-correct-"+nonce, users[0].ID)
			if err != nil {
				return err
			}
			mixed, err := makeAssignment("cohort-mixed-"+nonce, users[2].ID)
			if err != nil {
				return err
			}
			noSubmissions, err := makeAssignment("cohort-empty-"+nonce, 0)
			if err != nil {
				return err
			}
			if err := migrateLegacyAssignmentRecipientsV76(tx); err != nil {
				return err
			}
			for _, check := range []struct {
				item  model.Assignment
				fixed bool
			}{
				{valid, true}, {mixed, false}, {noSubmissions, false},
			} {
				var stored model.Assignment
				if err := tx.First(&stored, check.item.ID).Error; err != nil {
					return err
				}
				if stored.IsGroupWide == check.fixed {
					t.Fatalf("assignment %d fixed=%v, expected %v", stored.ID, !stored.IsGroupWide, check.fixed)
				}
				if check.fixed && (len(stored.CohortFormIDs) != 1 || stored.CohortFormIDs[0] != latest.ID) {
					t.Fatalf("assignment %d selected cohorts = %v", stored.ID, stored.CohortFormIDs)
				}
				var targetIDs []uint64
				if err := tx.Model(&model.AssignmentTarget{}).Where("assignment_id = ?", stored.ID).
					Order("user_id ASC").Pluck("user_id", &targetIDs).Error; err != nil {
					return err
				}
				want := 3
				if check.fixed {
					want = 2
				}
				if len(targetIDs) != want {
					t.Fatalf("assignment %d targets %v, want %d", stored.ID, targetIDs, want)
				}
				var archiveCount int64
				if err := tx.Model(&legacyAssignmentTargetArchiveV75{}).Where("assignment_id = ?", stored.ID).
					Count(&archiveCount).Error; err != nil {
					return err
				}
				if check.fixed && archiveCount != 3 || !check.fixed && archiveCount != 0 {
					t.Fatalf("assignment %d archived targets = %d, fixed=%v", stored.ID, archiveCount, check.fixed)
				}
			}
			var submissionCount int64
			if err := tx.Model(&model.AssignmentSubmission{}).Where("assignment_id IN ?", []uint64{valid.ID, mixed.ID}).
				Count(&submissionCount).Error; err != nil {
				return err
			}
			if submissionCount != 2 {
				t.Fatalf("migrating assignment targets deleted submissions; count=%d", submissionCount)
			}
		}
		return testRollback
	})
	if !errors.Is(err, testRollback) {
		t.Fatalf("synthetic database test did not roll back cleanly: %v", err)
	}
}