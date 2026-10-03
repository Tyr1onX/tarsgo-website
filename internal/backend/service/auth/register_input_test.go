package auth

import (
	"testing"

	"tarsgo-backend/model"
)

func TestValidateIdentityConsistencyForOrdinaryUser(t *testing.T) {
	t.Parallel()

	valid := &model.User{
		Role:       model.Role{Name: model.RoleNameUser},
		AdminScope: model.AdminScopeNone,
	}
	if err := validateIdentityConsistency(valid); err != nil {
		t.Fatalf("ordinary user with no admin scope should be valid: %v", err)
	}

	invalid := *valid
	invalid.AdminScope = model.AdminScopeGlobal
	if err := validateIdentityConsistency(&invalid); err == nil {
		t.Fatal("ordinary user with global admin scope should be rejected")
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
