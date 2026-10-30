package availability

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
	"tarsgo-backend/service/timetable"
)

func TestAcceptanceRealTimetableImportAndAvailabilityStats(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	filePath := strings.TrimSpace(os.Getenv("TARSGO_REAL_TIMETABLE_FILE"))
	if dsn == "" || filePath == "" {
		t.Skip("TARSGO_QA_TEST_DSN and TARSGO_REAL_TIMETABLE_FILE are required for the real timetable acceptance test")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing real timetable verification outside the isolated local acceptance database")
	}
	contents, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read supplied timetable: %v", err)
	}
	if len(contents) == 0 || len(contents) > 5<<20 {
		t.Fatalf("supplied timetable size %d is outside the supported upload limit", len(contents))
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

	var adminRole, memberRole model.Role
	if err := db.Where("name = ?", model.RoleNameAdmin).First(&adminRole).Error; err != nil {
		t.Fatalf("load acceptance admin role: %v", err)
	}
	if err := db.Where("name = ?", model.RoleNameUser).First(&memberRole).Error; err != nil {
		t.Fatalf("load acceptance member role: %v", err)
	}
	nonce := time.Now().UnixNano()
	group := model.UserGroup{Name: fmt.Sprintf("[QA] real timetable %d", nonce), Status: model.UserGroupStatusActive}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create isolated timetable group: %v", err)
	}
	userIDs := make([]uint64, 0, 22)
	t.Cleanup(func() {
		_ = db.Where("group_id = ?", group.ID).Delete(&model.UserGroupMember{}).Error
		if len(userIDs) > 0 {
			_ = db.Where("user_id IN ?", userIDs).Delete(&model.Timetable{}).Error
			_ = db.Where("id IN ?", userIDs).Delete(&model.User{}).Error
		}
		_ = db.Delete(&model.UserGroup{}, group.ID).Error
	})
	manager := model.User{RoleID: adminRole.ID, Name: fmt.Sprintf("qa-manager-%d", nonce), Email: fmt.Sprintf("qa-manager-%d@tarsgo.test", nonce), Status: model.UserStatusEnabled}
	users := []model.User{manager}
	for index := 0; index < 21; index++ {
		name := fmt.Sprintf("qa-member-%d-%d", nonce, index)
		users = append(users, model.User{RoleID: memberRole.ID, Name: name, Email: name + "@tarsgo.test", Status: model.UserStatusEnabled})
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatalf("create isolated timetable users: %v", err)
	}
	for _, user := range users {
		userIDs = append(userIDs, user.ID)
	}
	memberships := make([]model.UserGroupMember, 0, len(users))
	for index, user := range users {
		role := model.UserGroupMemberRoleMember
		if index == 0 {
			role = model.UserGroupMemberRoleLeader
		}
		memberships = append(memberships, model.UserGroupMember{GroupID: group.ID, UserID: user.ID, Role: role})
	}
	if err := db.Create(&memberships).Error; err != nil {
		t.Fatalf("create isolated timetable memberships: %v", err)
	}

	if detected := timetable.DetectSemester(contents); detected != timetable.CurrentSemester {
		t.Fatal("supplied timetable semester does not match the current term configuration")
	}
	imported, err := timetable.NewService(db).Import(context.Background(), users[1].ID, filepath.Base(filePath), contents)
	if err != nil {
		t.Fatalf("import supplied timetable: %v", err)
	}
	if len(imported.Courses) == 0 || len(imported.Notes) == 0 {
		t.Fatalf("supplied timetable did not cover both grid courses and undetermined courses: courses=%d notes=%d", len(imported.Courses), len(imported.Notes))
	}

	service := NewService(NewGormRepository(db))
	actor := Actor{UserID: users[0].ID, Role: model.RoleNameAdmin}
	week := firstActiveWeek(imported.Courses)
	if week == 0 {
		t.Fatal("supplied grid timetable contains no active teaching week")
	}
	gridCourse := firstActiveCourse(imported.Courses, week)
	conflict, err := service.Analyze(context.Background(), actor, Filter{
		GroupID: group.ID, Week: week,
		Weekday: gridCourse.Weekday, StartSection: gridCourse.StartSection, EndSection: gridCourse.EndSection,
	})
	if err != nil {
		t.Fatalf("analyze a known grid-course time: %v", err)
	}
	if conflict.TotalCount != 22 || conflict.ImportedCount != 1 || conflict.MissingCount != 21 || conflict.ConflictCount != 1 || conflict.FreeCount != 0 {
		t.Fatalf("grid-course counts = imported:%d missing:%d conflict:%d free:%d total:%d", conflict.ImportedCount, conflict.MissingCount, conflict.ConflictCount, conflict.FreeCount, conflict.TotalCount)
	}
	freeSlot, ok := firstFreeSlot(imported.Courses, week)
	if !ok {
		t.Fatal("supplied grid timetable has no free slot to verify")
	}
	free, err := service.Analyze(context.Background(), actor, Filter{
		GroupID: group.ID, Week: week,
		Weekday: freeSlot.Weekday, StartSection: freeSlot.StartSection, EndSection: freeSlot.EndSection,
	})
	if err != nil {
		t.Fatalf("analyze a known grid-free time: %v", err)
	}
	if free.TotalCount != 22 || free.ImportedCount != 1 || free.MissingCount != 21 || free.ConflictCount != 0 || free.FreeCount != 1 {
		t.Fatalf("grid-free counts = imported:%d missing:%d conflict:%d free:%d total:%d", free.ImportedCount, free.MissingCount, free.ConflictCount, free.FreeCount, free.TotalCount)
	}
}

func firstActiveWeek(courses []timetable.Course) int {
	for week := 1; week <= 30; week++ {
		for _, course := range courses {
			if course.Active(week) {
				return week
			}
		}
	}
	return 0
}

func firstActiveCourse(courses []timetable.Course, week int) timetable.Course {
	for _, course := range courses {
		if course.Active(week) {
			return course
		}
	}
	return timetable.Course{}
}

func firstFreeSlot(courses []timetable.Course, week int) (Slot, bool) {
	for weekday := 1; weekday <= 7; weekday++ {
		for section := 1; section <= 24; section++ {
			occupied := false
			for _, course := range courses {
				if course.Active(week) && course.Weekday == weekday && course.StartSection <= section && course.EndSection >= section {
					occupied = true
					break
				}
			}
			if !occupied {
				return Slot{Weekday: weekday, StartSection: section, EndSection: section}, true
			}
		}
	}
	return Slot{}, false
}
