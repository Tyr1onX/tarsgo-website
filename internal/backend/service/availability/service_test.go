package availability

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
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
		if allowed[s.UserID] {
			result = append(result, s)
		}
	}
	return result, nil
}
func (r *fakeRepo) Semesters(_ context.Context, groupID uint64) ([]string, error) {
	if groupID == 1 {
		return []string{"2026秋", "2026春"}, nil
	}
	return []string{"2027春"}, nil
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
			sheet(10, "2026秋", []timetable.Course{validCourse(1, 2, 4, []int{3, 5, 7}, "odd")}, []timetable.Note{}),
			sheet(11, "2026秋", []timetable.Course{validCourse(1, 1, 2, []int{3, 5, 7}, "even")}, []timetable.Note{{Name: "不定时课程", Reason: "时间未确定"}}),
			sheet(12, "2026秋", []timetable.Course{validCourse(1, 3, 4, []int{3, 4, 5}, "all")}, []timetable.Note{}),
			sheet(13, "2026春", []timetable.Course{validCourse(1, 1, 2, []int{1}, "all")}, []timetable.Note{}),
			sheet(15, "2026秋", []timetable.Course{
				validCourse(1, 1, 2, []int{4}, "all"),   // original rescheduled class removed from third week
				validCourse(4, 11, 12, []int{6}, "all"), // one-off moved class
			}, []timetable.Note{}),
			{UserID: 16, Semester: "2026秋", CoursesJSON: "not-json", NotesJSON: "[]"},
			sheet(20, "2026秋", []timetable.Course{validCourse(1, 1, 2, []int{3}, "all")}, []timetable.Note{}),
		},
	}
}
func query(weekday, start, end, week int) Filter {
	return Filter{GroupID: 1, Semester: "2026秋", Week: week, Weekday: weekday, StartSection: start, EndSection: end}
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
				t.Fatalf("imported=%d want4", got.ImportedCount)
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
			if byID[13].MissingReason != "semester_mismatch" || byID[14].MissingReason != "not_imported" || byID[16].MissingReason != "invalid_data" {
				t.Fatalf("missing classifications %+v", byID)
			}
			if _, ok := byID[20]; ok {
				t.Fatal("cross-group member leaked")
			}
		})
	}
}
func TestGroupScopeRejectsBeforeRosterRead(t *testing.T) {
	for _, actor := range []Actor{{UserID: 8, Role: model.RoleNameUser}, {UserID: 7, Role: model.RoleNameAdmin}} {
		repo := buildRepo()
		filter := query(1, 1, 2, 3)
		filter.GroupID = 2
		_, err := NewService(repo).Analyze(context.Background(), actor, filter)
		var failure *Error
		if !errors.As(err, &failure) || failure.Status != http.StatusForbidden {
			t.Fatalf("want forbidden for %v got %v", actor, err)
		}
		if repo.membersCalled != 0 || repo.timetablesCalled != 0 {
			t.Fatalf("unauthorized query loaded members: %+v", repo)
		}
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
		{GroupID: 1, Semester: "", Week: 1, Weekday: 1, StartSection: 1, EndSection: 2},
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
	if err != nil || len(options.Groups) != 1 || len(options.Groups[0].Semesters) != 2 {
		t.Fatalf("admin options %+v %v", options, err)
	}
	options, err = NewService(r).Options(context.Background(), Actor{UserID: 1, Role: model.RoleNameSuperAdmin})
	if err != nil || len(options.Groups) != 2 {
		t.Fatalf("super options %+v %v", options, err)
	}
	_, err = NewService(r).Options(context.Background(), Actor{UserID: 8, Role: model.RoleNameUser})
	var failure *Error
	if !errors.As(err, &failure) || failure.Status != 403 {
		t.Fatalf("user options disclosed: %v", err)
	}
}
