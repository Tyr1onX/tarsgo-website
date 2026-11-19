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

func TestMariaDBWeChatVideoPostImportReconcilesDashboardSeeds(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("wp_%d_", time.Now().UnixNano())},
	})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPlatformPost{})
	if err := db.AutoMigrate(&model.OperationsPlatformPost{}); err != nil {
		t.Fatal(err)
	}
	originalTime := time.Date(2026, 3, 26, 3, 40, 0, 0, time.UTC)
	seed := model.OperationsPlatformPost{
		Platform: "wechat_video", ExternalID: "dashboard:202603261140",
		Title:       "2026RMUL高校联盟赛 东北站 即将开始！",
		PublishedAt: originalTime, ViewCount: 1000, LikeCount: 18,
		RecommendCount: 26, URL: "https://example.com/original",
		MediaType: "video", SyncedAt: time.Now().UTC(),
	}
	if err := db.Create(&seed).Error; err != nil {
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
		NewOperationsProgressHandler(db).ImportWeChatVideoPosts(c)
	})
	upload := func(content []byte) *httptest.ResponseRecorder {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("file", "视频号动态数据明细.csv")
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
	csvData := channelsPostCSV(
		channelsPostRow(seed.Title, "export/official-1", "2026/03/26", "1007", "18", "26", "1", "8", "2"),
		channelsPostRow("当日另一篇", "export/official-2", "2026/03/26", "200", "5", "7", "0", "1", ""),
	)
	for i := 0; i < 2; i++ {
		response := upload(csvData)
		if response.Code != http.StatusOK {
			t.Fatalf("upload %d returned %d: %s", i, response.Code, response.Body.String())
		}
	}
	var stored []model.OperationsPlatformPost
	if err := db.Order("id").Find(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if len(stored) != 2 || stored[0].ID != seed.ID ||
		stored[0].ExternalID != expectedVideoPostID("export/official-1") ||
		stored[0].ViewCount != 1007 || stored[0].RecommendCount != 18 ||
		stored[0].LikeCount != 26 || stored[0].FollowerGain == nil ||
		*stored[0].FollowerGain != 2 ||
		!stored[0].PublishedAt.Equal(originalTime) || stored[0].URL != seed.URL ||
		stored[1].ExternalID != expectedVideoPostID("export/official-2") {
		t.Fatalf("video CSV import duplicated seed or lost important data: %+v", stored)
	}
	updated := channelsPostCSV(channelsPostRow(seed.Title, "export/official-1", "2026/03/26", "1100", "20", "30", "2", "9", "3"))
	if response := upload(updated); response.Code != http.StatusOK {
		t.Fatalf("update returned %d: %s", response.Code, response.Body.String())
	}
	var current model.OperationsPlatformPost
	if err := db.First(&current, seed.ID).Error; err != nil {
		t.Fatal(err)
	}
	if current.ViewCount != 1100 || current.LikeCount != 30 || current.RecommendCount != 20 {
		t.Fatalf("reimport did not update the same stable video: %+v", current)
	}
	superAdmin = false
	if response := upload(updated); response.Code != http.StatusForbidden {
		t.Fatalf("ordinary user could import video records: %d", response.Code)
	}
	superAdmin = true
	if response := upload([]byte("时间,播放,推荐,喜欢,评论,分享,关注\n2026/11/18,1,0,0,0,0,0")); response.Code != http.StatusBadRequest {
		t.Fatalf("aggregate daily CSV accepted as posts: %d", response.Code)
	}
	var count int64
	if err := db.Model(&model.OperationsPlatformPost{}).Count(&count).Error; err != nil || count != 2 {
		t.Fatalf("invalid import changed records: %d, %v", count, err)
	}
}
