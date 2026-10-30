package model

import (
	"encoding/json"
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

func TestUserPreferredNameUsesRealNameThenNickname(t *testing.T) {
	tests := []struct {
		name     string
		user     User
		wantName string
	}{
		{name: "real name wins", user: User{RealName: stringPointer("姓名"), Nickname: stringPointer("昵称")}, wantName: "姓名"},
		{name: "nickname fills empty real name", user: User{RealName: stringPointer("  "), Nickname: stringPointer(" 昵称 ")}, wantName: "昵称"},
		{name: "blank values stay blank", user: User{RealName: stringPointer(" "), Nickname: stringPointer("\t")}, wantName: ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := test.user.PreferredName(); got != test.wantName {
				t.Fatalf("PreferredName() = %q, want %q", got, test.wantName)
			}
		})
	}
}

func stringPointer(value string) *string { return &value }
