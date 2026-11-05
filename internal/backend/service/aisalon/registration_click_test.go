package aisalon

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"

	"gorm.io/gorm"
	"tarsgo-backend/model"
)

const testRegistrationAction = "[报名](https://www.aidaxue.com/activity/cyber-maker?ch=ai_daxue_AStudio_JLuniversity)\n\n介绍"

func TestRegistrationActionEligibility(t *testing.T) {
	for _, summary := range []string{testRegistrationAction, " \n" + testRegistrationAction, "[报名](https://example.test)"} {
		if !hasRegistrationAction(summary) {
			t.Fatalf("valid standalone action rejected: %q", summary)
		}
	}
	for _, summary := range []string{"正文", "正文\n\n" + testRegistrationAction, "[报名](http://example.test)\n\n正文", "[报名](https://user:password@example.test)\n\n正文", "[报名](https:///)\n\n正文", "[ ](https://example.test)\n\n正文", "[报名](https://example.test)\n正文"} {
		if hasRegistrationAction(summary) {
			t.Fatalf("non-action accepted: %q", summary)
		}
	}
}

func TestMariaDBAISalonRegistrationClicks(t *testing.T) {
	f := newFixture(t, 0)
	pool, _ := f.db.DB()
	pool.SetMaxOpenConns(4)
	ctx := t.Context()
	e := f.event(t, 1)
	if err := f.service.RegistrationClick(ctx, e.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("offline count accepted: %v", err)
	}
	e.Online, e.Summary, e.RegistrationClicks = true, testRegistrationAction, 999
	saved, err := f.service.SaveEvent(ctx, e.ID, e)
	if err != nil || saved.RegistrationClicks != 0 {
		t.Fatalf("client-supplied counter accepted: %#v %v", saved, err)
	}
	if err := f.db.First(saved, e.ID).Error; err != nil {
		t.Fatal(err)
	}
	stale := *saved
	const clicks = 20
	results := make(chan error, clicks)
	var wg sync.WaitGroup
	for i := 0; i < clicks; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- f.service.RegistrationClick(ctx, e.ID) }()
	}
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	var current model.AISalonEvent
	if err := f.db.First(&current, e.ID).Error; err != nil {
		t.Fatal(err)
	}
	if current.RegistrationClicks != clicks || !current.UpdatedAt.Equal(stale.UpdatedAt) {
		t.Fatalf("lost clicks or changed content timestamp: count=%d before=%s after=%s", current.RegistrationClicks, stale.UpdatedAt, current.UpdatedAt)
	}
	stale.Title += " edited"
	stale.RegistrationClicks = 1234
	saved, err = f.service.SaveEvent(ctx, e.ID, stale)
	if err != nil || saved.RegistrationClicks != clicks {
		t.Fatalf("stale admin edit overwrote count: %#v %v", saved, err)
	}
	publicEvent, err := f.service.Get(ctx, e.ID)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(publicEvent)
	if strings.Contains(string(data), "registrationClicks") {
		t.Fatal("public API exposes internal counter")
	}
	for _, state := range []struct {
		published bool
		summary   string
	}{
		{false, testRegistrationAction}, {true, "普通简介"}, {true, "[报名](https://user:pass@example.test)\n\n正文"},
	} {
		next := *saved
		next.Published, next.Summary = state.published, state.summary
		if _, err := f.service.SaveEvent(ctx, next.ID, next); err != nil {
			t.Fatal(err)
		}
		if err := f.service.RegistrationClick(ctx, next.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
			t.Fatalf("ineligible event counted: %#v %v", state, err)
		}
	}
	if err := f.service.RegistrationClick(ctx, 0); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatal(err)
	}
	// A submitted initial value cannot invent historical clicks on a new event.
	next := stale
	next.RegistrationClicks = 1234
	created, err := f.service.SaveEvent(ctx, 0, next)
	if err != nil {
		t.Fatal(err)
	}
	f.events = append(f.events, created.ID)
	if created.RegistrationClicks != 0 {
		t.Fatal("new count must start at zero")
	}
}
