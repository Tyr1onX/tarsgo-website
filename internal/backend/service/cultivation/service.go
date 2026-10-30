package cultivation

import (
	"context"
	"errors"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
	"tarsgo-backend/service/capabilities"
	"tarsgo-backend/service/growth"
)

type Actor = capabilities.Actor

type CapabilityReader interface {
	AdminGroup(context.Context, capabilities.Actor, uint64) (*capabilities.AdminGroupView, error)
	AdminMember(context.Context, capabilities.Actor, uint64, uint64) (*capabilities.AdminMemberView, error)
}

type GrowthReader interface {
	GetMine(context.Context, uint64) (*growth.Profile, error)
}

type Service struct {
	db           *gorm.DB
	capabilities CapabilityReader
	growth       GrowthReader
	Now          func() time.Time
}

func NewService(db *gorm.DB, capabilityReader CapabilityReader, growthReader GrowthReader) *Service {
	return &Service{db: db, capabilities: capabilityReader, growth: growthReader, Now: time.Now}
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

func (e *ServiceError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *ServiceError) Unwrap() error { return e.Err }

func fail(status int, message string, err error) error {
	return &ServiceError{Status: status, Message: message, Err: err}
}

func mappedError(err error) error {
	var capabilityError *capabilities.ServiceError
	if errors.As(err, &capabilityError) {
		return fail(capabilityError.Status, capabilityError.Message, capabilityError.Err)
	}
	var growthError *growth.ServiceError
	if errors.As(err, &growthError) {
		return fail(growthError.Status, growthError.Message, growthError.Err)
	}
	return fail(http.StatusInternalServerError, "读取培养档案失败", err)
}

type MemberSummary struct {
	UserID           uint64                         `json:"userId"`
	DisplayName      string                         `json:"displayName"`
	GroupRole        string                         `json:"groupRole"`
	JoinedYear       int                            `json:"joinedYear"`
	Dimensions       []capabilities.DimensionResult `json:"dimensions"`
	OverallScore     *float64                       `json:"overallScore"`
	ScoredDimensions int                            `json:"scoredDimensions"`
	TotalDimensions  int                            `json:"totalDimensions"`
	Assignments      ActivitySummary                `json:"assignments"`
	PracticeProjects ActivitySummary                `json:"practiceProjects"`
	Focused          bool                           `json:"focused"`
	InternalNote     string                         `json:"internalNote,omitempty"`
	FocusUpdatedAt   *time.Time                     `json:"focusUpdatedAt,omitempty"`
	FocusUpdatedBy   string                         `json:"focusUpdatedBy,omitempty"`
}

type ActivitySummary struct {
	Total     int `json:"total"`
	Completed int `json:"completed"`
}

type GroupView struct {
	GroupID    uint64                   `json:"groupId"`
	GroupName  string                   `json:"groupName"`
	Dimensions []capabilities.Dimension `json:"dimensions"`
	Members    []MemberSummary          `json:"members"`
}

type MemberView struct {
	GroupID      uint64                         `json:"groupId"`
	GroupName    string                         `json:"groupName"`
	UserID       uint64                         `json:"userId"`
	DisplayName  string                         `json:"displayName"`
	GroupRole    string                         `json:"groupRole"`
	JoinedYear   int                            `json:"joinedYear"`
	Dimensions   []capabilities.DimensionResult `json:"dimensions"`
	OverallScore *float64                       `json:"overallScore"`
	Assignments  ActivitySummary                `json:"assignments"`
	Practice     ActivitySummary                `json:"practiceProjects"`
	Focused      bool                           `json:"focused"`
	InternalNote string                         `json:"internalNote,omitempty"`
	UpdatedAt    *time.Time                     `json:"focusUpdatedAt,omitempty"`
	UpdatedBy    string                         `json:"focusUpdatedBy,omitempty"`
	Events       []growth.Event                 `json:"events"`
}

type FocusInput struct {
	Focused      bool   `json:"focused"`
	InternalNote string `json:"internalNote"`
}

type memberRow struct {
	ID       uint64    `gorm:"column:id"`
	Name     string    `gorm:"column:name"`
	Nickname *string   `gorm:"column:nickname"`
	RealName *string   `gorm:"column:real_name"`
	Role     uint8     `gorm:"column:group_role"`
	JoinedAt time.Time `gorm:"column:joined_at"`
}

type assignmentRow struct {
	UserID       uint64     `gorm:"column:user_id"`
	AssignmentID uint64     `gorm:"column:assignment_id"`
	Attempt      *uint      `gorm:"column:attempt"`
	Decision     *string    `gorm:"column:decision"`
	ReviewedAt   *time.Time `gorm:"column:reviewed_at"`
	ReviewID     *uint64    `gorm:"column:review_id"`
}

type practiceRow struct {
	UserID     uint64     `gorm:"column:user_id"`
	ProjectID  uint64     `gorm:"column:project_id"`
	Attempt    *uint      `gorm:"column:attempt"`
	Score      *uint8     `gorm:"column:score"`
	Decision   *string    `gorm:"column:decision"`
	ReviewedAt *time.Time `gorm:"column:reviewed_at"`
}

func (s *Service) Group(ctx context.Context, actor Actor, groupID uint64) (*GroupView, error) {
	capabilityView, err := s.capabilities.AdminGroup(ctx, actor, groupID)
	if err != nil {
		return nil, mappedError(err)
	}
	var roster []memberRow
	if err := s.db.WithContext(ctx).Table("users").Select("users.id, users.name, users.nickname, users.real_name, user_group_members.role AS group_role, user_group_members.joined_at").
		Joins("JOIN user_group_members ON user_group_members.user_id = users.id").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Where("user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ?", groupID, model.UserGroupStatusActive, model.UserStatusEnabled).
		Order("user_group_members.role DESC, users.id ASC").Scan(&roster).Error; err != nil {
		return nil, fail(http.StatusInternalServerError, "读取组内成员失败", err)
	}
	metrics, err := s.activityMetrics(ctx, groupID, roster)
	if err != nil {
		return nil, err
	}
	focusRecords := make(map[uint64]model.MemberCultivationRecord)
	var focusRows []model.MemberCultivationRecord
	if err := s.db.WithContext(ctx).Where("group_id = ?", groupID).Find(&focusRows).Error; err != nil {
		return nil, fail(http.StatusInternalServerError, "读取内部培养记录失败", err)
	}
	for _, row := range focusRows {
		focusRecords[row.UserID] = row
	}
	memberDimensions := make(map[uint64][]capabilities.DimensionResult, len(capabilityView.Members))
	for _, member := range capabilityView.Members {
		memberDimensions[member.UserID] = member.Dimensions
	}
	activeDimensionCount := 0
	for _, dimension := range capabilityView.Dimensions {
		if dimension.Active {
			activeDimensionCount++
		}
	}
	result := &GroupView{GroupID: groupID, GroupName: capabilityView.GroupName, Dimensions: capabilityView.Dimensions, Members: make([]MemberSummary, 0, len(roster))}
	for _, row := range roster {
		dimensions := memberDimensions[row.ID]
		if dimensions == nil {
			dimensions = []capabilities.DimensionResult{}
		}
		member := MemberSummary{
			UserID: row.ID, DisplayName: memberName(row), GroupRole: groupRole(row.Role), JoinedYear: row.JoinedAt.Year(),
			Dimensions: dimensions, TotalDimensions: activeDimensionCount, Assignments: metrics[row.ID].assignments,
			PracticeProjects: metrics[row.ID].practice, Focused: focusRecords[row.ID].Focused,
		}
		member.OverallScore, member.ScoredDimensions = compositeScore(dimensions)
		if focus, ok := focusRecords[row.ID]; ok {
			member.InternalNote = focus.InternalNote
			member.FocusUpdatedAt = &focus.UpdatedAt
			member.FocusUpdatedBy = focus.UpdatedByName
		}
		result.Members = append(result.Members, member)
	}
	sort.SliceStable(result.Members, func(i, j int) bool {
		return result.Members[i].DisplayName < result.Members[j].DisplayName
	})
	return result, nil
}

type memberMetrics struct {
	assignments ActivitySummary
	practice    ActivitySummary
}

func (s *Service) activityMetrics(ctx context.Context, groupID uint64, roster []memberRow) (map[uint64]memberMetrics, error) {
	result := make(map[uint64]memberMetrics, len(roster))
	memberIDs := make([]uint64, 0, len(roster))
	for _, member := range roster {
		memberIDs = append(memberIDs, member.ID)
	}
	if len(memberIDs) == 0 {
		return result, nil
	}
	var assignments []assignmentRow
	err := s.db.WithContext(ctx).Table("assignment_targets").Select(`
		assignment_targets.user_id, assignments.id AS assignment_id, assignment_submissions.attempt,
		latest_assignment_review.decision, latest_assignment_review.created_at AS reviewed_at, latest_assignment_review.id AS review_id`).
		Joins("JOIN assignments ON assignments.id = assignment_targets.assignment_id").
		Joins("LEFT JOIN assignment_submissions ON assignment_submissions.assignment_id = assignments.id AND assignment_submissions.user_id = assignment_targets.user_id").
		Joins("LEFT JOIN assignment_reviews AS latest_assignment_review ON latest_assignment_review.id = (SELECT ar.id FROM assignment_reviews ar WHERE ar.submission_id = assignment_submissions.id ORDER BY ar.created_at DESC, ar.id DESC LIMIT 1)").
		Where("assignments.group_id = ? AND assignment_targets.user_id IN ?", groupID, memberIDs).
		Order("assignment_targets.user_id ASC, assignments.id ASC, assignment_submissions.attempt DESC, latest_assignment_review.created_at DESC, latest_assignment_review.id DESC").
		Scan(&assignments).Error
	if err != nil {
		return nil, fail(http.StatusInternalServerError, "读取组内作业完成情况失败", err)
	}
	seenAssignments := make(map[[2]uint64]struct{})
	for _, row := range assignments {
		key := [2]uint64{row.UserID, row.AssignmentID}
		if _, seen := seenAssignments[key]; seen {
			continue
		}
		seenAssignments[key] = struct{}{}
		item := result[row.UserID]
		item.assignments.Total++
		if row.Decision != nil && *row.Decision == model.AssignmentReviewPassed {
			item.assignments.Completed++
		}
		result[row.UserID] = item
	}
	var projects []practiceRow
	err = s.db.WithContext(ctx).Table("practice_entries").Select(`
		practice_entries.user_id, practice_entries.project_id, practice_submissions.attempt,
		practice_submissions.score, practice_submissions.decision, practice_submissions.reviewed_at`).
		Joins("JOIN practice_projects ON practice_projects.id = practice_entries.project_id").
		Joins("LEFT JOIN practice_submissions ON practice_submissions.project_id = practice_entries.project_id AND practice_submissions.user_id = practice_entries.user_id").
		Where("practice_projects.group_id = ? AND practice_entries.user_id IN ?", groupID, memberIDs).
		Order("practice_entries.user_id ASC, practice_entries.project_id ASC, practice_submissions.attempt DESC, practice_submissions.reviewed_at DESC, practice_submissions.id DESC").
		Scan(&projects).Error
	if err != nil {
		return nil, fail(http.StatusInternalServerError, "读取实践项目参与情况失败", err)
	}
	seenProjects := make(map[[2]uint64]struct{})
	for _, row := range projects {
		key := [2]uint64{row.UserID, row.ProjectID}
		if _, seen := seenProjects[key]; seen {
			continue
		}
		seenProjects[key] = struct{}{}
		item := result[row.UserID]
		item.practice.Total++
		if row.Score != nil && row.ReviewedAt != nil && row.Decision != nil && *row.Decision == model.PracticeReviewPassed {
			item.practice.Completed++
		}
		result[row.UserID] = item
	}
	return result, nil
}

func (s *Service) Member(ctx context.Context, actor Actor, groupID, userID uint64) (*MemberView, error) {
	capabilityView, err := s.capabilities.AdminMember(ctx, actor, groupID, userID)
	if err != nil {
		return nil, mappedError(err)
	}
	var rosterEntry memberRow
	if err := s.db.WithContext(ctx).Table("users").Select("users.id, users.name, users.nickname, users.real_name, user_group_members.role AS group_role, user_group_members.joined_at").
		Joins("JOIN user_group_members ON user_group_members.user_id = users.id").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Where("users.id = ? AND user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ?", userID, groupID, model.UserGroupStatusActive, model.UserStatusEnabled).Take(&rosterEntry).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fail(http.StatusForbidden, "无权访问该组别成员", nil)
		}
		return nil, fail(http.StatusInternalServerError, "读取成员身份失败", err)
	}
	metrics, err := s.activityMetrics(ctx, groupID, []memberRow{rosterEntry})
	if err != nil {
		return nil, err
	}
	var focus model.MemberCultivationRecord
	if err := s.db.WithContext(ctx).Where("group_id = ? AND user_id = ?", groupID, userID).Take(&focus).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fail(http.StatusInternalServerError, "读取内部培养记录失败", err)
	}
	result := &MemberView{
		GroupID: groupID, GroupName: capabilityView.GroupName, UserID: userID, DisplayName: capabilityView.DisplayName,
		GroupRole: groupRole(rosterEntry.Role), JoinedYear: rosterEntry.JoinedAt.Year(), Dimensions: capabilityView.Dimensions,
		Assignments: metrics[userID].assignments, Practice: metrics[userID].practice,
		Focused: focus.Focused, InternalNote: focus.InternalNote,
		Events: []growth.Event{},
	}
	result.OverallScore, _ = compositeScore(capabilityView.Dimensions)
	if focus.ID > 0 {
		result.UpdatedAt = &focus.UpdatedAt
		result.UpdatedBy = focus.UpdatedByName
	}
	if s.growth != nil {
		profile, err := s.growth.GetMine(ctx, userID)
		if err != nil {
			return nil, mappedError(err)
		}
		for _, event := range profile.Events {
			if event.GroupID == groupID {
				result.Events = append(result.Events, event)
			}
		}
	}
	return result, nil
}

func (s *Service) UpdateFocus(ctx context.Context, actor Actor, groupID, userID uint64, input FocusInput) error {
	input.InternalNote = strings.TrimSpace(input.InternalNote)
	if groupID == 0 || userID == 0 || utf8.RuneCountInString(input.InternalNote) > 2000 {
		return fail(http.StatusBadRequest, "培养备注不能超过 2000 字", nil)
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireManagerGroup(tx, actor, groupID); err != nil {
			return err
		}
		if err := requireMemberGroup(tx, groupID, userID); err != nil {
			return err
		}
		var admin model.User
		if err := tx.Select("id", "name", "nickname", "real_name").Where("id = ? AND status = ?", actor.ID, model.UserStatusEnabled).Take(&admin).Error; err != nil {
			return fail(http.StatusInternalServerError, "读取管理员身份失败", err)
		}
		name := admin.PreferredName()
		if name == "" {
			name = strings.TrimSpace(admin.Name)
		}
		row := model.MemberCultivationRecord{GroupID: groupID, UserID: userID, Focused: input.Focused, InternalNote: input.InternalNote, UpdatedBy: actor.ID, UpdatedByName: name, UpdatedAt: s.now()}
		return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "group_id"}, {Name: "user_id"}}, DoUpdates: clause.AssignmentColumns([]string{"focused", "internal_note", "updated_by", "updated_by_name", "updated_at"})}).Create(&row).Error
	})
}

func requireManagerGroup(db *gorm.DB, actor Actor, groupID uint64) error {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return fail(http.StatusForbidden, "当前账号无人员培养管理权限", nil)
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		var count int64
		if err := db.Model(&model.UserGroup{}).Where("id = ? AND status = ?", groupID, model.UserGroupStatusActive).Count(&count).Error; err != nil {
			return fail(http.StatusInternalServerError, "验证培养组别失败", err)
		}
		if count == 0 {
			return fail(http.StatusForbidden, "无权管理该组别", nil)
		}
		return nil
	}
	var count int64
	err := db.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ?", actor.ID, groupID, model.UserGroupStatusActive, model.UserStatusEnabled).Count(&count).Error
	if err != nil {
		return fail(http.StatusInternalServerError, "验证培养管理范围失败", err)
	}
	if count == 0 {
		return fail(http.StatusForbidden, "无权管理该组别", nil)
	}
	return nil
}

func requireMemberGroup(db *gorm.DB, groupID, userID uint64) error {
	var count int64
	err := db.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ?", userID, groupID, model.UserGroupStatusActive, model.UserStatusEnabled).Count(&count).Error
	if err != nil {
		return fail(http.StatusInternalServerError, "验证培养成员范围失败", err)
	}
	if count == 0 {
		return fail(http.StatusForbidden, "无权访问该组别成员", nil)
	}
	return nil
}

func memberName(row memberRow) string {
	if name := (model.User{RealName: row.RealName, Nickname: row.Nickname}).PreferredName(); name != "" {
		return name
	}
	if strings.TrimSpace(row.Name) != "" {
		return strings.TrimSpace(row.Name)
	}
	return "成员"
}

func groupRole(role uint8) string {
	if role == model.UserGroupMemberRoleLeader {
		return "组长"
	}
	return "成员"
}

func compositeScore(dimensions []capabilities.DimensionResult) (*float64, int) {
	total, count := 0.0, 0
	for _, dimension := range dimensions {
		if !dimension.Active || dimension.Score == nil {
			continue
		}
		total += *dimension.Score
		count++
	}
	if count == 0 {
		return nil, 0
	}
	average := math.Round(total*10/float64(count)) / 10
	return &average, count
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}
