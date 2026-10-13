package emailtemplate

import (
	"context"
	"strings"
	"testing"
)

type memoryStore map[string]string

func (s memoryStore) Get(_ context.Context, key string) (string, error) { return s[key], nil }
func (s memoryStore) Set(_ context.Context, key, value string) error {
	s[key] = value
	return nil
}

func TestValidateAllowsOnlyPredefinedVariables(t *testing.T) {
	templates := Default()
	if err := Validate(templates); err != nil {
		t.Fatalf("default templates must be valid: %v", err)
	}
	templates.ScreeningRejected.Body += " {{recipient}}"
	if err := Validate(templates); err == nil || !strings.Contains(err.Error(), "未支持的变量") {
		t.Fatalf("unknown placeholder should be rejected, got %v", err)
	}

	templates = Default()
	templates.InterviewAdmitted.Subject = "{{name"
	if err := Validate(templates); err == nil {
		t.Fatal("unclosed placeholder should be rejected")
	}
	templates = Default()
	templates.InterviewAdmitted.Subject = "{{ name }}"
	if err := Validate(templates); err == nil {
		t.Fatal("whitespace variants of a placeholder should be rejected")
	}
}

func TestSaveAndLoadNotificationTemplates(t *testing.T) {
	store := memoryStore{}
	templates := Default()
	templates.ScreeningRejected.Subject = "{{name}} 的初筛结果"
	templates.ScreeningRejected.Body = "报名项目：{{project}}；组别：{{group}}；日期：{{date}}"
	if err := Save(context.Background(), store, templates); err != nil {
		t.Fatalf("save valid templates: %v", err)
	}
	if len(store) != 1 || store[ConfigKey] == "" {
		t.Fatalf("expected one system-config value at %q, got %#v", ConfigKey, store)
	}
	loaded, err := Load(context.Background(), store)
	if err != nil {
		t.Fatalf("load saved templates: %v", err)
	}
	if loaded != templates {
		t.Fatalf("loaded templates differ from saved templates: %#v", loaded)
	}
}

func TestRenderUsesOnlySystemProvidedValues(t *testing.T) {
	template := Template{Subject: "{{name}} - {{group}}", Body: "{{project}} / {{date}}"}
	rendered := Render(template, map[string]string{
		"name":    "张三\r\n伪造主题",
		"group":   "机械组",
		"project": "2026 招新",
		"date":    "2026年10月13日",
	})
	if rendered.Subject != "张三  伪造主题 - 机械组" || rendered.Body != "2026 招新 / 2026年10月13日" {
		t.Fatalf("unexpected rendered template: %#v", rendered)
	}
}
