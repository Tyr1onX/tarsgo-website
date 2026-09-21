package portal

import (
	"context"
	"net/http"
	"testing"
	"time"

	"tarsgo-backend/model"
)

func TestWeekBoundsUseShanghaiMondayToNextMonday(t *testing.T) {
	shanghai, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	cases := []time.Time{
		time.Date(2026, 9, 14, 0, 0, 0, 0, shanghai),
		time.Date(2026, 9, 20, 23, 59, 59, 0, shanghai),
		time.Date(2026, 9, 16, 1, 30, 0, 0, time.UTC),
	}
	for _, value := range cases {
		bounds := weekBounds(value)
		if bounds.Start.Weekday() != time.Monday || bounds.Start.Hour() != 0 || bounds.End.Sub(bounds.Start) != 7*24*time.Hour {
			t.Fatalf("invalid bounds for %v: %#v", value, bounds)
		}
		if value.In(shanghai).Before(bounds.Start) || !value.In(shanghai).Before(bounds.End) {
			t.Fatalf("value not within bounds: value=%v bounds=%#v", value, bounds)
		}
	}
}

func TestEventCRUDAndEndTimeValidation(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	start := time.Date(2026, 9, 19, 14, 0, 0, 0, time.FixedZone("CST", 8*3600))
	input := EventInput{Title: "联调", Description: "跨天联调", Location: "实验室", StartsAt: start, EndsAt: start.Add(18 * time.Hour), Status: model.TeamEventStatusDraft, AudienceType: model.PortalAudienceAll}
	created, err := service.CreateEvent(context.Background(), superActor(), input)
	if err != nil || created.ID == 0 {
		t.Fatalf("create event: item=%#v err=%v", created, err)
	}
	input.Status = model.TeamEventStatusPublished
	updated, err := service.UpdateEvent(context.Background(), superActor(), created.ID, input)
	if err != nil || updated.Status != model.TeamEventStatusPublished {
		t.Fatalf("update event: item=%#v err=%v", updated, err)
	}
	invalid := input
	invalid.EndsAt = invalid.StartsAt
	_, err = service.CreateEvent(context.Background(), superActor(), invalid)
	requireStatus(t, err, http.StatusBadRequest)
	if err := service.DeleteEvent(context.Background(), superActor(), created.ID); err != nil {
		t.Fatalf("delete event: %v", err)
	}
}

func TestEventRejectsInvalidStatusAudienceAndGroup(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	start := time.Now()
	input := EventInput{Title: "测试", StartsAt: start, EndsAt: start.Add(time.Hour), Status: "invalid", AudienceType: model.PortalAudienceAll}
	_, err := service.CreateEvent(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
	input.Status = model.TeamEventStatusPublished
	input.AudienceType = model.PortalAudienceGroups
	_, err = service.CreateEvent(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
	input.TargetGroupIDs = []uint64{1, 2}
	repo.activeCount = 1
	_, err = service.CreateEvent(context.Background(), superActor(), input)
	requireStatus(t, err, http.StatusBadRequest)
}
