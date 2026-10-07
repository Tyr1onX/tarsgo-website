package systemconfig

import (
	"context"
	"encoding/json"
	"strings"
	"tarsgo-backend/config"
	"tarsgo-backend/service/email"
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
