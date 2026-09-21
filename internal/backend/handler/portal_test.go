package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/portal"
)

type stubPortalService struct{ createCalled bool }

func (s *stubPortalService) ListAnnouncements(context.Context, portal.Actor, portal.ListAnnouncementsInput) (*portal.AnnouncementList, error) {
	return &portal.AnnouncementList{Items: []portal.AnnouncementItem{}, Page: 1, PageSize: 20}, nil
}
func (s *stubPortalService) GetAnnouncement(context.Context, portal.Actor, uint64) (*portal.AnnouncementItem, error) {
	return &portal.AnnouncementItem{}, nil
}
func (s *stubPortalService) CreateAnnouncement(context.Context, portal.Actor, portal.AnnouncementInput) (*portal.AnnouncementItem, error) {
	s.createCalled = true
	return &portal.AnnouncementItem{ID: 1}, nil
}
func (s *stubPortalService) UpdateAnnouncement(context.Context, portal.Actor, uint64, portal.AnnouncementInput) (*portal.AnnouncementItem, error) {
	return &portal.AnnouncementItem{}, nil
}
func (s *stubPortalService) DeleteAnnouncement(context.Context, portal.Actor, uint64) error {
	return nil
}
func (s *stubPortalService) GetHome(context.Context, portal.Actor) (*portal.HomeData, error) {
	return &portal.HomeData{Announcements: []portal.AnnouncementItem{}, Events: []portal.EventItem{}, Links: []portal.LinkItem{}}, nil
}
func (s *stubPortalService) ListEvents(context.Context, portal.Actor, portal.ListEventsInput) (*portal.EventList, error) {
	return &portal.EventList{Items: []portal.EventItem{}}, nil
}
func (s *stubPortalService) GetEvent(context.Context, portal.Actor, uint64) (*portal.EventItem, error) {
	return &portal.EventItem{}, nil
}
func (s *stubPortalService) CreateEvent(context.Context, portal.Actor, portal.EventInput) (*portal.EventItem, error) {
	return &portal.EventItem{}, nil
}
func (s *stubPortalService) UpdateEvent(context.Context, portal.Actor, uint64, portal.EventInput) (*portal.EventItem, error) {
	return &portal.EventItem{}, nil
}
func (s *stubPortalService) DeleteEvent(context.Context, portal.Actor, uint64) error { return nil }
func (s *stubPortalService) ListLinks(context.Context, portal.Actor) ([]portal.LinkItem, error) {
	return []portal.LinkItem{}, nil
}
func (s *stubPortalService) GetLink(context.Context, portal.Actor, uint64) (*portal.LinkItem, error) {
	return &portal.LinkItem{}, nil
}
func (s *stubPortalService) CreateLink(context.Context, portal.Actor, portal.LinkInput) (*portal.LinkItem, error) {
	return &portal.LinkItem{}, nil
}
func (s *stubPortalService) UpdateLink(context.Context, portal.Actor, uint64, portal.LinkInput) (*portal.LinkItem, error) {
	return &portal.LinkItem{}, nil
}
func (s *stubPortalService) DeleteLink(context.Context, portal.Actor, uint64) error { return nil }
func (s *stubPortalService) ListManagedGroups(context.Context, portal.Actor) ([]portal.ManagedGroupItem, error) {
	return []portal.ManagedGroupItem{}, nil
}

func TestPortalHandlerRejectsInvalidAnnouncementTimeWithEnvelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &stubPortalService{}
	handler := NewPortalHandler(service)
	recorder, ctx := newJSONContext(t, http.MethodPost, "/api/admin/announcements", map[string]any{
		"title": "测试", "content": "正文", "category": "team", "status": "draft",
		"audienceType": "all", "publishAt": "not-a-time",
	})
	handler.CreateAnnouncement(ctx)
	if recorder.Code != http.StatusBadRequest || service.createCalled {
		t.Fatalf("expected 400 before service call, code=%d called=%v", recorder.Code, service.createCalled)
	}
	var envelope struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if envelope.Code != 400 || envelope.Message == "" || string(envelope.Data) != "null" {
		t.Fatalf("unexpected envelope: %s", recorder.Body.String())
	}
}

func TestPortalHandlerHomeUsesStableResponseEnvelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewPortalHandler(&stubPortalService{})
	recorder, ctx := newPlainContext(http.MethodGet, "/api/portal/home")
	handler.GetHome(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["code"] != float64(200) || payload["data"] == nil {
		t.Fatalf("unexpected envelope: %s", recorder.Body.String())
	}
}
