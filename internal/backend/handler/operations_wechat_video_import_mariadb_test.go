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

func TestMariaDBWeChatVideoFollowerImport(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("wechat_video_import_%d_", time.Now().UnixNano())},
	})
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
	// The previously verified current-day snapshot is a separate observation.
	if err := db.Create(&model.OperationsAccountSnapshot{
		Platform: "wechat_video", ObservedOn: "2026-11-19", Followers: 441, Source: "admin_page",
	}).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	superAdmin := true
	router := gin.New()
	router.POST("/video-import", func(c *gin.Context) {
		role := "user"
		if superAdmin {
			role = model.RoleNameSuperAdmin
		}
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: role}})
		NewOperationsProgressHandler(db).ImportWeChatVideoFollowers(c)
	})
	upload := func(content []byte) *httptest.ResponseRecorder {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("file", "视频号关注者增长详情数据.csv")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(content); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		request := httptest.NewRequest(http.MethodPost, "/video-import", &body)
		request.Header.Set("Content-Type", writer.FormDataContentType())
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	first := channelsFollowersCSV(
		"\"2026/11/18\",0,0,0,441",
		"\"2026/11/17\",-2,0,2,441",
	)
	for i := 0; i < 2; i++ {
		response := upload(first)
		if response.Code != http.StatusOK {
			t.Fatalf("import %d returned %d: %s", i, response.Code, response.Body.String())
		}
	}
	var rows []model.OperationsAccountSnapshot
	if err := db.Order("observed_on").Find(&rows).Error; err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 || rows[0].ObservedOn != "2026-11-17" ||
		rows[1].NewFollowers == nil || *rows[1].NewFollowers != 0 ||
		rows[2].Source != "admin_page" || rows[2].Followers != 441 {
		t.Fatalf("unexpected saved records: %+v", rows)
	}
	// A later export must update the same observation day rather than duplicate it.
	if response := upload(channelsFollowersCSV("\"2026/11/18\",1,1,0,442")); response.Code != http.StatusOK {
		t.Fatalf("replacement import returned %d: %s", response.Code, response.Body.String())
	}
	var latest model.OperationsAccountSnapshot
	if err := db.Where("observed_on = ?", "2026-11-18").First(&latest).Error; err != nil {
		t.Fatal(err)
	}
	if latest.Followers != 442 || latest.Source != "admin_export" {
		t.Fatalf("upsert did not replace historical export row: %+v", latest)
	}
	superAdmin = false
	if response := upload(first); response.Code != http.StatusForbidden {
		t.Fatalf("ordinary member can import: %d", response.Code)
	}
	superAdmin = true
	if response := upload(channelsFollowersCSV("\"2026/11/18\",3,0,0,441")); response.Code != http.StatusBadRequest {
		t.Fatalf("invalid CSV was accepted: %d", response.Code)
	}
	if err := db.Where("observed_on = ?", "2026-11-18").First(&latest).Error; err != nil {
		t.Fatal(err)
	}
	if latest.Followers != 442 {
		t.Fatalf("invalid CSV overwrote valid import: %+v", latest)
	}
}
