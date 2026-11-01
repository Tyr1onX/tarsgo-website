package model

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestLegacyAdministratorScopeFieldsAreNotSerialized(t *testing.T) {
	groupID := uint64(42)
	data, err := json.Marshal(User{
		RoleID:            2,
		AdminScope:        AdminScopeGroup,
		ManagementGroupID: &groupID,
		Role:              Role{Name: RoleNameAdmin, DisplayName: "普通管理员"},
	})
	if err != nil {
		t.Fatalf("marshal user: %v", err)
	}
	serialized := string(data)
	for _, legacyField := range []string{"adminScope", "managementGroupId", "admin_scope", "management_group_id"} {
		if strings.Contains(serialized, legacyField) {
			t.Fatalf("legacy authorization field %q leaked into user JSON: %s", legacyField, serialized)
		}
	}
	if !strings.Contains(serialized, `"role"`) || !strings.Contains(serialized, `"name":"admin"`) {
		t.Fatalf("serialized user is missing its canonical system role: %s", serialized)
	}
}

func TestUserIdentityHasOnlyTheRealNameField(t *testing.T) {
	typeOfUser := reflect.TypeOf(User{})
	if _, exists := typeOfUser.FieldByName("Nickname"); exists {
		t.Fatal("user model must not expose a nickname field")
	}
	legacyName, exists := typeOfUser.FieldByName("Name")
	if !exists || legacyName.Tag.Get("json") != "-" {
		t.Fatal("legacy name storage must remain hidden from the account API")
	}
	realName, exists := typeOfUser.FieldByName("RealName")
	if !exists || !strings.Contains(realName.Tag.Get("gorm"), "column:real_name") {
		t.Fatal("real_name must be the only canonical person name field")
	}
}

func stringPointer(value string) *string { return &value }
