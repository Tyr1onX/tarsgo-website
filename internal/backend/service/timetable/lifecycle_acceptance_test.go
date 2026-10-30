package timetable

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"tarsgo-backend/model"
)

func TestAcceptanceTimetableCleanupLifecycle(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	filePath := strings.TrimSpace(os.Getenv("TARSGO_REAL_TIMETABLE_FILE"))
	if dsn == "" || filePath == "" {
		t.Skip("TARSGO_QA_TEST_DSN and TARSGO_REAL_TIMETABLE_FILE are required for the real timetable lifecycle acceptance test")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing timetable lifecycle verification outside the isolated local acceptance database")
	}
	contents, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read supplied timetable: %v", err)
	}
	if len(contents) == 0 || len(contents) > 5<<20 || DetectSemester(contents) != CurrentSemester {
		t.Fatal("supplied timetable does not match the configured current term or upload limit")
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

	var original []model.Timetable
	if err := db.Find(&original).Error; err != nil {
		t.Fatal("snapshot isolated acceptance timetable rows")
	}
	service := NewService(db)
	nonce := uint64(time.Now().UnixNano())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := service.withLifecycleLock(ctx, func(tx *gorm.DB) error {
			if err := tx.Exec("DELETE FROM `personal_timetables`").Error; err != nil {
				return err
			}
			if len(original) > 0 {
				if err := tx.Create(&original).Error; err != nil {
					return err
				}
			}
			return tx.Where("actor_id = ? AND action = ?", nonce, "personal_timetables_cleared").Delete(&model.AuditLog{}).Error
		}); err != nil {
			t.Errorf("restore isolated acceptance timetable rows: %v", err)
		}
	})

	beforeBusinessData := acceptanceBusinessDataCounts(t, db)
	if _, err := service.ClearAll(context.Background(), nonce, model.RoleNameAdmin, 0); !isServiceStatus(err, 403) {
		t.Fatalf("ordinary admin cleanup error = %v, want forbidden", err)
	}
	if _, err := service.CountAll(context.Background(), nonce, model.RoleNameAdmin); !isServiceStatus(err, 403) {
		t.Fatalf("ordinary admin preview error = %v, want forbidden", err)
	}
	if _, err := service.ClearAll(context.Background(), nonce, model.RoleNameUser, 0); !isServiceStatus(err, 403) {
		t.Fatalf("member cleanup error = %v, want forbidden", err)
	}
	if err := acceptanceAssertBusinessDataCounts(t, db, beforeBusinessData); err != nil {
		t.Fatal(err)
	}

	if _, err := service.Import(context.Background(), nonce, filepath.Base(filePath), contents); err != nil {
		t.Fatalf("import real timetable before cleanup: %v", err)
	}
	previewCount, err := service.CountAll(context.Background(), nonce, model.RoleNameSuperAdmin)
	if err != nil || previewCount != int64(len(original)+1) {
		t.Fatalf("super-admin preview count=%d want=%d err=%v", previewCount, len(original)+1, err)
	}
	if _, err := service.ClearAll(context.Background(), nonce, model.RoleNameSuperAdmin, previewCount-1); !isServiceStatus(err, 409) {
		t.Fatalf("stale preview cleanup error = %v, want conflict", err)
	}
	stillPresent, err := service.CountAll(context.Background(), nonce, model.RoleNameSuperAdmin)
	if err != nil || stillPresent != previewCount {
		t.Fatalf("stale confirmation changed count to %d, want %d (err %v)", stillPresent, previewCount, err)
	}

	cleared, err := service.ClearAll(context.Background(), nonce, model.RoleNameSuperAdmin, previewCount)
	if err != nil || cleared == nil || int64(cleared.DeletedCount) != previewCount {
		t.Fatalf("global cleanup result=%+v err=%v want deleted=%d", cleared, err, previewCount)
	}
	if count, err := service.CountAll(context.Background(), nonce, model.RoleNameSuperAdmin); err != nil || count != 0 {
		t.Fatalf("after cleanup count=%d err=%v want zero", count, err)
	}
	if rows, err := service.List(context.Background(), nonce); err != nil || len(rows) != 0 {
		t.Fatalf("member timetable list after cleanup=%v err=%v want empty", rows, err)
	}
	if err := acceptanceAssertBusinessDataCounts(t, db, beforeBusinessData); err != nil {
		t.Fatal(err)
	}

	repeated, err := service.ClearAll(context.Background(), nonce, model.RoleNameSuperAdmin, 0)
	if err != nil || repeated == nil || repeated.DeletedCount != 0 {
		t.Fatalf("repeated cleanup result=%+v err=%v want zero", repeated, err)
	}
	if _, err := service.Import(context.Background(), nonce, filepath.Base(filePath), contents); err != nil {
		t.Fatalf("reimport timetable after cleanup: %v", err)
	}
	rows, err := service.List(context.Background(), nonce)
	if err != nil || len(rows) != 1 || rows[0].Semester != CurrentSemester || len(rows[0].Courses) == 0 {
		t.Fatalf("member timetable after reimport=%v err=%v", rows, err)
	}

	// A concurrent upload and cleanup serialize on the same MySQL lock. Either
	// order is valid: cleanup is last (zero rows) or the new upload is last (one row).
	start := make(chan struct{})
	results := make(chan error, 2)
	var workers sync.WaitGroup
	workers.Add(2)
	go func() {
		defer workers.Done()
		<-start
		_, err := service.Import(context.Background(), nonce, filepath.Base(filePath), contents)
		results <- err
	}()
	go func() {
		defer workers.Done()
		<-start
		_, err := service.ClearAll(context.Background(), nonce, model.RoleNameSuperAdmin, 1)
		results <- err
	}()
	close(start)
	workers.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatalf("concurrent upload/cleanup: %v", err)
		}
	}
	finalCount, err := service.CountAll(context.Background(), nonce, model.RoleNameSuperAdmin)
	if err != nil || (finalCount != 0 && finalCount != 1) {
		t.Fatalf("concurrent cleanup left count=%d err=%v, want zero or one", finalCount, err)
	}
	rows, err = service.List(context.Background(), nonce)
	if err != nil || int64(len(rows)) != finalCount {
		t.Fatalf("concurrent result list count=%d rows=%d err=%v", finalCount, len(rows), err)
	}
	if finalCount == 1 && (rows[0].Semester != CurrentSemester || len(rows[0].Courses) == 0) {
		t.Fatalf("concurrent upload left invalid timetable: %+v", rows[0])
	}
	if err := acceptanceAssertBusinessDataCounts(t, db, beforeBusinessData); err != nil {
		t.Fatal(err)
	}

	var audits []model.AuditLog
	if err := db.Where("actor_id = ? AND action = ?", nonce, "personal_timetables_cleared").Order("id ASC").Find(&audits).Error; err != nil {
		t.Fatal("read cleanup audit records")
	}
	wantCounts := []int64{previewCount, 0, 1}
	if len(audits) != len(wantCounts) {
		t.Fatalf("cleanup audit records=%d want %d", len(audits), len(wantCounts))
	}
	for index, audit := range audits {
		var metadata struct {
			DeletedCount int64 `json:"deletedCount"`
		}
		if err := json.Unmarshal([]byte(audit.Metadata), &metadata); err != nil {
			t.Fatalf("parse cleanup audit metadata: %v", err)
		}
		if audit.ActorID == nil || *audit.ActorID != nonce || metadata.DeletedCount != wantCounts[index] || audit.CreatedAt.IsZero() || audit.Path != "/api/admin/timetable-availability/cleanup" || audit.Status != 200 {
			t.Fatalf("cleanup audit %d does not record actor, time, count and action: %+v metadata=%+v", index, audit, metadata)
		}
	}
}

func acceptanceBusinessDataCounts(t *testing.T, db *gorm.DB) map[string]int64 {
	t.Helper()
	counts := map[string]int64{}
	for name, modelValue := range map[string]any{
		"users":                  &model.User{},
		"user_groups":            &model.UserGroup{},
		"user_group_members":     &model.UserGroupMember{},
		"assignments":            &model.Assignment{},
		"assignment_submissions": &model.AssignmentSubmission{},
		"weekly_reports":         &model.WeeklyReport{},
	} {
		var count int64
		if err := db.Model(modelValue).Count(&count).Error; err != nil {
			t.Fatalf("count %s before/after cleanup: %v", name, err)
		}
		counts[name] = count
	}
	return counts
}

func acceptanceAssertBusinessDataCounts(t *testing.T, db *gorm.DB, want map[string]int64) error {
	t.Helper()
	got := acceptanceBusinessDataCounts(t, db)
	for table, count := range want {
		if got[table] != count {
			return fmt.Errorf("cleanup changed %s rows from %d to %d", table, count, got[table])
		}
	}
	return nil
}

func isServiceStatus(err error, status int) bool {
	var serviceErr *Error
	return errors.As(err, &serviceErr) && serviceErr.Status == status
}
