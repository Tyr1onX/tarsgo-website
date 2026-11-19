package usergroup

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestListGroupsExcludesRetiredDefaultGroup(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = sqlDB.Close()
	})

	mock.ExpectQuery("SELECT .* FROM `user_groups` WHERE is_default = 0").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "is_default", "status", "show"}).
			AddRow(2, "机械组", 0, 1, 1))

	groups, err := NewRepository(db).ListGroups(context.Background(), ListGroupsInput{})
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].Name != "机械组" {
		t.Fatalf("expected only real groups, got %#v", groups)
	}
}
