package auth

import (
	"testing"

	"tarsgo-backend/model"
)

func TestValidateIdentityConsistencyUsesSystemRole(t *testing.T) {
	t.Parallel()

	groupID := uint64(7)
	for _, user := range []*model.User{
		{Role: model.Role{Name: model.RoleNameUser}, AdminScope: model.AdminScopeGlobal, ManagementGroupID: &groupID},
		{Role: model.Role{Name: model.RoleNameAdmin}, AdminScope: model.AdminScopeGroup, ManagementGroupID: &groupID},
		{Role: model.Role{Name: model.RoleNameSuperAdmin}, AdminScope: model.AdminScopeGlobal},
	} {
		if err := validateIdentityConsistency(user); err != nil {
			t.Fatalf("valid system role should not be rejected by legacy scope metadata: %v", err)
		}
	}

	if err := validateIdentityConsistency(&model.User{Role: model.Role{Name: "legacy_admin"}}); err == nil {
		t.Fatal("unknown system role should be rejected")
	}
}

func TestSessionCapabilitiesIgnoreLegacyAdminScopeForCoreAccess(t *testing.T) {
	t.Parallel()

	groupID := uint64(7)
	activeGroup := model.UserGroup{ID: groupID, Status: model.UserGroupStatusActive}
	admins := []*model.User{
		{
			ID:         1,
			Role:       model.Role{Name: model.RoleNameAdmin},
			AdminScope: model.AdminScopeGlobal,
		},
		{
			ID:                2,
			Role:              model.Role{Name: model.RoleNameAdmin},
			AdminScope:        model.AdminScopeGroup,
			ManagementGroupID: &groupID,
			GroupMembers: []model.UserGroupMember{{
				GroupID: groupID,
				Role:    model.UserGroupMemberRoleLeader,
				Group:   activeGroup,
			}},
		},
	}
	for _, admin := range admins {
		session := toSessionUser(admin)
		if !session.Capabilities.CanReviewRegistrations {
			t.Fatalf("admin %d should have core admin capabilities regardless of legacy scope: %#v", admin.ID, session.Capabilities)
		}
		if session.Capabilities.CanManageSystemConfig || session.Capabilities.CanManageRoles || session.Capabilities.CanManageUserGroups {
			t.Fatalf("admin %d must not gain super-admin capabilities: %#v", admin.ID, session.Capabilities)
		}
	}

	member := &model.User{
		ID:         3,
		Role:       model.Role{Name: model.RoleNameUser},
		AdminScope: model.AdminScopeNone,
		GroupMembers: []model.UserGroupMember{{
			GroupID: groupID,
			Role:    model.UserGroupMemberRoleLeader,
			Group:   activeGroup,
		}},
	}
	memberSession := toSessionUser(member)
	if memberSession.Capabilities.CanReviewRegistrations {
		t.Fatalf("group leadership must not grant member core admin capabilities: %#v", memberSession.Capabilities)
	}

	superAdmin := toSessionUser(&model.User{ID: 4, Role: model.Role{Name: model.RoleNameSuperAdmin}, AdminScope: model.AdminScopeGlobal})
	if !superAdmin.Capabilities.CanManageSystemConfig || !superAdmin.Capabilities.CanManageRoles || !superAdmin.Capabilities.CanManageUserGroups {
		t.Fatalf("super admin should retain system-level capabilities: %#v", superAdmin.Capabilities)
	}
}

func TestNormalizeRegisterEmailInput(t *testing.T) {
	t.Parallel()

	normalized, err := normalizeRegisterEmailInput(RegisterEmailInput{
		Email:    " User@Example.com ",
		Password: " 123456 ",
		RealName: " 张三 ",
		Phone:    " 13800138000 ",
		Code:     " 123456 ",
	})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if normalized.Email != "user@example.com" {
		t.Fatalf("expected normalized email, got %q", normalized.Email)
	}
	if normalized.Password != "123456" {
		t.Fatalf("expected trimmed password, got %q", normalized.Password)
	}
	if normalized.RealName != "张三" {
		t.Fatalf("expected trimmed realName, got %q", normalized.RealName)
	}
	if normalized.Phone != "13800138000" {
		t.Fatalf("expected trimmed phone, got %q", normalized.Phone)
	}
	if normalized.Code != "123456" {
		t.Fatalf("expected trimmed code, got %q", normalized.Code)
	}
}

func TestNormalizeRegisterEmailInputRequiresRealNameAndPhone(t *testing.T) {
	t.Parallel()

	_, err := normalizeRegisterEmailInput(RegisterEmailInput{
		Email:    "user@example.com",
		Password: "123456",
		RealName: "   ",
		Phone:    "   ",
		Code:     "123456",
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	serviceErr, ok := err.(*ServiceError)
	if !ok {
		t.Fatalf("expected ServiceError, got %T", err)
	}
	if serviceErr.Status != 400 {
		t.Fatalf("expected status 400, got %d", serviceErr.Status)
	}
	if serviceErr.Message != "真实姓名和手机号不能为空" {
		t.Fatalf("unexpected message: %q", serviceErr.Message)
	}
}

func TestNormalizeRegisterEmailInputRequiresChineseRealName(t *testing.T) {
	t.Parallel()

	_, err := normalizeRegisterEmailInput(RegisterEmailInput{
		Email:    "user@example.com",
		Password: "123456",
		RealName: "张三A",
		Phone:    "13800138000",
		Code:     "123456",
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	serviceErr, ok := err.(*ServiceError)
	if !ok {
		t.Fatalf("expected ServiceError, got %T", err)
	}
	if serviceErr.Status != 400 {
		t.Fatalf("expected status 400, got %d", serviceErr.Status)
	}
	if serviceErr.Message != "真实姓名需为汉字" {
		t.Fatalf("unexpected message: %q", serviceErr.Message)
	}
}
