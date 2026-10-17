package dailysignal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"

	"tarsgo-backend/model"
)

type memoryRepository struct {
	mu      sync.Mutex
	records map[string]model.DailySignal
	nextID  uint64
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{records: map[string]model.DailySignal{}, nextID: 1}
}

func memoryKey(userID uint64, date string) string { return fmt.Sprintf("%d/%s", userID, date) }

func (r *memoryRepository) Find(_ context.Context, userID uint64, date string) (*model.DailySignal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	record, ok := r.records[memoryKey(userID, date)]
	if !ok {
		return nil, ErrNotFound
	}
	return copyRecord(record), nil
}

func (r *memoryRepository) ListYear(_ context.Context, userID uint64, startDate, endDate string) ([]model.DailySignal, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var records []model.DailySignal
	for _, record := range r.records {
		date := string(record.SignalDate)
		if record.UserID == userID && date >= startDate && date <= endDate {
			records = append(records, *copyRecord(record))
		}
	}
	return records, nil
}

func (r *memoryRepository) Create(_ context.Context, record *model.DailySignal) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := memoryKey(record.UserID, string(record.SignalDate))
	if _, ok := r.records[key]; ok {
		return &mysqlDriver.MySQLError{Number: 1062, Message: "duplicate"}
	}
	record.ID = r.nextID
	r.nextID++
	r.records[key] = *copyRecord(*record)
	return nil
}

func (r *memoryRepository) SetMood(_ context.Context, userID uint64, date string, mood *string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := memoryKey(userID, date)
	record, ok := r.records[key]
	if !ok {
		return ErrNotFound
	}
	record.Mood = cloneString(mood)
	r.records[key] = record
	return nil
}

func copyRecord(record model.DailySignal) *model.DailySignal {
	record.Mood = cloneString(record.Mood)
	return &record
}

func newServiceAt(now time.Time) (*Service, *memoryRepository) {
	repo := newMemoryRepository()
	service := NewService(repo)
	service.now = func() time.Time { return now }
	return service, repo
}

func TestTodayUsesBeijingCalendarDate(t *testing.T) {
	service, _ := newServiceAt(time.Date(2026, 12, 31, 16, 30, 0, 0, time.UTC))
	if got := service.Today(); got != "2027-01-01" {
		t.Fatalf("Today() = %q, want Beijing date 2027-01-01", got)
	}
}

func TestArchiveUsesOneBeijingInstantForDateAndYear(t *testing.T) {
	service, _ := newServiceAt(time.Date(2026, time.December, 31, 15, 59, 59, 0, time.UTC))
	calls := 0
	service.now = func() time.Time {
		calls++
		if calls == 1 {
			return time.Date(2026, time.December, 31, 15, 59, 59, 0, time.UTC)
		}
		return time.Date(2026, time.December, 31, 16, 0, 1, 0, time.UTC)
	}

	archive, err := service.GetArchive(context.Background(), nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if archive.Year != 2026 || archive.Today != "2026-12-31" {
		t.Fatalf("archive crossed Beijing midnight internally: %#v", archive)
	}
	if calls != 1 {
		t.Fatalf("clock read %d times, want a consistent instant", calls)
	}
}

func TestGuestArchiveDoesNotReadOrExposeAnyUserRecords(t *testing.T) {
	service, repo := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	mood := MoodTired
	if err := repo.Create(context.Background(), &model.DailySignal{UserID: 11, SignalDate: "2026-03-02", Mood: &mood}); err != nil {
		t.Fatal(err)
	}
	archive, err := service.GetArchive(context.Background(), nil, 2026)
	if err != nil {
		t.Fatal(err)
	}
	if archive.Authenticated || archive.SignedToday || len(archive.Days) != 0 || len(archive.Moods) != 0 {
		t.Fatalf("guest archive exposed private data: %#v", archive)
	}
}

func TestArchiveIsScopedToCurrentUserAndIncludesOnlyThatUsersMoods(t *testing.T) {
	service, repo := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	otherMood := MoodTired
	myMood := MoodSteady
	for _, record := range []model.DailySignal{
		{UserID: 7, SignalDate: "2026-01-12", Mood: &myMood},
		{UserID: 7, SignalDate: "2025-12-31", Mood: &myMood},
		{UserID: 8, SignalDate: "2026-01-13", Mood: &otherMood},
		{UserID: 8, SignalDate: "2026-10-16", Mood: &otherMood},
	} {
		if err := repo.Create(context.Background(), &record); err != nil {
			t.Fatal(err)
		}
	}
	userID := uint64(7)
	archive, err := service.GetArchive(context.Background(), &userID, 2026)
	if err != nil {
		t.Fatal(err)
	}
	if len(archive.Days) != 1 || archive.Days[0] != "2026-01-12" || len(archive.Moods) != 1 {
		t.Fatalf("unexpected user archive: %#v", archive)
	}
	if archive.SignedToday || archive.TodayMood != nil {
		t.Fatalf("archive should not contain another account's today status: %#v", archive)
	}
	if _, err := service.GetArchive(context.Background(), &userID, 2027); err == nil {
		t.Fatal("future archive year should be rejected")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusBadRequest {
		t.Fatalf("future year error = %#v, want HTTP 400", err)
	}
}

func TestSendTodayIsIdempotentAndDoesNotRewriteMoodOnRetry(t *testing.T) {
	service, repo := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	userID := uint64(3)
	mood := MoodTired
	first, err := service.SendToday(context.Background(), userID, &mood)
	if err != nil || !first.Created || first.Date != "2026-10-16" || first.Mood == nil || *first.Mood != mood {
		t.Fatalf("first signal = %#v, %v", first, err)
	}
	otherMood := MoodGood
	retry, err := service.SendToday(context.Background(), userID, &otherMood)
	if err != nil || retry.Created || retry.Mood == nil || *retry.Mood != mood {
		t.Fatalf("retry must preserve the saved mood: result=%#v err=%v", retry, err)
	}
	if len(repo.records) != 1 {
		t.Fatalf("stored %d rows, want exactly one", len(repo.records))
	}
}

func TestSendTodayConcurrentRetriesCreateOneSignal(t *testing.T) {
	service, repo := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	const requests = 24
	var wait sync.WaitGroup
	var mu sync.Mutex
	created := 0
	var failures []error
	for range requests {
		wait.Add(1)
		go func() {
			defer wait.Done()
			result, err := service.SendToday(context.Background(), 91, nil)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failures = append(failures, err)
			} else if result.Created {
				created++
			}
		}()
	}
	wait.Wait()
	if len(failures) != 0 || created != 1 || len(repo.records) != 1 {
		t.Fatalf("concurrent writes failures=%v created=%d rows=%d, want none / 1 / 1", failures, created, len(repo.records))
	}
}

func TestMoodCanBeEditedOrClearedOnlyForExistingTodaySignal(t *testing.T) {
	service, _ := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	userID := uint64(4)
	mood := MoodGood
	if _, err := service.SetTodayMood(context.Background(), userID, &mood); err == nil {
		t.Fatal("mood update must not create a missing check-in")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusNotFound {
		t.Fatalf("missing signal error = %#v, want HTTP 404", err)
	}
	if _, err := service.SendToday(context.Background(), userID, nil); err != nil {
		t.Fatal(err)
	}
	updated, err := service.SetTodayMood(context.Background(), userID, &mood)
	if err != nil || updated.Mood == nil || *updated.Mood != mood {
		t.Fatalf("set mood result=%#v err=%v", updated, err)
	}
	cleared, err := service.SetTodayMood(context.Background(), userID, nil)
	if err != nil || cleared.Mood != nil {
		t.Fatalf("clear mood result=%#v err=%v", cleared, err)
	}
	if _, err := service.SetTodayMood(context.Background(), userID, stringPtr("不是有效状态")); err == nil {
		t.Fatal("invalid mood should be rejected")
	}
}

func TestHistoricalMoodRemainsAvailableForPrivateArchive(t *testing.T) {
	service, repo := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	mood := MoodHighLoad
	if err := repo.Create(context.Background(), &model.DailySignal{UserID: 5, SignalDate: "2026-10-12", Mood: &mood}); err != nil {
		t.Fatal(err)
	}
	archive, err := service.GetArchive(context.Background(), stringUserID(5), 2026)
	if err != nil || len(archive.Days) != 1 || len(archive.Moods) != 1 || archive.Moods[0].Mood != mood {
		t.Fatalf("historical mood and check-in should remain available to its owner: archive=%#v err=%v", archive, err)
	}
}

func TestDuplicateCreateRaceReturnsExistingSignal(t *testing.T) {
	service, repo := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	seed := &model.DailySignal{UserID: 10, SignalDate: "2026-10-16"}
	if err := repo.Create(context.Background(), seed); err != nil {
		t.Fatal(err)
	}
	result, err := service.SendToday(context.Background(), 10, nil)
	if err != nil || result.Created || result.Date != "2026-10-16" {
		t.Fatalf("duplicate response=%#v err=%v", result, err)
	}
}

func TestGetArchiveRejectsInvalidYearAndInternalErrorsAreWrapped(t *testing.T) {
	service, _ := newServiceAt(time.Date(2026, 10, 16, 4, 0, 0, 0, time.UTC))
	for _, year := range []int{1999, 2027} {
		_, err := service.GetArchive(context.Background(), nil, year)
		var serviceErr *ServiceError
		if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusBadRequest {
			t.Errorf("year %d error = %#v, want HTTP 400", year, err)
		}
	}
}

func stringPtr(value string) *string { return &value }

func stringUserID(value uint64) *uint64 { return &value }
