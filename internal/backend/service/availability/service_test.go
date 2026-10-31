package availability

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"

	"tarsgo-backend/model"
	"tarsgo-backend/service/timetable"
)

type fakeRepo struct {
	groups           []Group
	members          map[uint64][]model.UserGroupMember
	sheets           []model.Timetable
	membersCalled    int
	timetablesCalled int
	lastIDs          []uint64
	err              error
}

func (r *fakeRepo) Groups(_ context.Context, actor Actor) ([]Group, error) {
	if r.err != nil {
		return nil, r.err
	}
	if actor.Role == model.RoleNameSuperAdmin {
		return r.groups, nil
	}
	if actor.UserID == 7 {
		return r.groups[:1], nil
	}
	return []Group{}, nil
}
func (r *fakeRepo) AllGroups(_ context.Context) ([]Group, error) {
	if r.err != nil {
		return nil, r.err
	}
	return r.groups, nil
}
func (r *fakeRepo) Members(_ context.Context, groupID uint64) ([]model.UserGroupMember, error) {
	r.membersCalled++
	return r.members[groupID], nil
}
func (r *fakeRepo) Timetables(_ context.Context, ids []uint64) ([]model.Timetable, error) {
	r.timetablesCalled++
	r.lastIDs = ids
	result := []model.Timetable{}
	allowed := map[uint64]bool{}
	for _, id := range ids {
		allowed[id] = true
	}
	for _, s := range r.sheets {
		if allowed[s.UserID] && s.Semester == timetable.CurrentSemester {
			result = append(result, s)
		}
	}
	return result, nil
}
func roster(id uint64, name string) model.UserGroupMember {
	return model.UserGroupMember{UserID: id, User: model.User{ID: id, Name: name}}
}
func sheet(id uint64, term string, courses []timetable.Course, notes []timetable.Note) model.Timetable {
	c, _ := json.Marshal(courses)
	n, _ := json.Marshal(notes)
	return model.Timetable{UserID: id, Semester: term, CoursesJSON: string(c), NotesJSON: string(n)}
}
func validCourse(weekday, start, end int, weeks []int, parity string) timetable.Course {
	return timetable.Course{Name: "实验课", Weekday: weekday, StartSection: start, EndSection: end, Weeks: weeks, Parity: parity}
}
func buildRepo() *fakeRepo {
	return &fakeRepo{
		groups: []Group{{GroupID: 1, Name: "机械组"}, {GroupID: 2, Name: "视觉组"}},
		members: map[uint64][]model.UserGroupMember{
			1: {roster(10, "甲"), roster(11, "乙"), roster(12, "丙"), roster(13, "丁"), roster(14, "戊"), roster(15, "己"), roster(16, "庚")},
			2: {roster(20, "别组成员")},
		},
		sheets: []model.Timetable{
			sheet(10, timetable.CurrentSemester, []timetable.Course{validCourse(1, 2, 4, []int{3, 5, 7}, "odd")}, []timetable.Note{}),
			sheet(11, timetable.CurrentSemester, []timetable.Course{validCourse(1, 1, 2, []int{3, 5, 7}, "even")}, []timetable.Note{{Name: "不定时课程", Reason: "时间未确定"}}),
			sheet(12, timetable.CurrentSemester, []timetable.Course{validCourse(1, 3, 4, []int{3, 4, 5}, "all")}, []timetable.Note{}),
			sheet(13, "2026春", []timetable.Course{validCourse(1, 1, 2, []int{1}, "all")}, []timetable.Note{}),
			sheet(15, timetable.CurrentSemester, []timetable.Course{
				validCourse(1, 1, 2, []int{4}, "all"),   // original rescheduled class removed from third week
				validCourse(4, 11, 12, []int{6}, "all"), // one-off moved class
			}, []timetable.Note{}),
			{UserID: 16, Semester: timetable.CurrentSemester, CoursesJSON: "not-json", NotesJSON: "[]"},
			sheet(20, timetable.CurrentSemester, []timetable.Course{validCourse(1, 1, 2, []int{3}, "all")}, []timetable.Note{}),
		},
	}
}
func query(weekday, start, end, week int) Filter {
	return Filter{GroupID: 1, Week: week, Weekday: weekday, StartSection: start, EndSection: end}
}
func TestWholeIntervalWeeksParityRescheduleAndMissing(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name                                string
		filter                              Filter
		wantFree, wantConflict, wantMissing int
	}{
		{"middle and ending sections both count", query(1, 3, 5, 3), 2, 2, 3},
		{"even week ignores odd-only course", query(1, 3, 5, 4), 3, 1, 3},
		{"odd class active in fifth week", query(1, 2, 2, 5), 3, 1, 3},
		{"rescheduled source is absent in week three", query(1, 1, 2, 3), 3, 1, 3},
		{"moved target occupies week six", query(4, 11, 12, 6), 3, 1, 3},
		{"other weekday has no course", query(7, 1, 24, 3), 4, 0, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := buildRepo()
			s := NewService(r)
			got, err := s.Analyze(ctx, Actor{UserID: 7, Role: model.RoleNameAdmin}, tt.filter)
			if err != nil {
				t.Fatal(err)
			}
			if got.FreeCount != tt.wantFree || got.ConflictCount != tt.wantConflict || got.MissingCount != tt.wantMissing || got.TotalCount != 7 {
				t.Fatalf("counts free=%d conflict=%d missing=%d total=%d", got.FreeCount, got.ConflictCount, got.MissingCount, got.TotalCount)
			}
			if got.ImportedCount != 4 {
				t.Fatalf("imported=%d want4 valid timetables including one with undetermined courses", got.ImportedCount)
			}
			if !reflect.DeepEqual(r.lastIDs, []uint64{10, 11, 12, 13, 14, 15, 16}) {
				t.Fatalf("unscoped query IDs: %v", r.lastIDs)
			}
			byID := map[uint64]Member{}
			for _, m := range got.Members {
				byID[m.UserID] = m
			}
			if byID[11].UncertainCourseCount != 1 || !byID[11].HasUncertainCourses {
				t.Fatalf("undetermined course lost: %+v", byID[11])
			}
			if byID[11].Status != "free" || byID[11].MissingReason != "" {
				t.Fatalf("undetermined courses affected the valid grid timetable: %+v", byID[11])
			}
			if byID[13].MissingReason != "not_imported" || byID[14].MissingReason != "not_imported" || byID[16].MissingReason != "invalid_data" {
				t.Fatalf("missing classifications %+v", byID)
			}
			if _, ok := byID[20]; ok {
				t.Fatal("cross-group member leaked")
			}
		})
	}
}

func TestOneValidTimetableWithUndeterminedCoursesCountsWithinTwentyTwoMembers(t *testing.T) {
	repo := &fakeRepo{
		groups:  []Group{{GroupID: 1, Name: "运营组"}},
		members: map[uint64][]model.UserGroupMember{1: {}},
		sheets: []model.Timetable{
			sheet(101, timetable.CurrentSemester, []timetable.Course{validCourse(1, 1, 2, []int{3}, "all")}, []timetable.Note{{Name: "不定时课程", Reason: "时间未确定"}}),
		},
	}
	for id := uint64(101); id <= 122; id++ {
		repo.members[1] = append(repo.members[1], roster(id, "成员"))
	}
	service := NewService(repo)
	actor := Actor{UserID: 7, Role: model.RoleNameAdmin}

	conflict, err := service.Analyze(context.Background(), actor, query(1, 1, 2, 3))
	if err != nil {
		t.Fatal(err)
	}
	if conflict.TotalCount != 22 || conflict.ImportedCount != 1 || conflict.MissingCount != 21 || conflict.ConflictCount != 1 || conflict.FreeCount != 0 {
		t.Fatalf("grid-class slot counts = imported:%d missing:%d conflict:%d free:%d total:%d", conflict.ImportedCount, conflict.MissingCount, conflict.ConflictCount, conflict.FreeCount, conflict.TotalCount)
	}
	free, err := service.Analyze(context.Background(), actor, query(1, 3, 4, 3))
	if err != nil {
		t.Fatal(err)
	}
	if free.TotalCount != 22 || free.ImportedCount != 1 || free.MissingCount != 21 || free.ConflictCount != 0 || free.FreeCount != 1 {
		t.Fatalf("grid-free slot counts = imported:%d missing:%d conflict:%d free:%d total:%d", free.ImportedCount, free.MissingCount, free.ConflictCount, free.FreeCount, free.TotalCount)
	}
	for _, result := range []*Result{conflict, free} {
		for _, member := range result.Members {
			if member.UserID == 101 {
				if member.MissingReason != "" || !member.HasUncertainCourses || member.UncertainCourseCount != 1 {
					t.Fatalf("valid timetable with undetermined courses was misclassified: %+v", member)
				}
			}
		}
	}
}

func TestEmptyStoredTimetableIsMissingInsteadOfDefaultingToFree(t *testing.T) {
	repo := &fakeRepo{
		groups:  []Group{{GroupID: 1, Name: "运营组"}},
		members: map[uint64][]model.UserGroupMember{1: {roster(31, "成员")}},
		sheets:  []model.Timetable{sheet(31, timetable.CurrentSemester, []timetable.Course{}, []timetable.Note{})},
	}
	result, err := NewService(repo).Analyze(context.Background(), Actor{UserID: 7, Role: model.RoleNameAdmin}, query(1, 1, 2, 3))
	if err != nil {
		t.Fatal(err)
	}
	if result.ImportedCount != 0 || result.MissingCount != 1 || result.Members[0].MissingReason != "invalid_data" || result.FreeCount != 0 {
		t.Fatalf("empty stored row was treated as reliable free time: %+v", result)
	}
}

func TestOrdinaryAdminCanReadAnotherGroupOnlyThroughAvailability(t *testing.T) {
	repo := buildRepo()
	filter := query(1, 1, 2, 3)
	filter.GroupID = 2
	result, err := NewService(repo).Analyze(context.Background(), Actor{UserID: 7, Role: model.RoleNameAdmin}, filter)
	if err != nil || result.GroupName != "视觉组" || result.TotalCount != 1 || result.Members[0].UserID != 20 {
		t.Fatalf("ordinary admin could not read cross-group availability: result=%+v err=%v", result, err)
	}

	repo = buildRepo()
	_, err = NewService(repo).Analyze(context.Background(), Actor{UserID: 8, Role: model.RoleNameUser}, filter)
	var failure *Error
	if !errors.As(err, &failure) || failure.Status != http.StatusForbidden {
		t.Fatalf("ordinary member availability status = %v, want forbidden", err)
	}
	if repo.membersCalled != 0 || repo.timetablesCalled != 0 {
		t.Fatalf("non-admin query loaded members: %+v", repo)
	}
}
func TestSuperAdminCanSeeAnotherGroupButOnlyItsRoster(t *testing.T) {
	repo := buildRepo()
	f := query(1, 1, 2, 3)
	f.GroupID = 2
	result, err := NewService(repo).Analyze(context.Background(), Actor{UserID: 3, Role: model.RoleNameSuperAdmin}, f)
	if err != nil {
		t.Fatal(err)
	}
	if result.TotalCount != 1 || result.ConflictCount != 1 || result.Members[0].UserID != 20 {
		t.Fatalf("wrong group result %+v", result)
	}
	if !reflect.DeepEqual(repo.lastIDs, []uint64{20}) {
		t.Fatalf("unsafe IDs %v", repo.lastIDs)
	}
}
func TestInvalidFilterRejectedAndNoSQL(t *testing.T) {
	inputs := []Filter{
		query(1, 4, 3, 3), query(0, 1, 2, 3), query(8, 1, 2, 3), query(1, 0, 2, 3), query(1, 1, 25, 3), query(1, 1, 2, 0), query(1, 1, 2, 31),
	}
	for _, input := range inputs {
		repo := buildRepo()
		_, err := NewService(repo).Analyze(context.Background(), Actor{UserID: 7, Role: model.RoleNameAdmin}, input)
		var failure *Error
		if !errors.As(err, &failure) || failure.Status != 400 {
			t.Fatalf("input %#v unexpected %v", input, err)
		}
		if repo.membersCalled != 0 {
			t.Fatalf("invalid query reached member records")
		}
	}
}
func TestOptionsRespectManagerAndSuperAdmin(t *testing.T) {
	r := buildRepo()
	options, err := NewService(r).Options(context.Background(), Actor{UserID: 7, Role: model.RoleNameAdmin})
	if err != nil || len(options.Groups) != 2 || options.DefaultGroupID != 1 || options.CurrentSemester != timetable.CurrentSemester || options.FirstWeekStart != timetable.CurrentFirstWeekStart || options.TeachingWeekCount != timetable.CurrentTeachingWeekCount {
		t.Fatalf("admin options %+v %v", options, err)
	}
	options, err = NewService(r).Options(context.Background(), Actor{UserID: 1, Role: model.RoleNameSuperAdmin})
	if err != nil || len(options.Groups) != 2 || options.DefaultGroupID != 0 || options.CurrentSemester != timetable.CurrentSemester {
		t.Fatalf("super options %+v %v", options, err)
	}
	_, err = NewService(r).Options(context.Background(), Actor{UserID: 8, Role: model.RoleNameUser})
	var failure *Error
	if !errors.As(err, &failure) || failure.Status != 403 {
		t.Fatalf("user options disclosed: %v", err)
	}
}

func TestAllMembersDeduplicateUsersAndKeepMissingTimetablesOutOfFreeCounts(t *testing.T) {
	repo := &fakeRepo{
		groups: []Group{{GroupID: 1, Name: "机械组"}, {GroupID: 2, Name: "视觉组"}},
		members: map[uint64][]model.UserGroupMember{
			1: {roster(1, "兼任成员"), roster(2, "未导入成员"), roster(3, "无效成员")},
			2: {roster(1, "重复成员"), roster(4, "冲突成员")},
		},
		sheets: []model.Timetable{
			sheet(1, timetable.CurrentSemester, []timetable.Course{validCourse(2, 4, 5, []int{3}, "all")}, []timetable.Note{}),
			{UserID: 3, Semester: timetable.CurrentSemester, CoursesJSON: "invalid", NotesJSON: "[]"},
			sheet(4, timetable.CurrentSemester, []timetable.Course{validCourse(2, 4, 5, []int{3}, "all")}, []timetable.Note{}),
		},
	}
	result, err := NewService(repo).Analyze(context.Background(), Actor{UserID: 7, Role: model.RoleNameAdmin}, Filter{
		GroupID: 0, Week: 3, Weekday: 2, StartSection: 4, EndSection: 4,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.GroupName != "全部成员" || result.TotalCount != 4 || result.ImportedCount != 2 || result.MissingCount != 2 ||
		result.FreeCount != 0 || result.ConflictCount != 2 {
		t.Fatalf("global availability counts are incorrect: %+v", result)
	}
	if !reflect.DeepEqual(repo.lastIDs, []uint64{1, 2, 3, 4}) {
		t.Fatalf("global timetable IDs were not unique: %v", repo.lastIDs)
	}
	if len(result.Members) != 4 {
		t.Fatalf("duplicate memberships produced %d members, want 4", len(result.Members))
	}
	byID := map[uint64]Member{}
	for _, member := range result.Members {
		byID[member.UserID] = member
	}
	if byID[2].MissingReason != "not_imported" || byID[3].MissingReason != "invalid_data" {
		t.Fatalf("missing timetable reasons were not preserved: %+v", byID)
	}
}
func TestWeekOccupancySingleScopedReadAndPrivacy(t *testing.T) {
	repo := buildRepo()
	week, err := NewService(repo).AnalyzeWeek(context.Background(), Actor{UserID: 7, Role: model.RoleNameAdmin}, query(1, 1, 1, 6))
	if err != nil {
		t.Fatal(err)
	}
	if repo.membersCalled != 1 || repo.timetablesCalled != 1 || week.TotalCount != 7 || week.ImportedCount != 4 || week.MissingCount != 3 {
		t.Fatalf("unexpected scoped week fetch: members=%d tables=%d result=%+v", repo.membersCalled, repo.timetablesCalled, week)
	}
	if !reflect.DeepEqual(repo.lastIDs, []uint64{10, 11, 12, 13, 14, 15, 16}) {
		t.Fatalf("unsafe roster: %v", repo.lastIDs)
	}
	byID := map[uint64]WeekMember{}
	for _, member := range week.Members {
		byID[member.UserID] = member
	}
	if len(byID[10].Occupied) != 0 {
		t.Fatalf("odd-only course leaked into even week: %+v", byID[10])
	}
	if !reflect.DeepEqual(byID[15].Occupied, []Slot{{Weekday: 4, StartSection: 11, EndSection: 12}}) {
		t.Fatalf("moved class not applied: %+v", byID[15])
	}
	if byID[11].MissingReason != "" {
		t.Fatalf("course with an undetermined time made the grid timetable missing: %+v", byID[11])
	}
	if byID[13].MissingReason != "not_imported" || byID[14].MissingReason != "not_imported" || byID[16].MissingReason != "invalid_data" {
		t.Fatalf("missing users treated as free: %+v", byID)
	}
	if byID[11].UncertainCourseCount != 1 {
		t.Fatalf("missing uncertainty warning: %+v", byID[11])
	}
	payload, err := json.Marshal(week)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "实验课") || strings.Contains(string(payload), "别组成员") || strings.Contains(string(payload), "不定时课程") {
		t.Fatalf("private course or cross-group data disclosed: %s", payload)
	}
}

func TestExpandedWeeksAndCrossSectionOccupancyInAvailability(t *testing.T) {
	courses := []timetable.Course{
		validCourse(1, 5, 8, []int{7, 13}, "all"),
		validCourse(1, 5, 8, []int{7, 13}, "all"), // repeated merged-grid record
		validCourse(2, 9, 11, []int{7, 8, 9, 10, 11}, "all"),
		validCourse(3, 9, 12, []int{7}, "all"),
	}
	repo := &fakeRepo{
		groups:  []Group{{GroupID: 1, Name: "测试组"}},
		members: map[uint64][]model.UserGroupMember{1: {roster(40, "成员")}},
		sheets:  []model.Timetable{sheet(40, timetable.CurrentSemester, courses, []timetable.Note{})},
	}
	service := NewService(repo)
	actor := Actor{UserID: 7, Role: model.RoleNameAdmin}
	week, err := service.AnalyzeWeek(context.Background(), actor, Filter{GroupID: 1, Week: 7})
	if err != nil {
		t.Fatal(err)
	}
	if len(week.Members) != 1 || !reflect.DeepEqual(week.Members[0].Occupied, []Slot{
		{Weekday: 1, StartSection: 5, EndSection: 8},
		{Weekday: 2, StartSection: 9, EndSection: 11},
		{Weekday: 3, StartSection: 9, EndSection: 12},
	}) {
		t.Fatalf("week-seven occupancy = %+v", week.Members)
	}

	queries := []struct {
		filter       Filter
		wantConflict int
		wantFree     int
	}{
		{query(1, 8, 8, 7), 1, 0},
		{query(2, 11, 11, 7), 1, 0},
		{query(3, 12, 12, 7), 1, 0},
		{query(1, 5, 8, 8), 0, 1}, // week eight is outside the disjoint {7,13} weeks
	}
	for _, tt := range queries {
		result, err := service.Analyze(context.Background(), actor, tt.filter)
		if err != nil {
			t.Fatal(err)
		}
		if result.ConflictCount != tt.wantConflict || result.FreeCount != tt.wantFree {
			t.Fatalf("query %+v: conflict=%d free=%d, want conflict=%d free=%d", tt.filter, result.ConflictCount, result.FreeCount, tt.wantConflict, tt.wantFree)
		}
	}
}

func TestSuppliedRealTimetablesMatchAdminAvailability(t *testing.T) {
	paths := []string{
		os.Getenv("TARSGO_TIMETABLE_SAMPLE_1"),
		os.Getenv("TARSGO_TIMETABLE_SAMPLE_2"),
		os.Getenv("TARSGO_TIMETABLE_SAMPLE_3"),
	}
	provided := 0
	for _, path := range paths {
		if path != "" {
			provided++
		}
	}
	if provided == 0 {
		t.Skip("set all three TARSGO_TIMETABLE_SAMPLE_n paths to run the supplied-file availability regression")
	}
	if provided != len(paths) {
		t.Fatal("all three supplied timetable sample paths are required")
	}

	for index, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("sample %d could not be read", index+1)
		}
		courses, notes, err := timetable.ParseXLSX(data)
		if err != nil {
			t.Fatalf("sample %d did not parse completely", index+1)
		}
		userID := uint64(100 + index)
		repo := &fakeRepo{
			groups:  []Group{{GroupID: 1, Name: "回归组"}},
			members: map[uint64][]model.UserGroupMember{1: {roster(userID, "回归成员")}},
			sheets:  []model.Timetable{sheet(userID, timetable.CurrentSemester, courses, notes)},
		}
		service := NewService(repo)
		actor := Actor{UserID: 7, Role: model.RoleNameAdmin}
		expectedByWeek := map[int]map[Slot]bool{}
		for _, course := range courses {
			for _, week := range course.Weeks {
				slot := Slot{Weekday: course.Weekday, StartSection: course.StartSection, EndSection: course.EndSection}
				if expectedByWeek[week] == nil {
					expectedByWeek[week] = map[Slot]bool{}
				}
				expectedByWeek[week][slot] = true
			}
		}

		for week := 1; week <= timetable.CurrentTeachingWeekCount; week++ {
			result, err := service.AnalyzeWeek(context.Background(), actor, Filter{GroupID: 1, Week: week})
			if err != nil {
				t.Fatalf("sample %d week %d availability analysis failed", index+1, week)
			}
			if result.ImportedCount != 1 || result.MissingCount != 0 || len(result.Members) != 1 {
				t.Fatalf("sample %d week %d was not counted as one imported timetable: %+v", index+1, week, result)
			}
			got := append([]Slot{}, result.Members[0].Occupied...)
			want := make([]Slot, 0, len(expectedByWeek[week]))
			for slot := range expectedByWeek[week] {
				want = append(want, slot)
			}
			sortSlots(got)
			sortSlots(want)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("sample %d week %d occupied slots differ from parsed records", index+1, week)
			}
			for _, slot := range want {
				stats, err := service.Analyze(context.Background(), actor, Filter{
					GroupID: 1, Week: week, Weekday: slot.Weekday,
					StartSection: slot.StartSection, EndSection: slot.EndSection,
				})
				if err != nil || stats.ConflictCount != 1 || stats.FreeCount != 0 || stats.MissingCount != 0 {
					t.Fatalf("sample %d week %d slot %d %d-%d has inconsistent availability stats", index+1, week, slot.Weekday, slot.StartSection, slot.EndSection)
				}
			}
		}
	}
}

func sortSlots(slots []Slot) {
	sort.Slice(slots, func(i, j int) bool {
		if slots[i].Weekday != slots[j].Weekday {
			return slots[i].Weekday < slots[j].Weekday
		}
		if slots[i].StartSection != slots[j].StartSection {
			return slots[i].StartSection < slots[j].StartSection
		}
		return slots[i].EndSection < slots[j].EndSection
	})
}

func TestWeekGroupPermissionsAndValidation(t *testing.T) {
	for _, actor := range []Actor{{UserID: 8, Role: model.RoleNameUser}} {
		repo := buildRepo()
		input := query(1, 1, 1, 3)
		input.GroupID = 2
		_, err := NewService(repo).AnalyzeWeek(context.Background(), actor, input)
		var failure *Error
		if !errors.As(err, &failure) || failure.Status != http.StatusForbidden || repo.membersCalled != 0 {
			t.Fatalf("unauthorized week query: %v calls=%d", err, repo.membersCalled)
		}
	}
	repo := buildRepo()
	input := query(1, 1, 1, 0)
	_, err := NewService(repo).AnalyzeWeek(context.Background(), Actor{UserID: 7, Role: model.RoleNameAdmin}, input)
	var failure *Error
	if !errors.As(err, &failure) || failure.Status != http.StatusBadRequest || repo.membersCalled != 0 {
		t.Fatalf("invalid week query: %v calls=%d", err, repo.membersCalled)
	}
}
