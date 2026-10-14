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

func TestNormalizeRegisterEmailInputRejectsInvalidPhone(t *testing.T) {
	t.Parallel()

	for _, phone := range []string{
		"123",
		"abcdefghijk",
		"12345678901",
		"1380013800a",
		"138001380001",
		"12800138000",
	} {
		t.Run(phone, func(t *testing.T) {
			t.Parallel()
			_, err := normalizeRegisterEmailInput(RegisterEmailInput{
				Email: "user@example.com", Password: "123456",
				RealName: "张三", Phone: phone, Code: "123456",
			})
			if err == nil {
				t.Fatalf("invalid phone %q was accepted", phone)
			}
			serviceErr, ok := err.(*ServiceError)
			if !ok || serviceErr.Status != 400 || serviceErr.Message != "请输入正确的 11 位手机号" {
				t.Fatalf("unexpected error for phone %q: %v", phone, err)
			}
		})
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


// Registration profile fields are contact hints, not verified identity keys.
func TestNormalizeRegisterInputAllowsSharedNameAndPhoneAcrossEmails(t *testing.T) {
	t.Parallel()

	for _, email := range []string{"first@example.com", "second@example.com"} {
		_, err := normalizeRegisterEmailInput(RegisterEmailInput{
			Email: email, Password: "123456", RealName: "张三",
			Phone: "13800138000", Code: "123456",
		})
		if err != nil {
			t.Fatalf("valid contact details must not be treated as unique identity keys for %s: %v", email, err)
		}
	}
}
