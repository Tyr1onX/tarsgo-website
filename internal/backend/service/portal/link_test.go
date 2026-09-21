package portal

import (
	"context"
	"net/http"
	"testing"

	"tarsgo-backend/model"
)

func TestPortalURLWhitelist(t *testing.T) {
	allowed := []string{"/docs/rules", "/", "https://www.robomaster.com/", "https://example.com/path?q=1"}
	for _, value := range allowed {
		if !validPortalURL(value) {
			t.Errorf("expected allowed: %s", value)
		}
	}
	rejected := []string{"", "#", "//evil.example", "http://example.com", "javascript:alert(1)", "data:text/html,test", "ftp://example.com", "https://user:pass@example.com"}
	for _, value := range rejected {
		if validPortalURL(value) {
			t.Errorf("expected rejected: %s", value)
		}
	}
}

func TestLinkCRUDEnableSortAndGroupValidation(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	input := LinkInput{Name: "规则手册", URL: "https://example.com/rules", IconKey: "book", SortOrder: 20, IsEnabled: true, OpenInNewWindow: true, AudienceType: model.PortalAudienceAll}
	created, err := service.CreateLink(context.Background(), superActor(), input)
	if err != nil || created.ID == 0 || !created.IsEnabled || created.SortOrder != 20 {
		t.Fatalf("create link: item=%#v err=%v", created, err)
	}
	input.IsEnabled = false
	input.SortOrder = 5
	updated, err := service.UpdateLink(context.Background(), superActor(), created.ID, input)
	if err != nil || updated.IsEnabled {
		t.Fatalf("disable link: item=%#v err=%v", updated, err)
	}
	if err := service.DeleteLink(context.Background(), superActor(), created.ID); err != nil {
		t.Fatalf("delete link: %v", err)
	}

	input.URL = "javascript:alert(1)"
	_, err = service.CreateLink(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
	input.URL = "/safe"
	input.IconKey = "<svg>"
	_, err = service.CreateLink(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
	input.IconKey = "link"
	input.AudienceType = model.PortalAudienceGroups
	input.TargetGroupIDs = nil
	_, err = service.CreateLink(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
	input.URL = "/dashboard/users/registrations"
	input.IconKey = "link"
	input.AudienceType = model.PortalAudienceAll
	_, err = service.CreateLink(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
}

func TestHomeReturnsRepositoryOrderedLinks(t *testing.T) {
	repo := newFakeRepository()
	repo.visibleLinks = []model.PortalLink{{ID: 2, Name: "先", URL: "/first", IconKey: "link", SortOrder: 1, IsEnabled: true}, {ID: 1, Name: "后", URL: "/second", IconKey: "link", SortOrder: 2, IsEnabled: true}}
	service := NewService(repo)
	home, err := service.GetHome(context.Background(), Actor{ID: 10, RoleName: model.RoleNameUser})
	if err != nil || len(home.Links) != 2 || home.Links[0].ID != 2 {
		t.Fatalf("unexpected home links: %#v err=%v", home, err)
	}
}
