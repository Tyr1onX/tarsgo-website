package availability

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"tarsgo-backend/model"
	"tarsgo-backend/service/timetable"
)

type Error struct {
	Status  int
	Message string
	Err     error
}

func (e *Error) Error() string     { return e.Message }
func (e *Error) Unwrap() error     { return e.Err }
func invalid(message string) error { return &Error{Status: http.StatusBadRequest, Message: message} }
func forbidden() error {
	return &Error{Status: http.StatusForbidden, Message: "无权查看该组别的课表统计"}
}
func internal(message string, err error) error {
	return &Error{Status: http.StatusInternalServerError, Message: message, Err: err}
}

type Actor struct {
	UserID uint64
	Role   string
}
type Group struct {
	GroupID uint64 `json:"groupId" gorm:"column:group_id"`
	Name    string `json:"name"`
}
type Options struct {
	Groups            []Group `json:"groups"`
	CurrentSemester   string  `json:"currentSemester"`
	FirstWeekStart    string  `json:"firstWeekStart"`
	TeachingWeekCount int     `json:"teachingWeekCount"`
}
type Filter struct {
	GroupID      uint64
	Week         int
	Weekday      int
	StartSection int
	EndSection   int
}
type Member struct {
	UserID               uint64 `json:"userId"`
	Name                 string `json:"name"`
	Status               string `json:"status"`
	MissingReason        string `json:"missingReason,omitempty"`
	HasUncertainCourses  bool   `json:"hasUncertainCourses"`
	UncertainCourseCount int    `json:"uncertainCourseCount"`
}
type Result struct {
	GroupID       uint64   `json:"groupId"`
	GroupName     string   `json:"groupName"`
	Semester      string   `json:"semester"`
	Week          int      `json:"week"`
	Weekday       int      `json:"weekday"`
	StartSection  int      `json:"startSection"`
	EndSection    int      `json:"endSection"`
	TotalCount    int      `json:"totalCount"`
	ImportedCount int      `json:"importedCount"`
	FreeCount     int      `json:"freeCount"`
	ConflictCount int      `json:"conflictCount"`
	MissingCount  int      `json:"missingCount"`
	Members       []Member `json:"members"`
}
type Repository interface {
	Groups(ctx context.Context, actor Actor) ([]Group, error)
	Members(ctx context.Context, groupID uint64) ([]model.UserGroupMember, error)
	Timetables(ctx context.Context, ids []uint64) ([]model.Timetable, error)
}
type Service struct{ repo Repository }

func NewService(repo Repository) *Service { return &Service{repo: repo} }

func (s *Service) Options(ctx context.Context, actor Actor) (*Options, error) {
	if !canManage(actor) {
		return nil, forbidden()
	}
	groups, err := s.repo.Groups(ctx, actor)
	if err != nil {
		return nil, internal("读取可管理组别失败", err)
	}
	if groups == nil {
		groups = []Group{}
	}
	return &Options{
		Groups: groups, CurrentSemester: timetable.CurrentSemester,
		FirstWeekStart: timetable.CurrentFirstWeekStart, TeachingWeekCount: timetable.CurrentTeachingWeekCount,
	}, nil
}

type Slot struct {
	Weekday      int `json:"weekday"`
	StartSection int `json:"startSection"`
	EndSection   int `json:"endSection"`
}
type WeekMember struct {
	UserID               uint64 `json:"userId"`
	Name                 string `json:"name"`
	MissingReason        string `json:"missingReason,omitempty"`
	HasUncertainCourses  bool   `json:"hasUncertainCourses"`
	UncertainCourseCount int    `json:"uncertainCourseCount"`
	Occupied             []Slot `json:"occupied"`
}
type WeekResult struct {
	GroupID       uint64       `json:"groupId"`
	GroupName     string       `json:"groupName"`
	Semester      string       `json:"semester"`
	Week          int          `json:"week"`
	TotalCount    int          `json:"totalCount"`
	ImportedCount int          `json:"importedCount"`
	MissingCount  int          `json:"missingCount"`
	Members       []WeekMember `json:"members"`
}

// AnalyzeWeek reads only the authorized group's roster and timetables once.
// No course names, locations or private notes are returned.
func (s *Service) AnalyzeWeek(ctx context.Context, actor Actor, f Filter) (*WeekResult, error) {
	if !canManage(actor) {
		return nil, forbidden()
	}
	if f.GroupID == 0 || f.Week < 1 || f.Week > timetable.CurrentTeachingWeekCount {
		return nil, invalid("请选择有效的组别和当前教学周")
	}
	groups, err := s.repo.Groups(ctx, actor)
	if err != nil {
		return nil, internal("读取可管理组别失败", err)
	}
	var group *Group
	for i := range groups {
		if groups[i].GroupID == f.GroupID {
			group = &groups[i]
			break
		}
	}
	if group == nil {
		return nil, forbidden()
	}
	roster, err := s.repo.Members(ctx, f.GroupID)
	if err != nil {
		return nil, internal("读取本组成员失败", err)
	}
	ids := make([]uint64, 0, len(roster))
	seen := make(map[uint64]bool, len(roster))
	for _, person := range roster {
		if !seen[person.UserID] {
			ids = append(ids, person.UserID)
			seen[person.UserID] = true
		}
	}
	records := []model.Timetable{}
	if len(ids) > 0 {
		records, err = s.repo.Timetables(ctx, ids)
		if err != nil {
			return nil, internal("读取课表失败", err)
		}
	}
	stored := make(map[uint64]model.Timetable, len(ids))
	for _, record := range records {
		if !seen[record.UserID] || record.Semester != timetable.CurrentSemester {
			continue
		}
		stored[record.UserID] = record
	}
	result := &WeekResult{GroupID: group.GroupID, GroupName: group.Name, Semester: timetable.CurrentSemester, Week: f.Week, Members: []WeekMember{}}
	for _, person := range roster {
		if !seen[person.UserID] {
			continue
		}
		delete(seen, person.UserID)
		member := WeekMember{UserID: person.UserID, Name: displayName(person.User), Occupied: []Slot{}}
		sheet, ok := stored[person.UserID]
		if !ok {
			member.MissingReason = "not_imported"
		} else {
			courses := []timetable.Course{}
			notes := []timetable.Note{}
			coursesErr := json.Unmarshal([]byte(sheet.CoursesJSON), &courses)
			notesErr := json.Unmarshal([]byte(sheet.NotesJSON), &notes)
			validTimetable := coursesErr == nil && notesErr == nil && courses != nil && notes != nil &&
				(len(courses) > 0 || len(notes) > 0) && validCourses(courses) && validNotes(notes)
			if !validTimetable {
				member.MissingReason = "invalid_data"
			} else {
				member.HasUncertainCourses = len(notes) > 0
				member.UncertainCourseCount = len(notes)
				result.ImportedCount++
				occupiedSlots := map[Slot]struct{}{}
				for _, course := range courses {
					if !course.Active(f.Week) {
						continue
					}
					slot := Slot{Weekday: course.Weekday, StartSection: course.StartSection, EndSection: course.EndSection}
					if _, exists := occupiedSlots[slot]; !exists {
						occupiedSlots[slot] = struct{}{}
						member.Occupied = append(member.Occupied, slot)
					}
				}
			}
		}
		if member.MissingReason != "" {
			result.MissingCount++
		}
		result.Members = append(result.Members, member)
	}
	sort.SliceStable(result.Members, func(i, j int) bool {
		a, b := result.Members[i], result.Members[j]
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		return a.UserID < b.UserID
	})
	result.TotalCount = len(result.Members)
	return result, nil
}

func (s *Service) Analyze(ctx context.Context, actor Actor, f Filter) (*Result, error) {
	if !canManage(actor) {
		return nil, forbidden()
	}
	if f.Weekday < 1 || f.Weekday > 7 || f.StartSection < 1 || f.EndSection > 24 || f.StartSection > f.EndSection {
		return nil, invalid("请选择有效的星期和起止节次")
	}
	week, err := s.AnalyzeWeek(ctx, actor, f)
	if err != nil {
		return nil, err
	}
	result := &Result{GroupID: week.GroupID, GroupName: week.GroupName, Semester: week.Semester, Week: f.Week,
		Weekday: f.Weekday, StartSection: f.StartSection, EndSection: f.EndSection,
		TotalCount: week.TotalCount, ImportedCount: week.ImportedCount, MissingCount: week.MissingCount, Members: []Member{}}
	for _, person := range week.Members {
		member := Member{UserID: person.UserID, Name: person.Name, Status: "free", MissingReason: person.MissingReason,
			HasUncertainCourses: person.HasUncertainCourses, UncertainCourseCount: person.UncertainCourseCount}
		if member.MissingReason != "" {
			member.Status = "missing"
		} else {
			for _, slot := range person.Occupied {
				if slot.Weekday == f.Weekday && overlaps(slot.StartSection, slot.EndSection, f.StartSection, f.EndSection) {
					member.Status = "conflict"
					break
				}
			}
			if member.Status == "free" {
				result.FreeCount++
			} else {
				result.ConflictCount++
			}
		}
		result.Members = append(result.Members, member)
	}
	return result, nil
}

func canManage(actor Actor) bool {
	return actor.UserID > 0 && (actor.Role == model.RoleNameAdmin || actor.Role == model.RoleNameSuperAdmin)
}
func overlaps(courseStart, courseEnd, requestedStart, requestedEnd int) bool {
	return courseStart <= requestedEnd && courseEnd >= requestedStart
}
func validCourses(courses []timetable.Course) bool {
	for _, c := range courses {
		if c.Name == "" || c.Weekday < 1 || c.Weekday > 7 || c.StartSection < 1 || c.EndSection < c.StartSection || c.EndSection > 24 || len(c.Weeks) == 0 {
			return false
		}
		if c.Parity != "all" && c.Parity != "odd" && c.Parity != "even" {
			return false
		}
		for _, w := range c.Weeks {
			if w < 1 || w > 30 {
				return false
			}
		}
	}
	return true
}
func validNotes(notes []timetable.Note) bool {
	for _, note := range notes {
		if strings.TrimSpace(note.Name) == "" || strings.TrimSpace(note.Reason) == "" {
			return false
		}
	}
	return true
}
func displayName(u model.User) string {
	if name := u.PreferredName(); name != "" {
		return name
	}
	if name := strings.TrimSpace(u.Name); name != "" {
		return name
	}
	return fmt.Sprintf("成员 #%d", u.ID)
}

// Sort for deterministic output; no personal email or timetable details are returned.
func sortedNames(members []Member) {
	sort.SliceStable(members, func(i, j int) bool {
		if members[i].Name != members[j].Name {
			return members[i].Name < members[j].Name
		}
		return members[i].UserID < members[j].UserID
	})
}
