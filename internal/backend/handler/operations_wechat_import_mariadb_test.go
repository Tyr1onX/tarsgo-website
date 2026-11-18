package handler

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"

	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

func TestMariaDBWeChatImportUpsertsDaysAndChecksPermission(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("wechat_import_%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsAccountSnapshot{})
	if err := db.AutoMigrate(&model.OperationsAccountSnapshot{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.OperationsAccountSnapshot{
		Platform: "wechat", ObservedOn: "2026-11-17", Followers: 9, Source: "manual",
	}).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	superAdmin := true
	router := gin.New()
	router.POST("/import", func(c *gin.Context) {
		role := "user"
		if superAdmin {
			role = model.RoleNameSuperAdmin
		}
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: role}})
		NewOperationsProgressHandler(db).ImportWeChatFollowers(c)
	})
	upload := func(content []byte) *httptest.ResponseRecorder {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("file", "user-growth.xls")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(content); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		request := httptest.NewRequest(http.MethodPost, "/import", &body)
		request.Header.Set("Content-Type", writer.FormDataContentType())
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	first := testWeChatFollowersHTML(
		weChatFollowerRow("2026-11-16", "0", "2", "-2", "3429"),
		weChatFollowerRow("2026-11-17", "1", "5", "-4", "3425"),
	)
	for i := 0; i < 2; i++ {
		response := upload(first)
		if response.Code != http.StatusOK {
			t.Fatalf("upload %d returned %d: %s", i, response.Code, response.Body.String())
		}
	}
	var snapshots []model.OperationsAccountSnapshot
	if err := db.Order("observed_on ASC").Find(&snapshots).Error; err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 2 || snapshots[0].Followers != 3429 || snapshots[1].Followers != 3425 ||
		snapshots[1].NewFollowers == nil || *snapshots[1].NewFollowers != 1 ||
		snapshots[1].Unfollows == nil || *snapshots[1].Unfollows != 5 {
		t.Fatalf("import didn't upsert daily followers: %+v", snapshots)
	}
	superAdmin = false
	response := upload(testWeChatFollowersHTML(weChatFollowerRow("2026-11-17", "0", "0", "0", "2000")))
	if response.Code != http.StatusForbidden {
		t.Fatalf("ordinary member can import: %d", response.Code)
	}
	superAdmin = true
	response = upload(testWeChatFollowersHTML(
		weChatFollowerRow("2026-11-16", "0", "2", "-2", "3429"),
		weChatFollowerRow("2026-11-17", "1", "5", "-4", "2000"),
	))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("inconsistent export was accepted: %d", response.Code)
	}
	if err := db.Order("observed_on ASC").Find(&snapshots).Error; err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 2 || snapshots[1].Followers != 3425 {
		t.Fatalf("invalid import changed saved data: %+v", snapshots)
	}
}
