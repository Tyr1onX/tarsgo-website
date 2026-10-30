package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/workmanual"
)

type workManualServiceStub struct {
	catalogueFn func(context.Context, workmanual.Actor) ([]byte, error)
	formFn      func(context.Context, workmanual.Actor) (*workmanual.Download, error)
}

func (s workManualServiceStub) OperationsCatalogue(ctx context.Context, actor workmanual.Actor) ([]byte, error) {
	return s.catalogueFn(ctx, actor)
}

func (s workManualServiceStub) ApplicationForm(ctx context.Context, actor workmanual.Actor) (*workmanual.Download, error) {
	return s.formFn(ctx, actor)
}

func TestWorkManualCatalogueUsesAuthenticatedOperationsActor(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	handler := NewWorkManualHandler(workManualServiceStub{
		catalogueFn: func(_ context.Context, actor workmanual.Actor) ([]byte, error) {
			called = true
			if actor.ID != 42 || actor.RoleName != "admin" {
				t.Fatalf("unexpected actor: %#v", actor)
			}
			return []byte(`{"documents":[{"title":"校园网之窗宣传申请"}]}`), nil
		},
	})
	router := gin.New()
	router.GET("/api/work-manual/operations", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "admin"}})
	}, handler.OperationsCatalogue)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/work-manual/operations", nil))

	if response.Code != http.StatusOK || !called {
		t.Fatalf("status=%d called=%v body=%s", response.Code, called, response.Body.String())
	}
	var payload struct {
		Code int             `json:"code"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Code != http.StatusOK || !strings.Contains(string(payload.Data), "校园网之窗宣传申请") {
		t.Fatalf("unexpected response envelope: %s", response.Body.String())
	}
}

func TestWorkManualTemplateResponseIsAttachment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewWorkManualHandler(workManualServiceStub{
		formFn: func(_ context.Context, actor workmanual.Actor) (*workmanual.Download, error) {
			if actor.ID != 42 || actor.RoleName != "user" {
				t.Fatalf("unexpected actor: %#v", actor)
			}
			return &workmanual.Download{FileName: "校园网之窗申请表.doc", ContentType: "application/msword", Content: []byte("original word file")}, nil
		},
	})
	router := gin.New()
	router.GET("/api/work-manual/template", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "user"}})
	}, handler.ApplicationForm)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/work-manual/template", nil))

	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/msword" || !strings.HasPrefix(response.Header().Get("Content-Disposition"), "attachment;") {
		t.Fatalf("unexpected template response headers/status: %d %#v", response.Code, response.Header())
	}
	if !strings.Contains(response.Header().Get("Content-Disposition"), "filename") || response.Body.String() != "original word file" {
		t.Fatalf("template filename/body were not preserved: header=%q body=%q", response.Header().Get("Content-Disposition"), response.Body.String())
	}
}
