package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
	"tarsgo-backend/service/auth"
)

func TestAcceptanceDatabaseWebsiteReviewSyncsFeishu(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to write outside the isolated acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("open isolated acceptance database")
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { _ = sqlDB.Close() })
	// Roll back only this test's synthetic fixtures, including nested review
	// transactions. No production database or existing records are modified.
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	t.Cleanup(func() { _ = tx.Rollback().Error })
	var adminRole, memberRole model.Role
	var group model.UserGroup
	for _, query := range []*gorm.DB{
		tx.Where("name = ?", model.RoleNameAdmin).First(&adminRole),
		tx.Where("name = ?", model.RoleNameUser).First(&memberRole),
	} {
		if query.Error != nil {
			t.Fatal(query.Error)
		}
	}
	if err := tx.Where("name = ?", "机械组").First(&group).Error; err == gorm.ErrRecordNotFound {
		group = model.UserGroup{Name: "机械组", Status: model.UserGroupStatusActive}
		if err := tx.Create(&group).Error; err != nil {
			t.Fatal(err)
		}
	} else if err != nil || group.Status != model.UserGroupStatusActive {
		t.Fatalf("isolated technical group unavailable: %v", err)
	}
	nonce := time.Now().UnixNano()
	admin := model.User{RoleID: adminRole.ID, Email: fmt.Sprintf("review-admin-%d@tarsgo.test", nonce), Status: model.UserStatusEnabled}
	member := model.User{RoleID: memberRole.ID, Email: fmt.Sprintf("review-member-%d@tarsgo.test", nonce), Status: model.UserStatusEnabled}
	for _, user := range []*model.User{&admin, &member} {
		if err := tx.Create(user).Error; err != nil {
			t.Fatal(err)
		}
		if err := tx.Create(&model.UserGroupMember{GroupID: group.ID, UserID: user.ID, Role: model.UserGroupMemberRoleMember}).Error; err != nil {
			t.Fatal(err)
		}
	}
	item := model.Assignment{GroupID: group.ID, CreatorID: admin.ID, Title: "[TEST] website review sync", DueAt: time.Now().UTC().Add(time.Hour), PublicationStatus: model.AssignmentPublicationPublished}
	if err := tx.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Create(&model.AssignmentTarget{AssignmentID: item.ID, UserID: member.ID}).Error; err != nil {
		t.Fatal(err)
	}
	submission := model.AssignmentSubmission{AssignmentID: item.ID, UserID: member.ID, Attempt: 1, SubmittedAt: time.Now().UTC()}
	if err := tx.Create(&submission).Error; err != nil {
		t.Fatal(err)
	}
	original := model.AssignmentReview{SubmissionID: submission.ID, ReviewerID: admin.ID, Score: 90, Decision: model.AssignmentReviewPassed, Comment: "original review"}
	if err := tx.Create(&original).Error; err != nil {
		t.Fatal(err)
	}
	service, err := assignment.NewServiceWithFileRoot(tx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	feishu := testFeishuHandler()
	feishu.cfg.BitableAppToken, feishu.cfg.BitableTableID = "test_base", "test_table"
	updates := make(chan map[string]any, 2)
	var calls atomic.Int32
	feishu.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		calls.Add(1)
		switch {
		case req.URL.Path == "/open-apis/auth/v3/tenant_access_token/internal":
			return testFeishuHTTPResponse(`{"code":0,"tenant_access_token":"synthetic-token"}`), nil
		case req.Method == http.MethodGet && strings.HasSuffix(req.URL.Path, "/records"):
			return testFeishuHTTPResponse(`{"code":0,"data":{"items":[{"record_id":"rec_existing","fields":{}}],"has_more":false}}`), nil
		case req.Method == http.MethodPut && strings.HasSuffix(req.URL.Path, "/records/rec_existing"):
			var payload struct {
				Fields map[string]any `json:"fields"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				return nil, err
			}
			updates <- payload.Fields
			return testFeishuHTTPResponse(`{"code":0,"data":{}}`), nil
		default:
			return nil, fmt.Errorf("unexpected Feishu request: %s %s", req.Method, req.URL.Path)
		}
	})}
	handler := NewAssignmentHandler(service, feishu)
	review := func(userID uint64, roleName, decision, comment string, score uint8) *httptest.ResponseRecorder {
		payload, _ := json.Marshal(map[string]any{"score": score, "decision": decision, "comment": comment})
		response := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(response)
		c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/assignments/submissions/1/reviews", bytes.NewReader(payload))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(submission.ID)}}
		c.Set("sessionUser", &auth.SessionUser{ID: userID, Role: auth.SessionRole{Name: roleName}})
		handler.Review(c)
		return response
	}
	for _, test := range []struct {
		decision, status, comment string
		score                     uint8
	}{
		{model.AssignmentReviewNeedsRedo, "需返修", "please revise", 75},
		{model.AssignmentReviewPassed, "通过", "revision accepted", 95},
	} {
		response := review(admin.ID, model.RoleNameAdmin, test.decision, test.comment, test.score)
		if response.Code != http.StatusOK {
			t.Fatalf("website review status=%d: %s", response.Code, response.Body.String())
		}
		select {
		case fields := <-updates:
			if fields[bitableFieldSubmissionID] != fmt.Sprint(submission.ID) || fields[bitableFieldStatus] != test.status || fields[bitableFieldScore] != float64(test.score) || fields[bitableFieldComment] != test.comment {
				t.Fatalf("website review was not synced correctly: %#v", fields)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("successful website review did not sync Feishu")
		}
	}
	before := calls.Load()
	if response := review(member.ID, model.RoleNameUser, model.AssignmentReviewPassed, "not allowed", 100); response.Code != http.StatusForbidden {
		t.Fatalf("ordinary member review status=%d, want 403", response.Code)
	}
	if calls.Load() != before {
		t.Fatal("rejected review triggered Feishu")
	}
	var history []model.AssignmentReview
	if err := tx.Where("submission_id = ?", submission.ID).Order("id ASC").Find(&history).Error; err != nil || len(history) != 3 || history[0].ID != original.ID || history[0].Comment != "original review" || history[1].Decision != model.AssignmentReviewNeedsRedo || history[2].Decision != model.AssignmentReviewPassed {
		t.Fatalf("original and revised history was not preserved: %#v err=%v", history, err)
	}
}
