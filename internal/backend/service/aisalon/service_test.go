package aisalon

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"tarsgo-backend/database"
	"tarsgo-backend/model"
	"tarsgo-backend/service/accountprofile"
)

func TestInputAndPublicPrivacy(t *testing.T) {
	now := time.Now().UTC()
	e := model.AISalonEvent{Title: "活动", Summary: "介绍", Location: "南岭", Capacity: 1, StartAt: now.Add(time.Hour), EndAt: now.Add(2 * time.Hour), Deadline: now, Published: true}
	if err := validateEvent(&e); err != nil {
		t.Fatal(err)
	}
	if open(e, now) {
		t.Fatal("deadline is exclusive")
	}
	invalid := e
	invalid.Deadline = e.StartAt.Add(time.Second)
	if validateEvent(&invalid) == nil {
		t.Fatal("deadline after start")
	}
	invalid = e
	invalid.EndAt = e.StartAt
	if validateEvent(&invalid) == nil {
		t.Fatal("invalid time range")
	}
	for _, poster := range []string{"javascript:alert(1)", "http://example.test/x.png", "https://user:pass@example.test/x.png"} {
		invalid = e
		invalid.PosterURL = poster
		if validateEvent(&invalid) == nil {
			t.Fatal("unsafe poster accepted")
		}
	}
	invalid = e
	invalid.PosterURL = "/upload/ai-salon/posters/../../outside.png"
	if validateEvent(&invalid) == nil {
		t.Fatal("unsafe local poster path accepted")
	}
	validPoster := e
	validPoster.PosterURL = salonPosterURLPrefix + "0123456789abcdef0123456789abcdef.webp"
	if err := validateEvent(&validPoster); err != nil {
		t.Fatalf("uploaded poster URL was rejected: %v", err)
	}
	body, _ := json.Marshal(public(e, now))
	for _, key := range []string{"capacity", "registered", "waitlisted", "email", "userId", "studentId", "published"} {
		if strings.Contains(string(body), `"`+key+`"`) {
			t.Fatalf("private field %s exposed", key)
		}
	}
}

func TestSalonPosterUploadValidationAndPersistence(t *testing.T) {
	poster := image.NewRGBA(image.Rect(0, 0, 2, 2))
	poster.Set(0, 0, color.RGBA{R: 0x30, G: 0x80, B: 0xc0, A: 0xff})
	var pngImage bytes.Buffer
	if err := png.Encode(&pngImage, poster); err != nil {
		t.Fatal(err)
	}
	var jpegImage bytes.Buffer
	if err := jpeg.Encode(&jpegImage, poster, nil); err != nil {
		t.Fatal(err)
	}
	fixtures := []struct {
		name      string
		data      []byte
		extension string
	}{
		{name: "poster.png", data: pngImage.Bytes(), extension: ".png"},
		{name: "poster.jpg", data: jpegImage.Bytes(), extension: ".jpg"},
		{name: "poster.webp", data: tinySalonWebP(), extension: ".webp"},
	}
	root := t.TempDir()
	for _, fixture := range fixtures {
		t.Run(fixture.extension, func(t *testing.T) {
			url, err := savePosterUpload(t.Context(), root, salonPosterFileHeader(t, fixture.name, fixture.data))
			if err != nil {
				t.Fatal(err)
			}
			filename := strings.TrimPrefix(url, salonPosterURLPrefix)
			if !salonPosterFilenamePattern.MatchString(filename) || filepath.Ext(filename) != fixture.extension {
				t.Fatalf("unexpected stored URL: %s", url)
			}
			stored, err := os.ReadFile(filepath.Join(root, filename))
			if err != nil || !bytes.Equal(stored, fixture.data) {
				t.Fatalf("uploaded image was not persisted: %v", err)
			}
		})
	}

	for _, fixture := range []struct {
		name string
		data []byte
	}{
		{name: "fake.png", data: []byte("<script>alert(1)</script>")},
		{name: "vector.svg", data: []byte("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")},
		{name: "broken.webp", data: []byte("RIFF0000WEBP")},
	} {
		if _, err := savePosterUpload(t.Context(), root, salonPosterFileHeader(t, fixture.name, fixture.data)); err == nil {
			t.Fatalf("invalid image was accepted: %s", fixture.name)
		}
	}
	if _, err := savePosterUpload(t.Context(), root, &multipart.FileHeader{Size: MaxPosterUploadBytes + 1}); err == nil {
		t.Fatal("oversized image was accepted")
	}
}

func salonPosterFileHeader(t *testing.T, name string, data []byte) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("poster", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(1 << 20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	return request.MultipartForm.File["poster"][0]
}

func tinySalonWebP() []byte {
	data, err := base64.StdEncoding.DecodeString("UklGRioAAABXRUJQVlA4IB4AAABwAQCdASoCAAIABgCIJYwCdAFAAAD+7r0fmrQAAAA=")
	if err != nil {
		panic(err)
	}
	return data
}

type fixture struct {
	db      *gorm.DB
	service *Service
	users   []model.User
	events  []uint64
	now     time.Time
}

func newFixture(t *testing.T, n int) *fixture {
	t.Helper()
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated loopback acceptance database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(40)
	f := &fixture{db: db, now: time.Now().UTC().Truncate(time.Second)}
	f.service = NewService(db)
	f.service.now = func() time.Time { return f.now }
	if err := database.RunMigrations(context.Background(), db, "test"); err != nil {
		t.Fatal(err)
	}
	var role model.Role
	if err := db.Where("name = ?", model.RoleNameUser).First(&role).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, id := range f.events {
			db.Where("event_id = ?", id).Delete(&model.AISalonRegistration{})
			db.Delete(&model.AISalonEvent{}, id)
		}
		for _, u := range f.users {
			db.Where("user_id = ?", u.ID).Delete(&model.LeaveProfile{})
			db.Delete(&model.User{}, u.ID)
		}
		sqlDB.Close()
	})
	marker := time.Now().UnixNano()
	for i := 0; i < n; i++ {
		name := "原姓名"
		u := model.User{RoleID: role.ID, Email: fmt.Sprintf("salon-%d-%d@tarsgo.test", marker, i), RealName: &name, Status: 1}
		if err := db.Create(&u).Error; err != nil {
			t.Fatal(err)
		}
		f.users = append(f.users, u)
	}
	return f
}
func (f *fixture) event(t *testing.T, capacity int) model.AISalonEvent {
	t.Helper()
	e := model.AISalonEvent{Title: "[TEST] AI沙龙", Summary: "测试活动", Location: "南岭", Capacity: capacity, Published: true, StartAt: f.now.Add(2 * time.Hour), EndAt: f.now.Add(3 * time.Hour), Deadline: f.now.Add(time.Hour)}
	saved, err := f.service.SaveEvent(context.Background(), 0, e)
	if err != nil {
		t.Fatal(err)
	}
	f.events = append(f.events, saved.ID)
	return *saved
}
func profile(i int) model.AcademicInfo {
	return model.AcademicInfo{RealName: "测试同学", College: "自定义学院", Grade: "2026级", StudentID: fmt.Sprintf("S%07d", i), Campus: "南岭校区", Gender: 1}
}
func requireStatus(t *testing.T, err error, status int) {
	t.Helper()
	var e *Error
	if !errors.As(err, &e) || e.Status != status {
		t.Fatalf("want status %d, got %v", status, err)
	}
}
func TestMariaDBAISalonWorkflow(t *testing.T) {
	f := newFixture(t, 5)
	s := f.service
	ctx := context.Background()
	e := f.event(t, 1)
	signup := func(i int) *model.AISalonRegistration {
		t.Helper()
		r, err := f.register(ctx, e.ID, f.users[i].ID, profile(i))
		if err != nil {
			t.Fatal(err)
		}
		f.now = f.now.Add(time.Microsecond)
		return r
	}
	if signup(0).Status != Registered || signup(1).Status != Waitlisted || signup(2).Status != Waitlisted {
		t.Fatal("seat assignment failed")
	}
	_, err := f.register(ctx, e.ID, f.users[3].ID, profile(0))
	requireStatus(t, err, 409)
	_, err = f.register(ctx, e.ID, f.users[0].ID, profile(3))
	requireStatus(t, err, 409)
	if err := s.Cancel(ctx, e.ID, f.users[1].ID); err != nil {
		t.Fatal(err)
	}
	signup(1)
	if err := s.Cancel(ctx, e.ID, f.users[0].ID); err != nil {
		t.Fatal(err)
	}
	roster, err := s.Roster(ctx, e.ID)
	if err != nil {
		t.Fatal(err)
	}
	if roster.Registered != 1 || roster.Waitlisted != 1 {
		t.Fatalf("roster: %+v", roster)
	}
	mine, err := s.Mine(ctx, f.users[2].ID)
	if err != nil || len(mine) != 1 || mine[0].Status != Registered || mine[0].Title != e.Title {
		t.Fatalf("FIFO/requeue or personal history: %+v %v", mine, err)
	}
	e.Capacity = 2
	if _, err := s.SaveEvent(ctx, e.ID, e); err != nil {
		t.Fatal(err)
	}
	mine, _ = s.Mine(ctx, f.users[1].ID)
	if mine[0].Status != Registered {
		t.Fatal("capacity increase didn't promote")
	}
	e.Capacity = 1
	_, err = s.SaveEvent(ctx, e.ID, e)
	requireStatus(t, err, 409)
	e.Capacity = 2
	changed := profile(2)
	changed.College = "新学院"
	changed.Grade = "2027级"
	changed.Campus = "新校区"
	changed.Gender = 2
	changed.RealName = "新姓名"
	if _, err := f.setProfile(f.users[2].ID, changed); err != nil {
		t.Fatal(err)
	}
	saved, err := f.profile(ctx, f.users[2].ID)
	if err != nil || saved != changed {
		t.Fatalf("account profile sync: %+v %v", saved, err)
	}
	mine, _ = s.Mine(ctx, f.users[2].ID)
	if mine[0].College != "自定义学院" || mine[0].Gender != 0 {
		t.Fatal("historical snapshot mutated")
	}
	e.RegistrationClosed = true
	if _, err := s.SaveEvent(ctx, e.ID, e); err != nil {
		t.Fatal(err)
	}
	_, err = f.register(ctx, e.ID, f.users[3].ID, profile(3))
	requireStatus(t, err, 409)
	if err := s.Cancel(ctx, e.ID, f.users[1].ID); err != nil {
		t.Fatal("cancellation must remain available before deadline", err)
	}
	e.RegistrationClosed = false
	if _, err := s.SaveEvent(ctx, e.ID, e); err != nil {
		t.Fatal(err)
	}
	signup(3)
	signup(4)
	f.now = e.Deadline
	_, err = f.register(ctx, e.ID, f.users[0].ID, profile(0))
	requireStatus(t, err, 409)
	requireStatus(t, s.Cancel(ctx, e.ID, f.users[2].ID), 409)
	requireStatus(t, s.CheckIn(ctx, e.ID, f.users[2].ID), 409)
	f.now = e.StartAt
	requireStatus(t, s.CheckIn(ctx, e.ID, f.users[4].ID), 409)
	if err := s.CheckIn(ctx, e.ID, f.users[2].ID); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, s.CheckIn(ctx, e.ID, f.users[2].ID), 409)
	f.now = e.EndAt
	requireStatus(t, s.CheckIn(ctx, e.ID, f.users[3].ID), 409)
	roster, _ = s.Roster(ctx, e.ID)
	if roster.CheckedIn != 1 {
		t.Fatal("check-in count")
	}
	if err := s.Delete(ctx, e.ID); err != nil {
		t.Fatal(err)
	}
	var count int64
	f.db.Model(&model.AISalonRegistration{}).Where("event_id = ?", e.ID).Count(&count)
	if count != 0 {
		t.Fatal("delete didn't remove registrations/checkins")
	}
}
func TestMariaDBAISalonConcurrentSeatsAndStudentDedup(t *testing.T) {
	f := newFixture(t, 36)
	ctx := context.Background()
	e := f.event(t, 3)
	s := f.service
	var wg sync.WaitGroup
	errs := make(chan error, 40)
	start := make(chan struct{})
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, err := f.register(ctx, e.ID, f.users[i].ID, profile(i))
			errs <- err
		}(i)
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	roster, err := s.Roster(ctx, e.ID)
	if err != nil || roster.Registered != 3 || roster.Waitlisted != 29 {
		t.Fatalf("oversold: %+v %v", roster, err)
	}
	ids := []uint64{}
	for _, r := range roster.Items {
		if r.Status == Registered {
			ids = append(ids, r.UserID)
		}
	}
	errs = make(chan error, 3)
	for _, id := range ids[:2] {
		wg.Add(1)
		go func(id uint64) { defer wg.Done(); errs <- s.Cancel(ctx, e.ID, id) }(id)
	}
	wg.Add(1)
	go func() { defer wg.Done(); e.Capacity = 5; _, err := s.SaveEvent(ctx, e.ID, e); errs <- err }()
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	roster, _ = s.Roster(ctx, e.ID)
	if roster.Registered != 5 || roster.Waitlisted != 25 {
		t.Fatalf("cancel/expansion consistency %+v", roster)
	}
	dup := f.event(t, 1)
	errs = make(chan error, 2)
	for i := 32; i < 34; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := f.register(ctx, dup.ID, f.users[i].ID, profile(99))
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)
	success := 0
	for err := range errs {
		if err == nil {
			success++
		} else {
			requireStatus(t, err, 409)
		}
	}
	if success != 1 {
		t.Fatalf("student race accepted %d", success)
	}
	rows, _ := s.Roster(ctx, dup.ID)
	original := rows.Items[0]
	// Database constraints also protect callers which bypass service validation.
	copy := original
	copy.ID = 0
	copy.UserID = f.users[34].ID
	if err := f.db.Omit("Event").Create(&copy).Error; err == nil {
		t.Fatal("database student uniqueness missing")
	}
	copy = original
	copy.ID = 0
	copy.Status = Cancelled
	copy.ActiveStudentID = nil
	if err := f.db.Omit("Event").Create(&copy).Error; err == nil {
		t.Fatal("database user uniqueness missing")
	}
	if err := s.Cancel(ctx, dup.ID, original.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.register(ctx, dup.ID, f.users[35].ID, profile(99)); err != nil {
		t.Fatal("cancellation didn't release student number", err)
	}
}
func TestMariaDBAISalonProfileReuseAndPublication(t *testing.T) {
	f := newFixture(t, 1)
	ctx := context.Background()
	s := f.service
	e := f.event(t, 2)
	old := model.LeaveProfile{UserID: f.users[0].ID, Name: "原姓名", StudentID: "26010001", CollegeCode: "unknown-college", IdentityLocked: true, ParticipantType: "other"}
	if err := f.db.Create(&old).Error; err != nil {
		t.Fatal(err)
	}
	p, err := f.profile(ctx, f.users[0].ID)
	if err != nil || p.StudentID != old.StudentID || p.College != old.CollegeCode || p.RealName != "原姓名" {
		t.Fatalf("existing profile reuse: %+v %v", p, err)
	}
	e.Published = false
	if _, err := s.SaveEvent(ctx, e.ID, e); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, e.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatal("draft publicly visible")
	}
	if _, err := f.register(ctx, e.ID, f.users[0].ID, profile(0)); err == nil {
		t.Fatal("draft registration allowed")
	}
	e.Published = true
	e.Deadline = e.StartAt
	if _, err := s.SaveEvent(ctx, e.ID, e); err != nil {
		t.Fatal("deadline extension failed", err)
	}
	if _, err := f.register(ctx, e.ID, f.users[0].ID, profile(0)); err != nil {
		t.Fatal(err)
	}
	saved, err := f.profile(ctx, f.users[0].ID)
	if err != nil || saved != profile(0) {
		t.Fatalf("canonical profile read: %+v %v", saved, err)
	}
	var preserved model.LeaveProfile
	f.db.First(&preserved, old.ID)
	if preserved.StudentID != old.StudentID || !preserved.IdentityLocked {
		t.Fatal("internal locked identity changed")
	}
	f.now = e.EndAt.Add(time.Hour)
	if _, err := s.Get(ctx, e.ID); err != nil {
		t.Fatal("historical event lost", err)
	}
}

func TestMariaDBAISalonEqualTimestampRequeue(t *testing.T) {
	f := newFixture(t, 3)
	ctx := context.Background()
	e := f.event(t, 1)
	s := f.service
	for i := 0; i < 3; i++ {
		if _, err := f.register(ctx, e.ID, f.users[i].ID, profile(i)); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Cancel(ctx, e.ID, f.users[1].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.register(ctx, e.ID, f.users[1].ID, profile(1)); err != nil {
		t.Fatal(err)
	}
	if err := s.Cancel(ctx, e.ID, f.users[0].ID); err != nil {
		t.Fatal(err)
	}
	records, err := s.Mine(ctx, f.users[2].ID)
	if err != nil || records[0].Status != Registered {
		t.Fatalf("requeue did not append with tied timestamp: %+v %v", records, err)
	}
	history, err := s.Mine(ctx, f.users[1].ID)
	if err != nil || len(history) != 2 {
		t.Fatalf("cancelled history was lost: %+v %v", history, err)
	}
}

// Setup changes canonical account data before invoking the production service.
func (f *fixture) setProfile(id uint64, p model.AcademicInfo) (model.AcademicInfo, error) {
	err := f.db.Model(&model.User{}).Where("id = ?", id).Updates(map[string]any{"real_name": p.RealName, "student_id": p.StudentID, "college": p.College, "grade": p.Grade, "campus": p.Campus, "gender": p.Gender, "is_student": true}).Error
	return p, err
}
func (f *fixture) register(ctx context.Context, event, id uint64, p model.AcademicInfo) (*model.AISalonRegistration, error) {
	if _, err := f.setProfile(id, p); err != nil {
		return nil, err
	}
	return f.service.Register(ctx, event, id)
}
func (f *fixture) profile(ctx context.Context, id uint64) (model.AcademicInfo, error) {
	var u model.User
	if err := f.db.First(&u, id).Error; err != nil {
		return model.AcademicInfo{}, err
	}
	p, err := accountprofile.Resolve(f.db.WithContext(ctx), u, f.now)
	return model.AcademicInfo{RealName: p.RealName, StudentID: p.StudentID, College: p.College, Grade: p.Grade, Campus: u.Campus, Gender: u.Gender}, err
}

func TestMariaDBAISalonNeverMutatesAccountAndSupportsNonstudents(t *testing.T) {
	f := newFixture(t, 4)
	ctx := context.Background()
	s := f.service
	e := f.event(t, 1)
	// A real team identity and a group membership must survive every salon action.
	if _, err := f.setProfile(f.users[0].ID, profile(0)); err != nil {
		t.Fatal(err)
	}
	if err := f.db.Model(&model.User{}).Where("id = ?", f.users[0].ID).Updates(map[string]any{"team_identity_status": "formal_member", "phone": "legacy-phone"}).Error; err != nil {
		t.Fatal(err)
	}
	group := model.UserGroup{Name: fmt.Sprintf("salon-identity-%d", time.Now().UnixNano()), Status: 1}
	if err := f.db.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	member := model.UserGroupMember{GroupID: group.ID, UserID: f.users[0].ID, Role: model.UserGroupMemberRoleLeader}
	if err := f.db.Create(&member).Error; err != nil {
		t.Fatal(err)
	}
	defer func() { f.db.Delete(&member); f.db.Delete(&group) }()
	var before model.User
	f.db.First(&before, f.users[0].ID)
	snapshot := func() string {
		var u model.User
		f.db.First(&u, before.ID)
		var members []model.UserGroupMember
		f.db.Where("user_id = ?", u.ID).Find(&members)
		b, _ := json.Marshal(map[string]any{"user": u, "studentId": u.StudentID, "college": u.College, "grade": u.Grade, "campus": u.Campus, "isStudent": u.IsStudent, "members": members})
		return string(b)
	}
	unchanged := snapshot()
	for i := 1; i < 3; i++ {
		if err := f.db.Model(&model.User{}).Where("id = ?", f.users[i].ID).Update("is_student", false).Error; err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Register(ctx, e.ID, before.ID); err != nil {
		t.Fatal(err)
	}
	for i := 1; i < 3; i++ {
		r, err := s.Register(ctx, e.ID, f.users[i].ID)
		if err != nil || r.Status != Waitlisted || r.ActiveStudentID != nil || r.IsStudent == nil || *r.IsStudent {
			t.Fatalf("nonstudent queue: %+v %v", r, err)
		}
	}
	if _, err := s.Register(ctx, e.ID, before.ID); err == nil {
		t.Fatal("duplicate accepted")
	}
	if _, err := s.Register(ctx, e.ID, f.users[3].ID); err == nil {
		t.Fatal("missing profile accepted")
	}
	if err := s.Cancel(ctx, e.ID, before.ID); err != nil {
		t.Fatal(err)
	}
	if snapshot() != unchanged {
		t.Fatal("registration or cancellation mutated account")
	}
	if _, err := s.Register(ctx, e.ID, before.ID); err != nil {
		t.Fatal(err)
	}
	e.Capacity = 3
	if _, err := s.SaveEvent(ctx, e.ID, e); err != nil {
		t.Fatal(err)
	}
	f.now = e.StartAt
	if err := s.CheckIn(ctx, e.ID, before.ID); err != nil {
		t.Fatal(err)
	}
	if snapshot() != unchanged {
		t.Fatal("promotion/check-in mutated account")
	}
	var groupCount int64
	f.db.Model(&model.UserGroupMember{}).Where("user_id = ?", before.ID).Count(&groupCount)
	if groupCount != 1 {
		t.Fatal("salon changed group membership")
	}
	// A later account edit cannot change earlier snapshots.
	if err := f.db.Model(&model.User{}).Where("id = ?", before.ID).Updates(map[string]any{"real_name": "修改姓名", "college": "修改学院", "email": fmt.Sprintf("edited-%d@tarsgo.test", before.ID)}).Error; err != nil {
		t.Fatal(err)
	}
	rows, err := s.Mine(ctx, before.ID)
	if err != nil || len(rows) != 2 {
		t.Fatalf("history %v %v", rows, err)
	}
	for _, r := range rows {
		if r.RealName != "测试同学" || r.Email != before.Email || r.College != "自定义学院" {
			t.Fatalf("snapshot changed: %+v", r)
		}
	}
}
