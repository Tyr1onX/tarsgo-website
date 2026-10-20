package skills

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func newSkillMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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

func TestManagerPermissionsUseExistingGroupMembershipAndSuperAdminRole(t *testing.T) {
	t.Run("regular admin cannot manage a different group", func(t *testing.T) {
		db, mock := newSkillMock(t)
		mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `user_group_members` JOIN user_groups ON user_groups.id = user_group_members.group_id JOIN users ON users.id = user_group_members.user_id WHERE user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.name IN (?,?,?,?,?) AND user_groups.status = ? AND users.status = ?")).
			WithArgs(uint64(8), uint64(42), groupNames[0], groupNames[1], groupNames[2], groupNames[3], groupNames[4], model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))
		service := NewService(db)
		assertSkillStatus(t, service.requireManagerGroup(context.Background(), Actor{ID: 8, RoleName: model.RoleNameAdmin}, 42), http.StatusForbidden)
	})

	t.Run("super admin can manage all five group routes without membership", func(t *testing.T) {
		db, mock := newSkillMock(t)
		service := NewService(db)
		for index := range groupNames {
			groupID := uint64(41 + index)
			mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `user_groups` WHERE id = ? AND name IN (?,?,?,?,?) AND status = ?")).
				WithArgs(groupID, groupNames[0], groupNames[1], groupNames[2], groupNames[3], groupNames[4], model.UserGroupStatusActive).
				WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))
			if err := service.requireManagerGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, groupID); err != nil {
				t.Fatalf("super admin was denied group route %q: %v", groupNames[index], err)
			}
		}
	})

	t.Run("operations member can read their own route", func(t *testing.T) {
		db, mock := newSkillMock(t)
		mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `user_group_members` JOIN user_groups ON user_groups.id = user_group_members.group_id JOIN users ON users.id = user_group_members.user_id WHERE user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.name IN (?,?,?,?,?) AND user_groups.status = ? AND users.status = ?")).
			WithArgs(uint64(20), uint64(45), groupNames[0], groupNames[1], groupNames[2], groupNames[3], groupNames[4], model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))
		if err := NewService(db).requireMemberGroup(context.Background(), 20, 45); err != nil {
			t.Fatalf("operations group member was denied: %v", err)
		}
	})

	t.Run("member cannot read another group's route", func(t *testing.T) {
		db, mock := newSkillMock(t)
		mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `user_group_members` JOIN user_groups ON user_groups.id = user_group_members.group_id JOIN users ON users.id = user_group_members.user_id WHERE user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.name IN (?,?,?,?,?) AND user_groups.status = ? AND users.status = ?")).
			WithArgs(uint64(20), uint64(42), groupNames[0], groupNames[1], groupNames[2], groupNames[3], groupNames[4], model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))
		assertSkillStatus(t, NewService(db).requireMemberGroup(context.Background(), 20, 42), http.StatusForbidden)
	})
}

func TestSkillMemberCannotConfirmMasteryThroughService(t *testing.T) {
	db, _ := newSkillMock(t)
	_, err := NewService(db).Review(context.Background(), Actor{ID: 20, RoleName: model.RoleNameUser}, 77, 20, ReviewInput{
		Action: model.SkillReviewMastered, EvidenceType: model.SkillEvidenceNote, EvidenceNote: "本人自评",
	})
	assertSkillStatus(t, err, http.StatusForbidden)
}

func TestCrossGroupOrUnlinkedAssignmentCannotBeUsedAsSkillEvidence(t *testing.T) {
	db, mock := newSkillMock(t)
	evidenceID := uint64(90)
	mock.ExpectQuery("SELECT assignments\\.id FROM `assignments` JOIN skill_node_assignments ON.*WHERE assignments\\.id = \\? AND assignments\\.group_id = \\? AND skill_node_assignments\\.skill_node_id = \\?.*LIMIT \\?").
		WithArgs(evidenceID, uint64(41), uint64(5), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	err := NewService(db).validateEvidence(db, model.SkillNode{ID: 5, GroupID: 41}, 20, ReviewInput{
		Action: model.SkillReviewMastered, EvidenceType: model.SkillEvidenceAssignment, EvidenceID: &evidenceID,
	})
	assertSkillStatus(t, err, http.StatusNotFound)
}

func TestSkillDependencyCycleAndStates(t *testing.T) {
	if hasDependencyCycle(map[uint64][]uint64{1: {2}, 2: {3}, 3: {}}) {
		t.Fatal("a valid prerequisite route was reported as a cycle")
	}
	if !hasDependencyCycle(map[uint64][]uint64{1: {2}, 2: {3}, 3: {1}}) {
		t.Fatal("a circular prerequisite route was accepted")
	}
	if !hasDependencyCycle(map[uint64][]uint64{5: {5}}) {
		t.Fatal("a self prerequisite was accepted")
	}

	for _, item := range []struct {
		name      string
		node      uint64
		prereqs   []uint64
		mastered  map[uint64]bool
		practiced map[uint64]bool
		want      string
	}{
		{name: "locked until prerequisites mastered", node: 3, prereqs: []uint64{1}, practiced: map[uint64]bool{3: true}, want: StateLocked},
		{name: "available at route start", node: 1, want: StateAvailable},
		{name: "practice is not mastery", node: 1, practiced: map[uint64]bool{1: true}, want: StatePracticed},
		{name: "administrator confirmation is mastery", node: 2, prereqs: []uint64{1}, mastered: map[uint64]bool{1: true, 2: true}, want: StateMastered},
		{name: "prerequisite revocation locks a non-mastered child", node: 2, prereqs: []uint64{1}, mastered: map[uint64]bool{1: false}, want: StateLocked},
	} {
		t.Run(item.name, func(t *testing.T) {
			if got := statusFor(item.node, item.prereqs, item.mastered, item.practiced); got != item.want {
				t.Fatalf("status = %q, want %q", got, item.want)
			}
		})
	}
}

func TestNormalizeSkillNodeAndIDs(t *testing.T) {
	input, err := normalizeNodeInput(NodeInput{GroupID: 41, Name: "  控制基础 ", LearningGoal: "目标", PassingCriteria: "实操"})
	if err != nil {
		t.Fatalf("normalize valid node: %v", err)
	}
	if input.Name != "控制基础" {
		t.Fatalf("node name = %q, want trimmed value", input.Name)
	}
	if _, err := normalizeNodeInput(NodeInput{GroupID: 41, Name: ""}); err == nil {
		t.Fatal("empty node title was accepted")
	}
	ids, err := normalizeIDs([]uint64{4, 2, 4})
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 || ids[0] != 2 || ids[1] != 4 {
		t.Fatalf("normalized IDs = %#v", ids)
	}
	if _, err := normalizeIDs([]uint64{0}); err == nil {
		t.Fatal("zero ID was accepted")
	}
}

func assertSkillStatus(t *testing.T, err error, status int) {
	t.Helper()
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Status != status {
		t.Fatalf("service error = %v, want HTTP %d", err, status)
	}
}
