package workmanual

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func newWorkManualMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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

func TestOperationsCatalogueAllowsOperationsMembersAndDeniesOtherGroups(t *testing.T) {
	query := regexp.QuoteMeta("SELECT count(*) FROM `user_group_members` JOIN user_groups ON user_groups.id = user_group_members.group_id JOIN users ON users.id = user_group_members.user_id WHERE user_group_members.user_id = ? AND user_groups.name = ? AND user_groups.status = ? AND users.status = ?")

	t.Run("operations member can read the catalogue", func(t *testing.T) {
		db, mock := newWorkManualMock(t)
		mock.ExpectQuery(query).
			WithArgs(uint64(42), OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))

		catalogue, err := NewService(db).OperationsCatalogue(context.Background(), Actor{ID: 42, RoleName: model.RoleNameUser})
		if err != nil {
			t.Fatalf("read catalogue: %v", err)
		}
		if !json.Valid(catalogue) || !strings.Contains(string(catalogue), "校园网之窗宣传申请") {
			t.Fatalf("catalogue is invalid or missing the SOP title: %s", catalogue)
		}
		for _, expected := range []string{"592 × 450 px", "xywzc@jlu.edu.cn", "活动开始前至少 10 天", "行政楼 301", "校园网之窗宣传申请表（DOC）"} {
			if !strings.Contains(string(catalogue), expected) {
				t.Errorf("catalogue is missing source-backed detail %q", expected)
			}
		}
	})

	t.Run("operations admin must have active operations membership", func(t *testing.T) {
		db, mock := newWorkManualMock(t)
		mock.ExpectQuery(query).
			WithArgs(uint64(51), OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))

		_, err := NewService(db).OperationsCatalogue(context.Background(), Actor{ID: 51, RoleName: model.RoleNameAdmin})
		var serviceErr *ServiceError
		if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusForbidden {
			t.Fatalf("catalogue error = %v, want HTTP 403", err)
		}
	})

	t.Run("super admin can read without group membership", func(t *testing.T) {
		db, _ := newWorkManualMock(t)
		if _, err := NewService(db).OperationsCatalogue(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}); err != nil {
			t.Fatalf("super admin was denied catalogue access: %v", err)
		}
	})
}

func TestApplicationFormPreservesOriginalWordFile(t *testing.T) {
	db, _ := newWorkManualMock(t)
	file, err := NewService(db).ApplicationForm(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin})
	if err != nil {
		t.Fatalf("read application form: %v", err)
	}
	if file.FileName != "校园网之窗申请表.doc" || file.ContentType != "application/msword" {
		t.Fatalf("download metadata = %#v", file)
	}
	if got := sha256.Sum256(file.Content); got != [32]byte{0x8b, 0x2e, 0x05, 0x9d, 0xe1, 0x7a, 0xa9, 0x8b, 0xca, 0x75, 0x31, 0x63, 0x3e, 0x90, 0xc5, 0x3d, 0x3d, 0x8c, 0x74, 0x02, 0x74, 0x41, 0x72, 0x1a, 0xb7, 0x73, 0xe4, 0x96, 0x8d, 0xbe, 0x4d, 0x79} {
		t.Fatalf("downloaded template hash = %x, original source file changed", got)
	}
}
