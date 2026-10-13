package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/config"
	"tarsgo-backend/service/systemconfig"
)

type emailTemplateMemoryStore map[string]string

func (s emailTemplateMemoryStore) Get(_ context.Context, key string) (string, error) {
	return s[key], nil
}
func (s emailTemplateMemoryStore) Set(_ context.Context, key, value string) error {
	s[key] = value
	return nil
}

func TestEmailTemplateEndpointOnlyAcceptsThreeNotificationTemplates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := emailTemplateMemoryStore{}
	service := systemconfig.NewServiceWithTemplateStore(config.EmailConfig{}, store)
	handler := NewSystemConfigHandler(service, service)
	router := gin.New()
	router.PUT("/email/templates", handler.SaveEmailNotificationTemplates)

	request := httptest.NewRequest(http.MethodPut, "/email/templates", strings.NewReader(`{"templates":{"screeningRejected":{"subject":"A","body":"B"},"interviewAdmitted":{"subject":"A","body":"B"},"interviewRejected":{"subject":"A","body":"B"},"verificationCode":{"subject":"A","body":"B"}}}`))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || len(store) != 0 {
		t.Fatalf("verification template edit was not rejected: status=%d stored=%#v", response.Code, store)
	}

	request = httptest.NewRequest(http.MethodPut, "/email/templates", strings.NewReader(`{"templates":{"screeningRejected":{"subject":"{{name}}","body":"{{project}}"},"interviewAdmitted":{"subject":"{{name}}","body":"{{group}}"},"interviewRejected":{"subject":"{{name}}","body":"{{date}}"}}}`))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || len(store) != 1 {
		t.Fatalf("valid notification templates were not accepted: status=%d response=%q", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodPut, "/email/templates", strings.NewReader(`{"templates":{"screeningRejected":{"subject":"{{recipient}}","body":"B"},"interviewAdmitted":{"subject":"A","body":"B"},"interviewRejected":{"subject":"A","body":"B"}}}`))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unsupported template variable was not rejected: status=%d", response.Code)
	}
}
