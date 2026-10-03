package dashboard

import (
	"context"
	"net/http"
	"testing"
	"time"

	"tarsgo-backend/model"
)

type fakeRepository struct {
	total, monthly, pending int64
	groups                  []GroupDistributionItem
	activities              []model.ActivityEvent
	start, end              time.Time
	requestedLimit          int
}

func (r *fakeRepository) CountUsers(context.Context) (int64, error) { return r.total, nil }
func (r *fakeRepository) CountUsersCreated(_ context.Context, start, end time.Time) (int64, error) {
	r.start, r.end = start, end
	return r.monthly, nil
}
func (r *fakeRepository) CountPendingRegistrations(context.Context) (int64, error) {
	return r.pending, nil
}
func (r *fakeRepository) ListTechnicalGroups(context.Context) ([]GroupDistributionItem, error) {
	return r.groups, nil
}
func (r *fakeRepository) ListRecentActivities(_ context.Context, limit int) ([]model.ActivityEvent, error) {
	r.requestedLimit = limit
	if len(r.activities) > limit {
		return r.activities[:limit], nil
	}
	return r.activities, nil
}

func TestDashboardUsesShanghaiMonthAndKeepsZeroMemberGroups(t *testing.T) {
	repo := &fakeRepository{total: 40, monthly: 3, pending: 2, groups: []GroupDistributionItem{{ID: 1, Name: "视觉组", Count: 5}, {ID: 2, Name: "新技术组", Count: 0}}}
	service := NewService(repo)
	service.now = func() time.Time { return time.Date(2026, 8, 31, 16, 30, 0, 0, time.UTC) }
	data, err := service.Get(context.Background(), Actor{ID: 1, RoleName: model.RoleNameAdmin})
	if err != nil {
		t.Fatal(err)
	}
	if data.TotalUsers != 40 || data.NewUsersThisMonth != 3 || data.PendingRegistrations != 2 || data.ActiveTechnicalGroups != 2 || data.GroupDistribution[1].Count != 0 {
		t.Fatalf("unexpected data: %#v", data)
	}
	if repo.start.Format(time.RFC3339) != "2026-09-01T00:00:00+08:00" || repo.end.Format(time.RFC3339) != "2026-10-01T00:00:00+08:00" {
		t.Fatalf("unexpected month bounds: %s - %s", repo.start, repo.end)
	}
	if repo.requestedLimit != 10 {
		t.Fatalf("expected recent activity limit 10, got %d", repo.requestedLimit)
	}
}

func TestDashboardRejectsOrdinaryUser(t *testing.T) {
	service := NewService(&fakeRepository{})
	_, err := service.Get(context.Background(), Actor{ID: 2, RoleName: model.RoleNameUser})
	serviceErr, ok := err.(*ServiceError)
	if !ok || serviceErr.Status != http.StatusForbidden {
		t.Fatalf("expected 403, got %v", err)
	}
}

func TestDashboardFormatsSafeReadableActivitiesNewestFirst(t *testing.T) {
	actorName := "管理员"
	groupName := "视觉组"
	shanghai, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	databaseTime := time.Date(2026, 9, 15, 11, 2, 23, 0, shanghai)
	repo := &fakeRepository{activities: []model.ActivityEvent{{ID: 2, ActionKey: model.ActivityAnnouncementPublished, Metadata: map[string]any{"title": "训练通知", "secret": "not returned"}, Actor: &model.User{Nickname: &actorName}, Group: &model.UserGroup{Name: groupName}, CreatedAt: databaseTime}, {ID: 1, ActionKey: model.ActivityRegistrationReviewUndo, CreatedAt: databaseTime.Add(-time.Minute)}}}
	service := NewService(repo)
	data, err := service.Get(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin})
	if err != nil {
		t.Fatal(err)
	}
	if len(data.RecentActivities) != 2 || data.RecentActivities[0].ID != 2 || data.RecentActivities[0].Message != "发布了公告「训练通知」" || data.RecentActivities[0].GroupName != groupName {
		t.Fatalf("unexpected activities: %#v", data.RecentActivities)
	}
	if got := data.RecentActivities[0].OccurredAt.In(shanghai).Format("2006-01-02 15:04:05"); got != "2026-09-15 19:02:23" {
		t.Fatalf("expected UTC database time to display in Shanghai as 19:02:23, got %s", got)
	}
}

func TestDashboardFormatsPortalChangeActivities(t *testing.T) {
	tests := []struct {
		action string
		want   string
	}{
		{model.ActivityAnnouncementCreated, "创建了公告「测试内容」"},
		{model.ActivityAnnouncementUpdated, "编辑了公告「测试内容」"},
		{model.ActivityAnnouncementDeleted, "删除了公告「测试内容」"},
		{model.ActivityEventCreated, "创建了日程「测试内容」"},
		{model.ActivityEventUpdated, "编辑了日程「测试内容」"},
		{model.ActivityEventDeleted, "删除了日程「测试内容」"},
		{model.ActivityPortalLinkCreated, "创建了快捷链接「测试内容」"},
		{model.ActivityPortalLinkUpdated, "编辑了快捷链接「测试内容」"},
		{model.ActivityPortalLinkDeleted, "删除了快捷链接「测试内容」"},
	}
	for _, test := range tests {
		if got := activityMessage(model.ActivityEvent{ActionKey: test.action, Metadata: map[string]any{"title": "测试内容"}}); got != test.want {
			t.Fatalf("activity %s: got %q, want %q", test.action, got, test.want)
		}
	}
}
