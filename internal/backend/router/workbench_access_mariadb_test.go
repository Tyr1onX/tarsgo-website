package router

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

func TestMariaDBWorkbenchBoundaryAndCommunityAPIs(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	db = db.Begin()
	if db.Error != nil {
		t.Fatal(db.Error)
	}
	defer db.Rollback()
	cfg := &config.Config{App: config.AppConfig{Env: "test", GinMode: "test"}, Auth: config.AuthConfig{JWTSecret: strings.Repeat("w", 32), CookieName: "workbench_test", TokenTTL: 72 * time.Hour}}
	engine := New(cfg, db)
	marker := time.Now().UnixNano()
	users := []model.User{}
	tokens := []string{}

	tests := []struct {
		name, identity, created, role string
		want                          bool
	}{
		{"old", model.TeamIdentityCommunityMember, "2026-11-03 18:09:59", model.RoleNameUser, true},
		{"boundary", model.TeamIdentityCommunityMember, "2026-11-03 18:10:00", model.RoleNameUser, false},
		{"new", model.TeamIdentityCommunityMember, "2026-11-03 18:10:01", model.RoleNameUser, false},
		{"trainee", model.TeamIdentityTraineeMember, "2026-11-03 18:10:01", model.RoleNameUser, true},
		{"formal", model.TeamIdentityFormalMember, "2026-11-03 18:10:01", model.RoleNameUser, true},
		{"reserve", model.TeamIdentityReserveMember, "2026-11-03 18:10:01", model.RoleNameUser, false},
		{"admin", model.TeamIdentityCommunityMember, "2026-11-03 18:10:01", model.RoleNameAdmin, true},
		{"super", model.TeamIdentityCommunityMember, "2026-11-03 18:10:01", model.RoleNameSuperAdmin, true},
	}
	for i, test := range tests {
		var role model.Role
		if err := db.Where("name = ?", test.role).First(&role).Error; err != nil {
			t.Fatal(err)
		}
		user := model.User{RoleID: role.ID, Email: fmt.Sprintf("workbench-%d-%d@tarsgo.test", marker, i), Status: 1, TeamIdentityStatus: test.identity}
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&user).UpdateColumn("created_at", test.created).Error; err != nil {
			t.Fatal(err)
		}
		users = append(users, user)
		token := fmt.Sprintf("synthetic-workbench-%d-%d", marker, i)
		tokens = append(tokens, token)
		digest := sha256.Sum256([]byte(token))
		if err := db.Create(&model.AuthSession{UserID: user.ID, TokenHash: hex.EncodeToString(digest[:]), ExpiresAt: time.Now().Add(72 * time.Hour)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	request := func(method, path string, body []byte, contentType string, actor int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, "http://workbench.test"+path, bytes.NewReader(body))
		req.Header.Set("Origin", "http://workbench.test")
		req.Header.Set("Content-Type", contentType)
		if actor >= 0 {
			req.AddCookie(&http.Cookie{Name: cfg.Auth.CookieName, Value: tokens[actor]})
		}
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		return w
	}
	expect := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("want %d got %d: %s", status, w.Code, w.Body.String())
		}
	}
	for i, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			w := request("GET", "/api/me", nil, "", i)
			expect(w, 200)
			var response struct {
				Data struct {
					User auth.SessionUser `json:"user"`
				} `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if response.Data.User.WorkbenchAccess != test.want {
				t.Fatalf("eligibility %t want %t: %s", response.Data.User.WorkbenchAccess, test.want, w.Body.String())
			}
			w = request("GET", "/api/my-timetables", nil, "", i)
			if test.want {
				expect(w, 200)
			} else {
				expect(w, 403)
			}
			// No group means no assignment authority even with internal entry access.
			if test.identity == model.TeamIdentityTraineeMember {
				expect(request("GET", "/api/assignments", nil, "", i), 403)
			}
		})
	}
	// Register an external-school-neutral account through the real API.
	email := fmt.Sprintf("workbench-register-%d@tarsgo.test", marker)
	code := model.EmailCode{Email: email, Purpose: model.EmailCodePurposeRegister, CodeHash: auth.HashVerificationCode(email, model.EmailCodePurposeRegister, "123456"), ExpiresAt: time.Now().Add(time.Hour), LastSentAt: time.Now()}
	if err := db.Create(&code).Error; err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"email": email, "password": "synthetic-user-only", "realName": "外校社区测试", "isStudent": false, "code": "123456"})
	expect(request("POST", "/api/register/email", payload, "application/json", -1), 200)
	var registered model.User
	if err := db.Where("email = ?", email).First(&registered).Error; err != nil {
		t.Fatal(err)
	}
	users = append(users, registered)
	if registered.TeamIdentityStatus != model.TeamIdentityCommunityMember {
		t.Fatal("registration identity is not community_member")
	}
	// Test clock is UTC wall-time before the production Shanghai cutoff; pin
	// its stored creation timestamp at the boundary before asserting access.
	if err := db.Model(&registered).UpdateColumn("created_at", model.WorkbenchLegacyCreatedBefore).Error; err != nil {
		t.Fatal(err)
	}
	login, _ := auth.NewService(cfg, db).LoginWithPassword(context.Background(), email, "synthetic-user-only")
	if login == nil || login.User.WorkbenchAccess {
		t.Fatal("new account gained workbench access")
	}
	// Enumerate every non-admin internal API, including file and document reads.
	for _, route := range engine.Routes() {
		p := route.Path
		internal := strings.HasPrefix(p, "/api/my-timetables") || strings.HasPrefix(p, "/api/team/") || strings.HasPrefix(p, "/api/weekly-reports") || strings.HasPrefix(p, "/api/work-manual/") || strings.HasPrefix(p, "/api/assignments") || strings.HasPrefix(p, "/api/assignment-files/") || strings.HasPrefix(p, "/api/assignment-materials/") || strings.HasPrefix(p, "/api/school-leave/") || strings.HasPrefix(p, "/api/daily-leave/") || strings.HasPrefix(p, "/api/camp-leave/") || strings.HasPrefix(p, "/api/leave/access") || (p == "/api/user-group/confirmation" && route.Method != "GET") || (p == "/api/daily-signals" && route.Method != "GET") || p == "/api/daily-signals/today/mood"
		if !internal || strings.Contains(p, "/public") {
			continue
		}
		path := strings.NewReplacer(":id", "1", ":fileId", "1").Replace(p)
		expect(request(route.Method, path, []byte(`{}`), "application/json", 2), 403)
	}
	expect(request("GET", "/api/admin/users", nil, "", 6), 403)
	// Read access stays unchanged; mutating routes reject requests without a trusted Origin.
	for _, item := range []struct {
		method, path string
		actor, want  int
	}{
		{"GET", "/api/admin/users", 7, 200},
		{"GET", "/api/community/posts", 2, 200},
		{"POST", "/api/admin/users", 7, 403},
		{"POST", "/api/admin/registrations/1/interview", 6, 403},
		{"PATCH", "/api/recruitment/registrations/1", 2, 403},
		{"POST", "/api/community/posts", 2, 403},
	} {
		req := httptest.NewRequest(item.method, "http://workbench.test"+item.path, bytes.NewReader([]byte(`{}`)))
		req.AddCookie(&http.Cookie{Name: cfg.Auth.CookieName, Value: tokens[item.actor]})
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != item.want || (item.want == http.StatusForbidden && !strings.Contains(w.Body.String(), "请求来源校验失败")) {
			t.Fatalf("%s %s without Origin: status=%d body=%s", item.method, item.path, w.Code, w.Body.String())
		}
	}
	expect(request("GET", "/api/admin/users", nil, "", 7), 200)
	expect(request("GET", "/api/community/posts", nil, "", 2), 200)
	expect(request("GET", fmt.Sprintf("/api/community/members/%d", users[0].ID), nil, "", 2), 200)
	expect(request("GET", "/api/leave/profile", nil, "", 2), 200)
	expect(request("GET", "/api/recruitment/form", nil, "", 2), 200)
	expect(request("GET", "/api/ai-salon/registrations", nil, "", 2), 200)
	t.Run("admission refreshes existing session without login", func(t *testing.T) {
		var form model.RegistrationForm
		if err := db.Where("status = ?", model.RegistrationFormStatusPublished).First(&form).Error; err != nil {
			t.Fatal(err)
		}
		var group model.UserGroup
		if err := db.Where("status = ?", model.UserGroupStatusActive).First(&group).Error; err != nil {
			t.Fatal(err)
		}
		reg := model.Registration{FormID: form.ID, UserID: users[2].ID, PreferredGroupID: &group.ID, FormData: map[string]any{}, RecruitmentStatus: model.RecruitmentStatusPendingInterview}
		if err := db.Create(&reg).Error; err != nil {
			t.Fatal(err)
		}

		endpoint := fmt.Sprintf("/api/admin/registrations/%d/interview", reg.ID)
		expect(request("POST", endpoint, []byte(`{"decision":"admit"}`), "application/json", 6), 200)
		expect(request("GET", "/api/my-timetables", nil, "", 2), 200)
		w := request("GET", "/api/me", nil, "", 2)
		if !strings.Contains(w.Body.String(), `"workbenchAccess":true`) || !strings.Contains(w.Body.String(), `"teamIdentityStatus":"trainee_member"`) {
			t.Fatal("existing session did not refresh after admission", w.Body.String())
		}
		expect(request("PUT", endpoint, []byte(`{"decision":"reject","correctionReason":"验收纠错"}`), "application/json", 6), 200)
		expect(request("GET", "/api/my-timetables", nil, "", 2), 403)
	})

	// Public post/comment/like/bookmark workflows remain usable by new accounts.
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.WriteField("category", "technology")
	writer.WriteField("title", "[TEST] open community")
	writer.WriteField("body", "合成社区发帖验收")
	writer.Close()
	w := request("POST", "/api/community/posts", body.Bytes(), writer.FormDataContentType(), 2)
	expect(w, 201)
	var post struct {
		Data struct {
			Post struct {
				ID uint64 `json:"id"`
			} `json:"post"`
		} `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &post)
	path := fmt.Sprintf("/api/community/posts/%d", post.Data.Post.ID)
	var comment bytes.Buffer
	commentWriter := multipart.NewWriter(&comment)
	commentWriter.WriteField("body", "合成回复")
	commentWriter.Close()
	expect(request("POST", path+"/comments", comment.Bytes(), commentWriter.FormDataContentType(), 1), 201)
	expect(request("PUT", path+"/like", nil, "", 1), 200)
	expect(request("PUT", path+"/bookmark", nil, "", 1), 200)
	// A historical private group question stays private even for another member.
	var group model.UserGroup
	if err := db.Where("name = ?", "机械组").First(&group).Error; err != nil {
		group = model.UserGroup{Name: "机械组", Status: 1, Show: 1}
		if err := db.Create(&group).Error; err != nil {
			t.Fatal(err)
		}
	}
	private := model.TrainingQuestion{GroupID: &group.ID, AskerID: users[0].ID, Title: "[TEST] private", Body: "private", Visibility: model.TrainingQuestionPrivate, Category: model.CommunityCategoryTechnology}
	if err := db.Create(&private).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.UserGroupMember{UserID: users[2].ID, GroupID: group.ID}).Error; err != nil {
		t.Fatal(err)
	}
	expect(request("GET", fmt.Sprintf("/api/community/posts/%d", private.ID), nil, "", 2), 404)
	expect(request("GET", fmt.Sprintf("/api/community/posts/%d", private.ID), nil, "", 0), 200)
}
