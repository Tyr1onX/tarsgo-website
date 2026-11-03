package handler

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/historyarchive"
	"testing"
)

func TestHistoryArchiveDeniesUnauthenticatedAndNonSuperAdmins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, role := range []string{"", "user", "admin"} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/api/admin/history-archive", nil)
		want := 403
		if role != "" {
			c.Set("sessionUser", &auth.SessionUser{ID: 1, Role: auth.SessionRole{Name: role}})
		} else {
			want = 401
		}
		NewHistoryArchiveHandler(historyarchive.NewService(nil)).List(c)
		if w.Code != want || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("role %q code %d", role, w.Code)
		}
	}
}
