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

func TestOrganizationPreviewResolvesConfirmedRosterWithoutDuplicatingPositionHolders(t *testing.T) {
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
		sqlmock.NewRows([]string{"id", "real_name", "avatar_url", "status"}).
			AddRow(961, "玄玉波", nil, 1).
			AddRow(641, "吉荣昌", nil, 1).
			AddRow(2001, "林俊宏", nil, 1).
			AddRow(2002, "刘曦博", nil, 1).
			AddRow(2003, "刘曦博", nil, 1).
			AddRow(2004, "李晟泽", nil, 0).
			AddRow(2005, "杜海龙", nil, 1),
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
	if len(response.Data.OtherMembers) != 18 || len(response.Data.OtherGuides) != 8 {
		t.Fatalf("roster sizes: members=%d, guides=%d", len(response.Data.OtherMembers), len(response.Data.OtherGuides))
	}
	find := func(members []organization.Member, name string) organization.Member {
		for _, member := range members {
			if member.Name == name {
				return member
			}
		}
		t.Fatalf("%q missing from roster", name)
		return organization.Member{}
	}
	if member := find(response.Data.OtherMembers, "林俊宏"); member.UserID == nil || *member.UserID != 2001 {
		t.Fatalf("unique real name should link to profile: %#v", member)
	}
	if member := find(response.Data.OtherMembers, "刘曦博"); member.UserID != nil || member.AccountStatus != "账号待核实" {
		t.Fatalf("duplicate names must never auto-link: %#v", member)
	}
	if member := find(response.Data.OtherMembers, "李晟泽"); member.UserID != nil || member.AccountStatus != "账号不可用" {
		t.Fatalf("disabled accounts must not link: %#v", member)
	}
	if member := find(response.Data.OtherMembers, "孙宇丹"); member.UserID != nil || member.AccountStatus != "账号不在" {
		t.Fatalf("unmatched members must remain visible: %#v", member)
	}
	if guide := find(response.Data.OtherGuides, "杜海龙"); guide.UserID == nil || *guide.UserID != 2005 {
		t.Fatalf("teacher account should link: %#v", guide)
	}
	if response.Data.Categories[0].Positions[0].Name != "吉荣昌" {
		t.Fatalf("assigned member must stay in position: %#v", response.Data.Categories[0].Positions[0])
	}
	for _, member := range response.Data.OtherMembers {
		if member.Name == "吉荣昌" || member.Name == "镇沈晖" || member.Name == "孙煦朝" {
			t.Fatalf("position member duplicated in roster: %#v", member)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
