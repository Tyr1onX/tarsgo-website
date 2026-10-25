package adminuser

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func TestMariaDBSpecificGroupFilterIntegration(t *testing.T) {
	dsn := os.Getenv("TARSGO_INTEGRATION_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set TARSGO_INTEGRATION_MYSQL_DSN to run the isolated MariaDB integration test")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("connect to isolated MariaDB: %v", err)
	}

	now := time.Now().UTC().Truncate(time.Second)
	marker := fmt.Sprintf("[TEST_GROUP_FILTER_%d]", now.UnixNano())
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin isolated test transaction: %v", tx.Error)
	}
	t.Cleanup(func() { _ = tx.Rollback().Error })

	var role model.Role
	if err := tx.Where("name = ?", model.RoleNameUser).First(&role).Error; err != nil {
		t.Fatalf("load ordinary-user role: %v", err)
	}
	activeA := model.UserGroup{Name: marker + " active-a", Status: model.UserGroupStatusActive}
	activeB := model.UserGroup{Name: marker + " active-b", Status: model.UserGroupStatusActive}
	disabled := model.UserGroup{Name: marker + " disabled", Status: model.UserGroupStatusDisabled}
	for _, group := range []*model.UserGroup{&activeA, &activeB, &disabled} {
		if err := tx.Create(group).Error; err != nil {
			t.Fatalf("create isolated group: %v", err)
		}
	}
	makeUser := func(suffix string) model.User {
		return model.User{RoleID: role.ID, Name: marker + suffix, Email: fmt.Sprintf("%s-%s@tarsgo.test", marker, suffix), Status: model.UserStatusEnabled, LastLoginAt: &now}
	}
	multi := makeUser("multi")
	single := makeUser("single")
	oldGroup := makeUser("disabled-relation")
	unrelated := makeUser("unrelated")
	for _, user := range []*model.User{&multi, &single, &oldGroup, &unrelated} {
		if err := tx.Create(user).Error; err != nil {
			t.Fatalf("create isolated member: %v", err)
		}
	}
	memberships := []model.UserGroupMember{
		{GroupID: activeA.ID, UserID: multi.ID}, {GroupID: activeB.ID, UserID: multi.ID},
		{GroupID: activeA.ID, UserID: single.ID}, {GroupID: disabled.ID, UserID: oldGroup.ID},
	}
	if err := tx.Create(&memberships).Error; err != nil {
		t.Fatalf("create isolated group relationships: %v", err)
	}

	repo := &GormRepository{db: tx}
	users, total, err := repo.ListUsers(context.Background(), ListUsersInput{Page: 1, PageSize: 1, GroupID: activeA.ID, IncludeInactive: true})
	if err != nil {
		t.Fatalf("filter active group: %v", err)
	}
	if total != 2 || len(users) != 1 {
		t.Fatalf("active group total/page = %d/%d, want distinct total 2 and page size 1", total, len(users))
	}
	users, total, err = repo.ListUsers(context.Background(), ListUsersInput{Page: 1, PageSize: 20, GroupID: disabled.ID, IncludeInactive: true})
	if err != nil {
		t.Fatalf("filter disabled historical group: %v", err)
	}
	if total != 1 || len(users) != 1 || users[0].ID != oldGroup.ID {
		t.Fatalf("disabled historical group result = total %d, users %#v", total, users)
	}
}
