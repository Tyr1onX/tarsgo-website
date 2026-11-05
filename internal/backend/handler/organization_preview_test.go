package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/service/organization"
)

func TestOrganizationPreviewIncludesOnlyUnassignedRegisteredFormalMembers(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()

	db, err := gorm.Open(mysql.New(mysql.Config{
		Conn: sqlDB, SkipInitializeWithVersion: true,
	}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}

	mock.ExpectQuery("SELECT .* FROM `users`").WillReturnRows(
		sqlmock.NewRows([]string{"id", "real_name", "avatar_url", "team_identity_status", "status"}).
			AddRow(961, "玄玉波", nil, "community_member", 1).
			AddRow(641, "吉荣昌", nil, "formal_member", 1).
			AddRow(2001, "未任职队员", nil, "formal_member", 1).
			AddRow(2002, "其他社区成员", nil, "community_member", 1).
			AddRow(2003, "停用正式队员", nil, "formal_member", 0),
	)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/team/organization-preview", nil)
	OrganizationPreview(db)(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("organization response code = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Data organization.Preview `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data.OtherMembers) != 1 ||
		response.Data.OtherMembers[0].Name != "未任职队员" ||
		response.Data.OtherMembers[0].UserID == nil ||
		*response.Data.OtherMembers[0].UserID != 2001 {
		t.Fatalf("unexpected other formal members: %#v", response.Data.OtherMembers)
	}
	if response.Data.Categories[0].Positions[0].Name != "吉荣昌" {
		t.Fatalf("assigned members must remain in their positions: %#v", response.Data.Categories[0].Positions[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
