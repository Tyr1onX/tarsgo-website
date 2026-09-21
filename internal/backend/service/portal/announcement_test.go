package portal

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type fakeRepository struct {
	rows                       map[uint64]*model.Announcement
	visible                    []model.Announcement
	activeCount                int64
	deletedID                  uint64
	lastGroups                 []uint64
	events                     map[uint64]*model.TeamEvent
	visibleEvents              []model.TeamEvent
	links                      map[uint64]*model.PortalLink
	visibleLinks               []model.PortalLink
	leaderGroupIDs             []uint64
	lastAnnouncementScope      []uint64
	lastEventScope             []uint64
	lastAnnouncementsAllGroups bool
	lastEventsAllGroups        bool
	lastLinksAllGroups         bool
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{rows: map[uint64]*model.Announcement{}, events: map[uint64]*model.TeamEvent{}, links: map[uint64]*model.PortalLink{}, activeCount: 2}
}

func (r *fakeRepository) ListLeaderGroupIDs(context.Context, uint64) ([]uint64, error) {
	return append([]uint64(nil), r.leaderGroupIDs...), nil
}
func (r *fakeRepository) ListManagedGroups(context.Context, []uint64) ([]model.UserGroup, error) {
	return []model.UserGroup{{ID: 101, Name: "机械组"}}, nil
}

func (r *fakeRepository) ListAnnouncements(_ context.Context, input ListAnnouncementsInput) ([]model.Announcement, int64, error) {
	r.lastAnnouncementScope = append([]uint64(nil), input.ScopeGroupIDs...)
	rows := make([]model.Announcement, 0, len(r.rows))
	for _, row := range r.rows {
		rows = append(rows, *row)
	}
	return rows, int64(len(rows)), nil
}
func (r *fakeRepository) GetAnnouncement(_ context.Context, id uint64) (*model.Announcement, error) {
	row, ok := r.rows[id]
	if !ok || r.deletedID == id {
		return nil, gorm.ErrRecordNotFound
	}
	copy := *row
	return &copy, nil
}
func (r *fakeRepository) CreateAnnouncement(_ context.Context, row *model.Announcement, groups []uint64) error {
	row.ID = 1
	row.CreatedAt = time.Now()
	row.UpdatedAt = row.CreatedAt
	for _, groupID := range groups {
		row.TargetGroups = append(row.TargetGroups, model.AnnouncementTargetGroup{GroupID: groupID})
	}
	r.rows[row.ID] = row
	r.lastGroups = append([]uint64(nil), groups...)
	return nil
}
func (r *fakeRepository) UpdateAnnouncement(_ context.Context, id uint64, updates map[string]any, groups []uint64) error {
	row := r.rows[id]
	row.Title = updates["title"].(string)
	row.Status = updates["status"].(string)
	row.TargetGroups = nil
	for _, groupID := range groups {
		row.TargetGroups = append(row.TargetGroups, model.AnnouncementTargetGroup{GroupID: groupID})
	}
	r.lastGroups = append([]uint64(nil), groups...)
	return nil
}
func (r *fakeRepository) DeleteAnnouncement(_ context.Context, id uint64) error {
	r.deletedID = id
	return nil
}
func (r *fakeRepository) CountActiveGroups(context.Context, []uint64) (int64, error) {
	return r.activeCount, nil
}
func (r *fakeRepository) ListVisibleAnnouncements(_ context.Context, _ uint64, _ time.Time, _ int, allGroups bool) ([]model.Announcement, error) {
	r.lastAnnouncementsAllGroups = allGroups
	return r.visible, nil
}
func (r *fakeRepository) ListEvents(_ context.Context, input ListEventsInput) ([]model.TeamEvent, int64, error) {
	r.lastEventScope = append([]uint64(nil), input.ScopeGroupIDs...)
	return nil, 0, nil
}
func (r *fakeRepository) GetEvent(_ context.Context, id uint64) (*model.TeamEvent, error) {
	row, ok := r.events[id]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	copy := *row
	return &copy, nil
}
func (r *fakeRepository) CreateEvent(_ context.Context, row *model.TeamEvent, groups []uint64) error {
	row.ID = 1
	for _, id := range groups {
		row.TargetGroups = append(row.TargetGroups, model.TeamEventTargetGroup{GroupID: id})
	}
	r.events[row.ID] = row
	return nil
}
func (r *fakeRepository) UpdateEvent(_ context.Context, id uint64, updates map[string]any, groups []uint64) error {
	row := r.events[id]
	row.Title = updates["title"].(string)
	row.Status = updates["status"].(string)
	row.TargetGroups = nil
	for _, groupID := range groups {
		row.TargetGroups = append(row.TargetGroups, model.TeamEventTargetGroup{GroupID: groupID})
	}
	return nil
}
func (r *fakeRepository) DeleteEvent(_ context.Context, id uint64) error {
	delete(r.events, id)
	return nil
}
func (r *fakeRepository) ListVisibleEvents(_ context.Context, _ uint64, _ TimeRange, _ int, allGroups bool) ([]model.TeamEvent, error) {
	r.lastEventsAllGroups = allGroups
	return r.visibleEvents, nil
}
func (r *fakeRepository) ListLinks(context.Context, []uint64) ([]model.PortalLink, error) {
	rows := make([]model.PortalLink, 0, len(r.links))
	for _, row := range r.links {
		rows = append(rows, *row)
	}
	return rows, nil
}
func (r *fakeRepository) GetLink(_ context.Context, id uint64) (*model.PortalLink, error) {
	row, ok := r.links[id]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	copy := *row
	return &copy, nil
}
func (r *fakeRepository) CreateLink(_ context.Context, row *model.PortalLink, groups []uint64) error {
	row.ID = 1
	for _, id := range groups {
		row.TargetGroups = append(row.TargetGroups, model.PortalLinkTargetGroup{GroupID: id})
	}
	r.links[row.ID] = row
	return nil
}
func (r *fakeRepository) UpdateLink(_ context.Context, id uint64, updates map[string]any, groups []uint64) error {
	row := r.links[id]
	row.Name = updates["name"].(string)
	row.URL = updates["url"].(string)
	row.IsEnabled = updates["is_enabled"].(bool)
	row.TargetGroups = nil
	for _, groupID := range groups {
		row.TargetGroups = append(row.TargetGroups, model.PortalLinkTargetGroup{GroupID: groupID})
	}
	return nil
}
func (r *fakeRepository) DeleteLink(_ context.Context, id uint64) error {
	delete(r.links, id)
	return nil
}
func (r *fakeRepository) ListVisibleLinks(_ context.Context, _ uint64, allGroups bool) ([]model.PortalLink, error) {
	r.lastLinksAllGroups = allGroups
	return r.visibleLinks, nil
}

func validAnnouncementInput() AnnouncementInput {
	return AnnouncementInput{Title: "测试公告", Content: "这是一段用于生成摘要的正文。", Category: "team", Status: model.AnnouncementStatusDraft, AudienceType: model.PortalAudienceAll}
}

func superActor() Actor { return Actor{ID: 10, RoleName: model.RoleNameSuperAdmin} }

func leaderActor() Actor { return Actor{ID: 20, RoleName: model.RoleNameAdmin} }

func requireStatus(t *testing.T, err error, status int) {
	t.Helper()
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Status != status {
		t.Fatalf("expected service status %d, got %v", status, err)
	}
}

func TestAnnouncementCRUDAndSoftDelete(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	created, err := service.CreateAnnouncement(context.Background(), superActor(), validAnnouncementInput())
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.Summary == "" || created.ID == 0 {
		t.Fatalf("expected generated summary and id, got %#v", created)
	}
	input := validAnnouncementInput()
	input.Title = "已发布公告"
	input.Status = model.AnnouncementStatusPublished
	updated, err := service.UpdateAnnouncement(context.Background(), superActor(), created.ID, input)
	if err != nil || updated.Title != input.Title {
		t.Fatalf("update failed: item=%#v err=%v", updated, err)
	}
	if err := service.DeleteAnnouncement(context.Background(), superActor(), created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	_, err = service.GetAnnouncement(context.Background(), superActor(), created.ID)
	requireStatus(t, err, http.StatusNotFound)
}

func TestAnnouncementRejectsNonSuperAdminAndInvalidInputs(t *testing.T) {
	service := NewService(newFakeRepository())
	_, err := service.CreateAnnouncement(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, validAnnouncementInput())
	requireStatus(t, err, http.StatusForbidden)

	cases := []AnnouncementInput{
		{Title: "", Content: "正文", Category: "team", Status: "draft", AudienceType: "all"},
		{Title: "标题", Content: "正文", Category: "tailwind-red", Status: "draft", AudienceType: "all"},
		{Title: "标题", Content: "正文", Category: "team", Status: "invalid", AudienceType: "all"},
		{Title: "标题", Content: "正文", Category: "team", Status: "draft", AudienceType: "groups"},
	}
	for index, input := range cases {
		_, err := service.CreateAnnouncement(context.Background(), superActor(), input)
		requireStatus(t, err, http.StatusBadRequest)
		if err == nil {
			t.Fatalf("case %d should fail", index)
		}
	}
}

func TestLeaderCanManageOnlyOwnGroupAnnouncements(t *testing.T) {
	repo := newFakeRepository()
	repo.leaderGroupIDs = []uint64{101}
	repo.activeCount = 1
	service := NewService(repo)
	if _, err := service.ListAnnouncements(context.Background(), leaderActor(), ListAnnouncementsInput{}); err != nil {
		t.Fatalf("leader list: %v", err)
	}
	if len(repo.lastAnnouncementScope) != 1 || repo.lastAnnouncementScope[0] != 101 {
		t.Fatalf("leader list scope = %v", repo.lastAnnouncementScope)
	}
	input := validAnnouncementInput()
	input.AudienceType = model.PortalAudienceGroups
	input.TargetGroupIDs = []uint64{101}
	created, err := service.CreateAnnouncement(context.Background(), leaderActor(), input)
	if err != nil || created.ID == 0 {
		t.Fatalf("leader should create own-group announcement: item=%#v err=%v", created, err)
	}

	all := input
	all.AudienceType = model.PortalAudienceAll
	all.TargetGroupIDs = nil
	_, err = service.CreateAnnouncement(context.Background(), leaderActor(), all)
	requireStatus(t, err, http.StatusForbidden)

	other := input
	other.TargetGroupIDs = []uint64{202}
	_, err = service.CreateAnnouncement(context.Background(), leaderActor(), other)
	requireStatus(t, err, http.StatusForbidden)

	repo.rows[created.ID].TargetGroups = []model.AnnouncementTargetGroup{{GroupID: 202}}
	_, err = service.GetAnnouncement(context.Background(), leaderActor(), created.ID)
	requireStatus(t, err, http.StatusForbidden)
}

func TestAnnouncementRejectsInvalidTimeRangeAndGroup(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	publish := time.Date(2026, 9, 16, 8, 0, 0, 0, time.FixedZone("CST", 8*3600))
	expire := publish.Add(-time.Minute)
	input := validAnnouncementInput()
	input.PublishAt, input.ExpireAt = &publish, &expire
	_, err := service.CreateAnnouncement(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)

	input = validAnnouncementInput()
	input.AudienceType = model.PortalAudienceGroups
	input.TargetGroupIDs = []uint64{1, 2, 2}
	repo.activeCount = 1
	_, err = service.CreateAnnouncement(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
}

func TestLeaderCanManageOnlyOwnGroupEvents(t *testing.T) {
	repo := newFakeRepository()
	repo.leaderGroupIDs = []uint64{101}
	repo.activeCount = 1
	service := NewService(repo)
	if _, err := service.ListEvents(context.Background(), leaderActor(), ListEventsInput{}); err != nil {
		t.Fatalf("leader list: %v", err)
	}
	if len(repo.lastEventScope) != 1 || repo.lastEventScope[0] != 101 {
		t.Fatalf("leader list scope = %v", repo.lastEventScope)
	}
	input := EventInput{
		Title: "组内会议", StartsAt: time.Date(2026, 9, 16, 8, 0, 0, 0, time.UTC),
		EndsAt: time.Date(2026, 9, 16, 9, 0, 0, 0, time.UTC), Status: model.TeamEventStatusDraft,
		AudienceType: model.PortalAudienceGroups, TargetGroupIDs: []uint64{101},
	}
	created, err := service.CreateEvent(context.Background(), leaderActor(), input)
	if err != nil || created.ID == 0 {
		t.Fatalf("leader should create own-group event: item=%#v err=%v", created, err)
	}

	all := input
	all.AudienceType = model.PortalAudienceAll
	all.TargetGroupIDs = nil
	_, err = service.CreateEvent(context.Background(), leaderActor(), all)
	requireStatus(t, err, http.StatusForbidden)

	other := input
	other.TargetGroupIDs = []uint64{202}
	_, err = service.CreateEvent(context.Background(), leaderActor(), other)
	requireStatus(t, err, http.StatusForbidden)

	repo.events[created.ID].TargetGroups = []model.TeamEventTargetGroup{{GroupID: 202}}
	_, err = service.GetEvent(context.Background(), leaderActor(), created.ID)
	requireStatus(t, err, http.StatusForbidden)
}

func TestLeaderCanManageOnlyOwnGroupLinks(t *testing.T) {
	repo := newFakeRepository()
	repo.leaderGroupIDs = []uint64{101}
	repo.activeCount = 1
	service := NewService(repo)
	input := LinkInput{Name: "组内文档", URL: "https://docs.example.com/team", IconKey: "book", IsEnabled: true, AudienceType: model.PortalAudienceGroups, TargetGroupIDs: []uint64{101}}
	created, err := service.CreateLink(context.Background(), leaderActor(), input)
	if err != nil || created.ID == 0 {
		t.Fatalf("leader should create own-group link: item=%#v err=%v", created, err)
	}

	all := input
	all.AudienceType = model.PortalAudienceAll
	all.TargetGroupIDs = nil
	_, err = service.CreateLink(context.Background(), leaderActor(), all)
	requireStatus(t, err, http.StatusForbidden)

	other := input
	other.TargetGroupIDs = []uint64{202}
	_, err = service.CreateLink(context.Background(), leaderActor(), other)
	requireStatus(t, err, http.StatusForbidden)

	repo.links[created.ID].TargetGroups = []model.PortalLinkTargetGroup{{GroupID: 202}}
	_, err = service.GetLink(context.Background(), leaderActor(), created.ID)
	requireStatus(t, err, http.StatusForbidden)
}

func TestHomeReturnsStableArraysAndRepositoryOrder(t *testing.T) {
	repo := newFakeRepository()
	repo.visible = []model.Announcement{
		{ID: 2, Title: "置顶", Content: "置顶正文", IsPinned: true, Status: model.AnnouncementStatusPublished},
		{ID: 1, Title: "普通", Content: "普通正文", Status: model.AnnouncementStatusPublished},
	}
	service := NewService(repo)
	service.now = func() time.Time { return time.Date(2026, 9, 15, 16, 0, 0, 0, time.FixedZone("CST", 8*3600)) }
	home, err := service.GetHome(context.Background(), Actor{ID: 99, RoleName: model.RoleNameUser})
	if err != nil {
		t.Fatalf("get home: %v", err)
	}
	if len(home.Announcements) != 2 || home.Announcements[0].ID != 2 {
		t.Fatalf("unexpected announcements: %#v", home.Announcements)
	}
	if home.Events == nil || home.Links == nil {
		t.Fatal("events and links must be stable empty arrays")
	}
}

func TestSuperAdminHomeIncludesAllGroupContent(t *testing.T) {
	repo := newFakeRepository()
	repo.visible = []model.Announcement{{ID: 9, Title: "其他组公告", Status: model.AnnouncementStatusPublished}}
	repo.visibleEvents = []model.TeamEvent{{ID: 8, Title: "其他组日程", Status: model.TeamEventStatusPublished}}
	repo.visibleLinks = []model.PortalLink{{ID: 7, Name: "其他组链接", URL: "https://example.com"}}
	service := NewService(repo)
	home, err := service.GetHome(context.Background(), superActor())
	if err != nil {
		t.Fatalf("get super admin home: %v", err)
	}
	if len(home.Announcements) != 1 || len(home.Events) != 1 || len(home.Links) != 1 {
		t.Fatalf("super admin home missing group content: %#v", home)
	}
	if !repo.lastAnnouncementsAllGroups || !repo.lastEventsAllGroups || !repo.lastLinksAllGroups {
		t.Fatal("super admin home should request all group content")
	}
}
