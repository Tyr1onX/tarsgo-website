package systemconfig

import (
	"context"
	"encoding/json"
	"strings"
	"tarsgo-backend/config"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
	"testing"
)

func TestEmailStatusNeverExposesCredentials(t *testing.T) {
	service := NewService(config.EmailConfig{APIKey: "private-api-key", From: "吉甲大师 <noreply@jijiamaster.com>"})
	result, err := service.GetEmailConfig(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(result)
	if !result.Configured || strings.Contains(string(encoded), "private-api-key") {
		t.Fatal("unsafe email status")
	}
}

type fakeTemplateStore map[string]string

func (s fakeTemplateStore) Get(_ context.Context, key string) (string, error) { return s[key], nil }
func (s fakeTemplateStore) Set(_ context.Context, key, value string) error {
	s[key] = value
	return nil
}

func TestEmailTemplatesAreSavedAndValidated(t *testing.T) {
	store := fakeTemplateStore{}
	service := NewServiceWithTemplateStore(config.EmailConfig{}, store)
	input := emailtemplate.Default()
	input.InterviewRejected.Subject = "{{name}} 的面试结果"
	input.InterviewRejected.Body = "项目：{{project}}，组别：{{group}}，日期：{{date}}"
	result, err := service.SaveEmailNotificationTemplates(context.Background(), input)
	if err != nil {
		t.Fatalf("save valid notification templates: %v", err)
	}
	if result.NotificationTemplates != input || len(result.AvailableVariables) != 4 {
		t.Fatalf("saved templates and allowed variables were not returned: %#v", result)
	}
	if len(store) != 1 || store[emailtemplate.ConfigKey] == "" {
		t.Fatalf("templates were not persisted as a single system configuration: %#v", store)
	}

	input.InterviewRejected.Body += " {{recipient}}"
	if _, err := service.SaveEmailNotificationTemplates(context.Background(), input); err == nil {
		t.Fatal("unsupported variables must not be saved")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != 400 {
		t.Fatalf("unsupported variable error = %#v, want HTTP 400", err)
	}
	loaded, err := emailtemplate.Load(context.Background(), store)
	if err != nil || loaded.InterviewRejected.Body == input.InterviewRejected.Body {
		t.Fatalf("invalid template overwrote the saved configuration: %#v err=%v", loaded, err)
	}
}

func TestVerificationEmailUsesConfiguredSender(t *testing.T) {
	service := NewService(config.EmailConfig{})
	mailer := &fakeMail{}
	service.mailer = mailer
	if err := service.TestVerificationCodeConfig(context.Background(), TestVerificationCodeInput{To: "receiver@example.com"}); err != nil {
		t.Fatal(err)
	}
	if mailer.message.To != "receiver@example.com" || !strings.Contains(mailer.message.Text, "10 分钟内有效") {
		t.Fatal("verification email content missing")
	}
}

func TestRegisterFlowUsesActualRegistrationPath(t *testing.T) {
	tester := &fakeRegisterCodeTester{}
	service := NewService(config.EmailConfig{}, tester)
	if err := service.SendRegisterFlowCode(context.Background(), SendRegisterFlowCodeInput{Email: "receiver@example.com"}); err != nil {
		t.Fatal(err)
	}
	if tester.sendEmail != "receiver@example.com" {
		t.Fatal("registration sender not called")
	}
	if err := service.VerifyRegisterFlowCode(context.Background(), VerifyRegisterFlowCodeInput{Email: "receiver@example.com", Code: "123456"}); err != nil {
		t.Fatal(err)
	}
	if tester.verifyCode != "123456" || tester.verifyEmail != "receiver@example.com" {
		t.Fatal("registration verifier not called")
	}
}

type fakeMail struct {
	message email.Message
	err     error
}

func (m *fakeMail) SendEmail(_ context.Context, message email.Message) error {
	m.message = message
	return m.err
}

type fakeRegisterCodeTester struct {
	sendEmail   string
	verifyEmail string
	verifyCode  string
}

func (t *fakeRegisterCodeTester) SendRegisterCode(_ context.Context, address string) error {
	t.sendEmail = address
	return nil
}
func (t *fakeRegisterCodeTester) VerifyRegisterCode(_ context.Context, address, code string) error {
	t.verifyEmail = address
	t.verifyCode = code
	return nil
}
