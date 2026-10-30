package workmanual

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func newWorkManualMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("open GORM over SQL mock: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = sqlDB.Close()
	})
	return db, mock
}

func TestOperationsCatalogueAllowsOperationsMembersAndDeniesOtherGroups(t *testing.T) {
	query := regexp.QuoteMeta("SELECT count(*) FROM `user_group_members` JOIN user_groups ON user_groups.id = user_group_members.group_id JOIN users ON users.id = user_group_members.user_id WHERE user_group_members.user_id = ? AND user_groups.name = ? AND user_groups.status = ? AND users.status = ?")

	t.Run("operations member can read the catalogue", func(t *testing.T) {
		db, mock := newWorkManualMock(t)
		mock.ExpectQuery(query).
			WithArgs(uint64(42), OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))

		catalogue, err := NewService(db).OperationsCatalogue(context.Background(), Actor{ID: 42, RoleName: model.RoleNameUser})
		if err != nil {
			t.Fatalf("read catalogue: %v", err)
		}
		if !json.Valid(catalogue) || !strings.Contains(string(catalogue), "校园网之窗宣传申请") {
			t.Fatalf("catalogue is invalid or missing the SOP title: %s", catalogue)
		}
		for _, expected := range []string{"592 × 450 px", "xywzc@jlu.edu.cn", "活动开始前至少 10 天", "行政楼 301", "校园网之窗宣传申请表（DOC）"} {
			if !strings.Contains(string(catalogue), expected) {
				t.Errorf("catalogue is missing source-backed detail %q", expected)
			}
		}
	})

	t.Run("operations admin must have active operations membership", func(t *testing.T) {
		db, mock := newWorkManualMock(t)
		mock.ExpectQuery(query).
			WithArgs(uint64(51), OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))

		_, err := NewService(db).OperationsCatalogue(context.Background(), Actor{ID: 51, RoleName: model.RoleNameAdmin})
		var serviceErr *ServiceError
		if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusForbidden {
			t.Fatalf("catalogue error = %v, want HTTP 403", err)
		}
	})

	t.Run("member outside operations group cannot read the catalogue", func(t *testing.T) {
		db, mock := newWorkManualMock(t)
		mock.ExpectQuery(query).
			WithArgs(uint64(52), OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))

		_, err := NewService(db).OperationsCatalogue(context.Background(), Actor{ID: 52, RoleName: model.RoleNameUser})
		var serviceErr *ServiceError
		if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusForbidden {
			t.Fatalf("catalogue error = %v, want HTTP 403", err)
		}
	})

	t.Run("super admin can read without group membership", func(t *testing.T) {
		db, _ := newWorkManualMock(t)
		if _, err := NewService(db).OperationsCatalogue(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}); err != nil {
			t.Fatalf("super admin was denied catalogue access: %v", err)
		}
	})
}

func TestOperationsCatalogueContainsFinalRecruitmentBriefingSOP(t *testing.T) {
	catalogue, err := readContent(operationsCataloguePath)
	if err != nil {
		t.Fatalf("read operations catalogue: %v", err)
	}
	var parsed struct {
		Documents []struct {
			Slug     string `json:"slug"`
			Title    string `json:"title"`
			Sections []struct {
				ID     string `json:"id"`
				Title  string `json:"title"`
				Blocks []struct {
					Type       string   `json:"type"`
					Title      string   `json:"title"`
					Text       string   `json:"text"`
					Items      []string `json:"items"`
					Completion string   `json:"completion"`
				} `json:"blocks"`
			} `json:"sections"`
		} `json:"documents"`
	}
	if err := json.Unmarshal(catalogue, &parsed); err != nil {
		t.Fatalf("decode operations catalogue: %v", err)
	}
	if len(parsed.Documents) != 2 {
		t.Fatalf("operations catalogue has %d documents, want existing SOP plus one new SOP", len(parsed.Documents))
	}
	if got := parsed.Documents[1]; got.Slug != "recruitment-briefing" || got.Title != "招新宣讲活动筹备与现场执行" {
		t.Fatalf("second SOP = %#v", got)
	}
	document := parsed.Documents[1]
	wantSections := []struct{ id, title string }{
		{"scenario", "适用场景"},
		{"workflow", "办理流程"},
		{"notes", "注意事项"},
	}
	if len(document.Sections) != len(wantSections) {
		t.Fatalf("recruitment SOP has %d sections, want %d", len(document.Sections), len(wantSections))
	}
	for index, want := range wantSections {
		if got := document.Sections[index]; got.ID != want.id || got.Title != want.title {
			t.Errorf("section %d = (%q, %q), want (%q, %q)", index, got.ID, got.Title, want.id, want.title)
		}
	}
	if got := document.Sections[0].Blocks[0].Text; got != "适用于吉甲大师战队年度招新、跨校区宣讲及其他新生介绍活动。" {
		t.Errorf("scenario text = %q", got)
	}
	workflow := document.Sections[1].Blocks
	wantSteps := []struct {
		title      string
		itemCount  int
		completion string
	}{
		{"第一步：确定宣讲时间与场地", 4, "场地已确认，参与人员知道何时、到哪里集合。"},
		{"第二步：准备宣讲材料", 4, "宣讲人员已经拿到最终版材料，所有需要播放的内容均可正常打开。"},
		{"第三步：准备报名渠道", 4, "新生能够使用现场展示的报名入口完成相应操作。"},
		{"第四步：确定现场人员分工", 8, "每位参与人员知道自己的任务及出现问题时应联系谁。"},
		{"第五步：到场检查设备", 6, "宣讲、播放、报名和拍摄所需设备均已实际测试。"},
		{"第六步：开展现场宣讲", 5, "完成宣讲、现场问答和报名引导。"},
		{"第七步：结束活动并整理资料", 5, "活动资料已经归档，报名跟进和遗留问题均有明确负责人。"},
	}
	if len(workflow) != len(wantSteps) {
		t.Fatalf("recruitment SOP has %d workflow blocks, want %d", len(workflow), len(wantSteps))
	}
	for index, want := range wantSteps {
		got := workflow[index]
		if got.Type != "step" || got.Title != want.title || len(got.Items) != want.itemCount || got.Completion != want.completion {
			t.Errorf("step %d = %#v, want title %q, %d items, completion %q", index+1, got, want.title, want.itemCount, want.completion)
		}
	}
	for _, expected := range []string{
		"宣讲人员：负责 PPT 讲解、战队介绍及现场答疑。",
		"设备负责人：负责投影、音响、视频播放等设备。",
		"直播人员（如有）：负责直播操作和外部观看状态检查。",
		"直播必须实际监看。此前战队曾出现直播异常未被及时发现的情况。",
		"不要只检查二维码图片是否存在，应实际打开对应页面。",
	} {
		if !strings.Contains(string(catalogue), expected) {
			t.Errorf("operations catalogue is missing confirmed SOP detail %q", expected)
		}
	}
}

func TestApplicationFormPreservesOriginalWordFile(t *testing.T) {
	db, _ := newWorkManualMock(t)
	file, err := NewService(db).ApplicationForm(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin})
	if err != nil {
		t.Fatalf("read application form: %v", err)
	}
	if file.FileName != "校园网之窗申请表.doc" || file.ContentType != "application/msword" {
		t.Fatalf("download metadata = %#v", file)
	}
	if got := sha256.Sum256(file.Content); got != [32]byte{0x8b, 0x2e, 0x05, 0x9d, 0xe1, 0x7a, 0xa9, 0x8b, 0xca, 0x75, 0x31, 0x63, 0x3e, 0x90, 0xc5, 0x3d, 0x3d, 0x8c, 0x74, 0x02, 0x74, 0x41, 0x72, 0x1a, 0xb7, 0x73, 0xe4, 0x96, 0x8d, 0xbe, 0x4d, 0x79} {
		t.Fatalf("downloaded template hash = %x, original source file changed", got)
	}
}
