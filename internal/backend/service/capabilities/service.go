package capabilities

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
)

const maxSourcesPerDimension = 200

type Actor struct {
	ID       uint64
	RoleName string
}

type Group struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

type SourceRef struct {
	Type string `json:"type"`
	ID   uint64 `json:"id"`
}

type DimensionInput struct {
	GroupID     uint64      `json:"groupId"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	SortOrder   uint        `json:"sortOrder"`
	Sources     []SourceRef `json:"sources"`
}

type Dimension struct {
	ID          uint64      `json:"id"`
	GroupID     uint64      `json:"groupId"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	SortOrder   uint        `json:"sortOrder"`
	Active      bool        `json:"active"`
	Sources     []SourceRef `json:"sources"`
}

type SourceOption struct {
	Type  string `json:"type"`
	ID    uint64 `json:"id"`
	Title string `json:"title"`
}

type GrowthEvent struct {
	ID          uint64    `json:"id"`
	SourceType  string    `json:"sourceType"`
	SourceTitle string    `json:"sourceTitle"`
	EvaluatedAt time.Time `json:"evaluatedAt"`
}

type EvaluationSource struct {
	ID           uint64    `json:"id"`
	SourceType   string    `json:"sourceType"`
	SourceID     uint64    `json:"sourceId,omitempty"`
	SourceTitle  string    `json:"sourceTitle"`
	Score        uint8     `json:"score"`
	Decision     string    `json:"decision,omitempty"`
	ReviewerName string    `json:"reviewerName,omitempty"`
	Comment      string    `json:"comment,omitempty"`
	EvaluatedAt  time.Time `json:"evaluatedAt"`
}

type DimensionResult struct {
	ID              uint64             `json:"id"`
	Name            string             `json:"name"`
	Description     string             `json:"description"`
	Active          bool               `json:"active"`
	Score           *float64           `json:"score"`
	EvaluationCount int                `json:"evaluationCount"`
	History         []GrowthEvent      `json:"history,omitempty"`
	Sources         []EvaluationSource `json:"sources,omitempty"`
}

type GroupResult struct {
	GroupID    uint64            `json:"groupId"`
	GroupName  string            `json:"groupName"`
	Dimensions []DimensionResult `json:"dimensions"`
}

type MineResult struct {
	Groups []GroupResult `json:"groups"`
}

type MemberSummary struct {
	UserID      uint64            `json:"userId"`
	DisplayName string            `json:"displayName"`
	Dimensions  []DimensionResult `json:"dimensions"`
}

type AdminGroupView struct {
	GroupID    uint64          `json:"groupId"`
	GroupName  string          `json:"groupName"`
	Dimensions []Dimension     `json:"dimensions"`
	Sources    []SourceOption  `json:"sources"`
	Members    []MemberSummary `json:"members"`
}

type AdminMemberView struct {
	GroupResult
	UserID      uint64 `json:"userId"`
	DisplayName string `json:"displayName"`
}

type ManualReviewInput struct {
	DimensionID uint64 `json:"dimensionId"`
	Score       uint8  `json:"score"`
	Comment     string `json:"comment"`
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

func serviceError(status int, message string, err error) error {
	return &ServiceError{Status: status, Message: message, Err: err}
}

func internalError(message string, err error) error {
	return serviceError(http.StatusInternalServerError, message, err)
}

func forbidden(message string) error  { return serviceError(http.StatusForbidden, message, nil) }
func badRequest(message string) error { return serviceError(http.StatusBadRequest, message, nil) }

type Service struct {
	db  *gorm.DB
	Now func() time.Time
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, Now: time.Now} }

func (s *Service) ListMine(ctx context.Context, userID uint64) (*MineResult, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	var groups []Group
	err := s.db.WithContext(ctx).Table("user_groups").Select("user_groups.id, user_groups.name").
		Joins("JOIN user_group_members ON user_group_members.group_id = user_groups.id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.status = ? AND users.status = ?", userID, model.UserGroupStatusActive, model.UserStatusEnabled).
		Order("user_groups.id ASC").Scan(&groups).Error
	if err != nil {
		return nil, internalError("读取个人能力组别失败", err)
	}
	result := &MineResult{Groups: make([]GroupResult, 0, len(groups))}
	for _, group := range groups {
		dimensions, err := s.activeDimensions(ctx, group.ID)
		if err != nil {
			return nil, err
		}
		calculated, err := s.calculate(ctx, group.ID, []uint64{userID}, dimensions, false, true)
		if err != nil {
			return nil, err
		}
		result.Groups = append(result.Groups, GroupResult{GroupID: group.ID, GroupName: group.Name, Dimensions: calculated[userID]})
	}
	return result, nil
}

func (s *Service) ListAdminGroups(ctx context.Context, actor Actor) ([]Group, error) {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return nil, forbidden("当前账号无能力管理权限")
	}
	var groups []Group
	query := s.db.WithContext(ctx).Table("user_groups").Select("user_groups.id, user_groups.name").Where("user_groups.status = ?", model.UserGroupStatusActive)
	if actor.RoleName == model.RoleNameSuperAdmin {
		if err := query.Order("user_groups.name ASC").Scan(&groups).Error; err != nil {
			return nil, internalError("读取可管理组别失败", err)
		}
	} else {
		if err := query.Joins("JOIN user_group_members ON user_group_members.group_id = user_groups.id").
			Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
			Where("user_group_members.user_id = ?", actor.ID).Distinct().Order("user_groups.name ASC").Scan(&groups).Error; err != nil {
			return nil, internalError("读取可管理组别失败", err)
		}
	}
	if groups == nil {
		groups = []Group{}
	}
	return groups, nil
}

func (s *Service) AdminGroup(ctx context.Context, actor Actor, groupID uint64) (*AdminGroupView, error) {
	if err := s.requireManagerGroup(ctx, actor, groupID); err != nil {
		return nil, err
	}
	var group model.UserGroup
	if err := s.db.WithContext(ctx).Where("id = ? AND status = ?", groupID, model.UserGroupStatusActive).Take(&group).Error; err != nil {
		return nil, notFoundOrInternal(err, "组别不存在", "读取能力组别失败")
	}
	dimensionRecords, err := s.dimensions(ctx, groupID, false)
	if err != nil {
		return nil, err
	}
	dimensions, err := s.dimensionViews(ctx, dimensionRecords)
	if err != nil {
		return nil, err
	}
	sources, err := s.sourceOptions(ctx, groupID)
	if err != nil {
		return nil, err
	}
	users, err := s.groupUsers(ctx, groupID)
	if err != nil {
		return nil, err
	}
	userIDs := make([]uint64, 0, len(users))
	for _, user := range users {
		userIDs = append(userIDs, user.ID)
	}
	activeDimensions := make([]model.CapabilityDimension, 0, len(dimensionRecords))
	for _, dimension := range dimensionRecords {
		if dimension.Active {
			activeDimensions = append(activeDimensions, dimension)
		}
	}
	calculated, err := s.calculate(ctx, groupID, userIDs, activeDimensions, false, false)
	if err != nil {
		return nil, err
	}
	members := make([]MemberSummary, 0, len(users))
	for _, user := range users {
		members = append(members, MemberSummary{UserID: user.ID, DisplayName: displayName(user.Name, user.Nickname, user.RealName), Dimensions: calculated[user.ID]})
	}
	return &AdminGroupView{GroupID: group.ID, GroupName: group.Name, Dimensions: dimensions, Sources: sources, Members: members}, nil
}

func (s *Service) AdminMember(ctx context.Context, actor Actor, groupID, userID uint64) (*AdminMemberView, error) {
	if err := s.requireManagerGroup(ctx, actor, groupID); err != nil {
		return nil, err
	}
	if err := s.requireMemberGroup(ctx, userID, groupID); err != nil {
		return nil, err
	}
	var group model.UserGroup
	if err := s.db.WithContext(ctx).Where("id = ? AND status = ?", groupID, model.UserGroupStatusActive).Take(&group).Error; err != nil {
		return nil, notFoundOrInternal(err, "组别不存在", "读取能力组别失败")
	}
	var user capabilityUser
	if err := s.db.WithContext(ctx).Table("users").Select("id, name, nickname, real_name").Where("id = ? AND status = ?", userID, model.UserStatusEnabled).Take(&user).Error; err != nil {
		return nil, notFoundOrInternal(err, "成员不存在", "读取能力成员失败")
	}
	dimensions, err := s.dimensions(ctx, groupID, false)
	if err != nil {
		return nil, err
	}
	calculated, err := s.calculate(ctx, groupID, []uint64{userID}, dimensions, true, false)
	if err != nil {
		return nil, err
	}
	return &AdminMemberView{GroupResult: GroupResult{GroupID: groupID, GroupName: group.Name, Dimensions: calculated[userID]}, UserID: userID, DisplayName: displayName(user.Name, user.Nickname, user.RealName)}, nil
}

func (s *Service) CreateDimension(ctx context.Context, actor Actor, input DimensionInput) (*Dimension, error) {
	if input.GroupID == 0 {
		return nil, badRequest("请选择能力维度所属组别")
	}
	input, err := normalizeDimensionInput(input)
	if err != nil {
		return nil, err
	}
	if err := s.requireManagerGroup(ctx, actor, input.GroupID); err != nil {
		return nil, err
	}
	var saved model.CapabilityDimension
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := validateDimensionName(tx, input.GroupID, input.Name, 0); err != nil {
			return err
		}
		if err := s.validateSources(tx, input.GroupID, input.Sources); err != nil {
			return err
		}
		saved = model.CapabilityDimension{GroupID: input.GroupID, Name: input.Name, Description: input.Description, SortOrder: input.SortOrder, Active: true, CreatedBy: actor.ID}
		if err := tx.Create(&saved).Error; err != nil {
			return internalError("创建能力维度失败", err)
		}
		return replaceSources(tx, saved, input.Sources)
	})
	if err != nil {
		return nil, err
	}
	view, err := s.dimensionView(ctx, saved)
	return &view, err
}

func (s *Service) UpdateDimension(ctx context.Context, actor Actor, dimensionID uint64, input DimensionInput) (*Dimension, error) {
	input, err := normalizeDimensionInput(input)
	if err != nil {
		return nil, err
	}
	var saved model.CapabilityDimension
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&saved, dimensionID).Error; err != nil {
			return notFoundOrInternal(err, "能力维度不存在", "读取能力维度失败")
		}
		if err := s.requireManagerGroupWithDB(tx, actor, saved.GroupID); err != nil {
			return err
		}
		if !saved.Active {
			return serviceError(http.StatusConflict, "已删除的能力维度不能编辑", nil)
		}
		if err := validateDimensionName(tx, saved.GroupID, input.Name, saved.ID); err != nil {
			return err
		}
		if err := s.validateSources(tx, saved.GroupID, input.Sources); err != nil {
			return err
		}
		saved.Name, saved.Description, saved.SortOrder = input.Name, input.Description, input.SortOrder
		if err := tx.Save(&saved).Error; err != nil {
			return internalError("更新能力维度失败", err)
		}
		return replaceSources(tx, saved, input.Sources)
	})
	if err != nil {
		return nil, err
	}
	view, err := s.dimensionView(ctx, saved)
	return &view, err
}

func (s *Service) DeleteDimension(ctx context.Context, actor Actor, dimensionID uint64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var dimension model.CapabilityDimension
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&dimension, dimensionID).Error; err != nil {
			return notFoundOrInternal(err, "能力维度不存在", "读取能力维度失败")
		}
		if err := s.requireManagerGroupWithDB(tx, actor, dimension.GroupID); err != nil {
			return err
		}
		if !dimension.Active {
			return serviceError(http.StatusConflict, "能力维度已删除", nil)
		}
		return tx.Model(&dimension).Update("active", false).Error
	})
}

func (s *Service) AddManualReview(ctx context.Context, actor Actor, groupID, userID uint64, input ManualReviewInput) (*AdminMemberView, error) {
	input.Comment = strings.TrimSpace(input.Comment)
	if input.DimensionID == 0 || input.Score > 100 || input.Comment == "" || utf8.RuneCountInString(input.Comment) > 2000 {
		return nil, badRequest("请填写有效维度、0–100 分和评价说明")
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.requireManagerGroupWithDB(tx, actor, groupID); err != nil {
			return err
		}
		if err := s.requireMemberGroupWithDB(tx, userID, groupID); err != nil {
			return err
		}
		var dimension model.CapabilityDimension
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND group_id = ? AND active = ?", input.DimensionID, groupID, true).Take(&dimension).Error; err != nil {
			return notFoundOrInternal(err, "能力维度不存在", "读取能力维度失败")
		}
		var reviewer capabilityUser
		if err := tx.Table("users").Select("id, name, nickname, real_name").Where("id = ? AND status = ?", actor.ID, model.UserStatusEnabled).Take(&reviewer).Error; err != nil {
			return internalError("读取评价管理员失败", err)
		}
		event := model.CapabilityManualReview{
			GroupID: groupID, DimensionID: dimension.ID, DimensionName: dimension.Name, UserID: userID,
			Score: input.Score, Comment: input.Comment, ActorID: actor.ID,
			ActorName: displayName(reviewer.Name, reviewer.Nickname, reviewer.RealName), CreatedAt: s.now(),
		}
		if err := tx.Create(&event).Error; err != nil {
			return internalError("保存人工评价失败", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.AdminMember(ctx, actor, groupID, userID)
}

type capabilityUser struct {
	ID       uint64  `gorm:"column:id"`
	Name     string  `gorm:"column:name"`
	Nickname *string `gorm:"column:nickname"`
	RealName *string `gorm:"column:real_name"`
}

type ratedObservation struct {
	DimensionID  uint64
	UserID       uint64
	ID           uint64
	SourceType   string
	SourceID     uint64
	SourceTitle  string
	Score        uint8
	Decision     string
	ReviewerName string
	Comment      string
	EvaluatedAt  time.Time
}

type sourceKey struct {
	typeName string
	id       uint64
}

func (s *Service) calculate(ctx context.Context, groupID uint64, userIDs []uint64, dimensions []model.CapabilityDimension, includeAdmin, memberVisible bool) (map[uint64][]DimensionResult, error) {
	result := make(map[uint64][]DimensionResult, len(userIDs))
	for _, userID := range userIDs {
		result[userID] = make([]DimensionResult, 0, len(dimensions))
	}
	if len(userIDs) == 0 || len(dimensions) == 0 {
		return result, nil
	}
	dimensionIDs := make([]uint64, 0, len(dimensions))
	for _, dimension := range dimensions {
		dimensionIDs = append(dimensionIDs, dimension.ID)
	}
	var links []model.CapabilityDimensionSource
	if err := s.db.WithContext(ctx).Where("group_id = ? AND dimension_id IN ?", groupID, dimensionIDs).Order("id ASC").Find(&links).Error; err != nil {
		return nil, internalError("读取能力评价来源关联失败", err)
	}
	assignmentIDs, projectIDs := make([]uint64, 0), make([]uint64, 0)
	for _, link := range links {
		switch link.SourceType {
		case model.CapabilitySourceAssignment:
			assignmentIDs = append(assignmentIDs, link.SourceID)
		case model.CapabilitySourcePractice:
			projectIDs = append(projectIDs, link.SourceID)
		}
	}
	options, err := s.sourceTitleMap(ctx, groupID, assignmentIDs, projectIDs)
	if err != nil {
		return nil, err
	}
	latest := make(map[sourceUserKey]ratedObservation)
	if len(assignmentIDs) > 0 {
		var rows []assignmentRatingRow
		query := s.db.WithContext(ctx).Table("assignment_reviews").Select(`
			assignment_reviews.id AS review_id, assignment_submissions.assignment_id, assignment_submissions.user_id,
			assignment_submissions.attempt, assignment_reviews.score, assignment_reviews.decision, assignment_reviews.comment,
			assignment_reviews.reviewer_id, assignment_reviews.created_at AS evaluated_at,
			COALESCE(NULLIF(TRIM(reviewer.real_name), ''), NULLIF(TRIM(reviewer.nickname), ''), reviewer.name) AS reviewer_name`).
			Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").
			Joins("JOIN assignments ON assignments.id = assignment_submissions.assignment_id").
			Joins("LEFT JOIN users AS reviewer ON reviewer.id = assignment_reviews.reviewer_id").
			Where("assignments.group_id = ? AND assignments.id IN ? AND assignment_submissions.user_id IN ? AND assignment_reviews.decision IN ?", groupID, uniqueIDs(assignmentIDs), userIDs, []string{model.AssignmentReviewPassed, model.AssignmentReviewNeedsRedo})
		if memberVisible {
			query = query.Where("assignments.publication_status = ?", model.AssignmentPublicationPublished)
		}
		err := query.Order("assignment_submissions.attempt DESC, assignment_reviews.created_at DESC, assignment_reviews.id DESC").Find(&rows).Error
		if err != nil {
			return nil, internalError("读取作业评分失败", err)
		}
		for _, row := range rows {
			key := sourceUserKey{sourceKey{model.CapabilitySourceAssignment, row.AssignmentID}, row.UserID}
			if _, exists := latest[key]; exists {
				continue
			}
			latest[key] = ratedObservation{UserID: row.UserID, ID: row.ReviewID, SourceType: model.CapabilitySourceAssignment, SourceID: row.AssignmentID, SourceTitle: options[sourceKey{model.CapabilitySourceAssignment, row.AssignmentID}], Score: row.Score, Decision: row.Decision, ReviewerName: row.ReviewerName, Comment: row.Comment, EvaluatedAt: row.EvaluatedAt}
		}
	}
	if len(projectIDs) > 0 {
		var rows []practiceRatingRow
		err := s.db.WithContext(ctx).Table("practice_submissions").Select(`
			practice_submissions.id AS submission_id, practice_submissions.project_id, practice_submissions.user_id,
			practice_submissions.attempt, practice_submissions.score, practice_submissions.decision, practice_submissions.comment,
			practice_submissions.reviewed_at AS evaluated_at,
			COALESCE(NULLIF(TRIM(reviewer.real_name), ''), NULLIF(TRIM(reviewer.nickname), ''), reviewer.name) AS reviewer_name`).
			Joins("JOIN practice_projects ON practice_projects.id = practice_submissions.project_id").
			Joins("LEFT JOIN users AS reviewer ON reviewer.id = practice_submissions.reviewer_id").
			Where("practice_projects.group_id = ? AND practice_projects.id IN ? AND practice_submissions.user_id IN ? AND practice_submissions.score IS NOT NULL AND practice_submissions.reviewed_at IS NOT NULL AND practice_submissions.decision IN ?", groupID, uniqueIDs(projectIDs), userIDs, []string{model.PracticeReviewPassed, model.PracticeReviewRedo}).
			Order("practice_submissions.attempt DESC, practice_submissions.reviewed_at DESC, practice_submissions.id DESC").Find(&rows).Error
		if err != nil {
			return nil, internalError("读取实践项目评分失败", err)
		}
		for _, row := range rows {
			key := sourceUserKey{sourceKey{model.CapabilitySourcePractice, row.ProjectID}, row.UserID}
			if _, exists := latest[key]; exists || row.Score == nil {
				continue
			}
			latest[key] = ratedObservation{UserID: row.UserID, ID: row.SubmissionID, SourceType: model.CapabilitySourcePractice, SourceID: row.ProjectID, SourceTitle: options[sourceKey{model.CapabilitySourcePractice, row.ProjectID}], Score: *row.Score, Decision: row.Decision, ReviewerName: row.ReviewerName, Comment: row.Comment, EvaluatedAt: *row.EvaluatedAt}
		}
	}
	byDimensionUser := make(map[dimensionUserKey][]ratedObservation)
	for _, link := range links {
		for _, userID := range userIDs {
			if observation, ok := latest[sourceUserKey{sourceKey{link.SourceType, link.SourceID}, userID}]; ok {
				observation.DimensionID = link.DimensionID
				byDimensionUser[dimensionUserKey{link.DimensionID, userID}] = append(byDimensionUser[dimensionUserKey{link.DimensionID, userID}], observation)
			}
		}
	}
	var manual []model.CapabilityManualReview
	if err := s.db.WithContext(ctx).Where("group_id = ? AND dimension_id IN ? AND user_id IN ?", groupID, dimensionIDs, userIDs).
		Order("created_at ASC, id ASC").Find(&manual).Error; err != nil {
		return nil, internalError("读取人工评价历史失败", err)
	}
	for _, event := range manual {
		byDimensionUser[dimensionUserKey{event.DimensionID, event.UserID}] = append(byDimensionUser[dimensionUserKey{event.DimensionID, event.UserID}], ratedObservation{
			DimensionID: event.DimensionID, UserID: event.UserID, ID: event.ID, SourceType: "manual", SourceTitle: "管理员补充评价",
			Score: event.Score, ReviewerName: event.ActorName, Comment: event.Comment, EvaluatedAt: event.CreatedAt,
		})
	}
	for _, dimension := range dimensions {
		for _, userID := range userIDs {
			observations := byDimensionUser[dimensionUserKey{dimension.ID, userID}]
			sort.SliceStable(observations, func(i, j int) bool {
				if observations[i].EvaluatedAt.Equal(observations[j].EvaluatedAt) {
					if observations[i].SourceType == observations[j].SourceType {
						return observations[i].ID < observations[j].ID
					}
					return observations[i].SourceType < observations[j].SourceType
				}
				return observations[i].EvaluatedAt.Before(observations[j].EvaluatedAt)
			})
			view := DimensionResult{ID: dimension.ID, Name: dimension.Name, Description: dimension.Description, Active: dimension.Active, EvaluationCount: len(observations)}
			if len(observations) > 0 {
				for _, observation := range observations {
					if includeAdmin {
						view.Sources = append(view.Sources, EvaluationSource{ID: observation.ID, SourceType: observation.SourceType, SourceID: observation.SourceID, SourceTitle: observation.SourceTitle, Score: observation.Score, Decision: observation.Decision, ReviewerName: observation.ReviewerName, Comment: observation.Comment, EvaluatedAt: observation.EvaluatedAt})
					} else {
						view.History = append(view.History, GrowthEvent{ID: observation.ID, SourceType: observation.SourceType, SourceTitle: observation.SourceTitle, EvaluatedAt: observation.EvaluatedAt})
					}
				}
				view.Score = averageScore(observations)
			}
			if len(view.History) > 100 {
				view.History = view.History[len(view.History)-100:]
			}
			result[userID] = append(result[userID], view)
		}
	}
	return result, nil
}

func averageScore(observations []ratedObservation) *float64 {
	if len(observations) == 0 {
		return nil
	}
	total := 0
	for _, observation := range observations {
		total += int(observation.Score)
	}
	average := math.Round(float64(total)*10/float64(len(observations))) / 10
	return &average
}

type assignmentRatingRow struct {
	ReviewID     uint64    `gorm:"column:review_id"`
	AssignmentID uint64    `gorm:"column:assignment_id"`
	UserID       uint64    `gorm:"column:user_id"`
	Attempt      uint      `gorm:"column:attempt"`
	Score        uint8     `gorm:"column:score"`
	Decision     string    `gorm:"column:decision"`
	Comment      string    `gorm:"column:comment"`
	ReviewerID   uint64    `gorm:"column:reviewer_id"`
	ReviewerName string    `gorm:"column:reviewer_name"`
	EvaluatedAt  time.Time `gorm:"column:evaluated_at"`
}

type practiceRatingRow struct {
	SubmissionID uint64     `gorm:"column:submission_id"`
	ProjectID    uint64     `gorm:"column:project_id"`
	UserID       uint64     `gorm:"column:user_id"`
	Attempt      uint       `gorm:"column:attempt"`
	Score        *uint8     `gorm:"column:score"`
	Decision     string     `gorm:"column:decision"`
	Comment      string     `gorm:"column:comment"`
	ReviewerName string     `gorm:"column:reviewer_name"`
	EvaluatedAt  *time.Time `gorm:"column:evaluated_at"`
}

type sourceUserKey struct {
	sourceKey
	userID uint64
}

type dimensionUserKey struct {
	dimensionID uint64
	userID      uint64
}

func (s *Service) activeDimensions(ctx context.Context, groupID uint64) ([]model.CapabilityDimension, error) {
	return s.dimensions(ctx, groupID, true)
}

func (s *Service) dimensions(ctx context.Context, groupID uint64, activeOnly bool) ([]model.CapabilityDimension, error) {
	query := s.db.WithContext(ctx).Where("group_id = ?", groupID)
	if activeOnly {
		query = query.Where("active = ?", true)
	}
	var dimensions []model.CapabilityDimension
	if err := query.Order("sort_order ASC, id ASC").Find(&dimensions).Error; err != nil {
		return nil, internalError("读取能力维度失败", err)
	}
	return dimensions, nil
}

func (s *Service) dimensionViews(ctx context.Context, records []model.CapabilityDimension) ([]Dimension, error) {
	views := make([]Dimension, 0, len(records))
	if len(records) == 0 {
		return views, nil
	}
	ids := make([]uint64, 0, len(records))
	for _, item := range records {
		ids = append(ids, item.ID)
	}
	var links []model.CapabilityDimensionSource
	if err := s.db.WithContext(ctx).Where("dimension_id IN ? AND group_id = ?", ids, records[0].GroupID).Order("id ASC").Find(&links).Error; err != nil {
		return nil, internalError("读取能力维度来源失败", err)
	}
	linksByDimension := make(map[uint64][]SourceRef)
	for _, link := range links {
		linksByDimension[link.DimensionID] = append(linksByDimension[link.DimensionID], SourceRef{Type: link.SourceType, ID: link.SourceID})
	}
	for _, item := range records {
		sources := linksByDimension[item.ID]
		if sources == nil {
			sources = []SourceRef{}
		}
		views = append(views, Dimension{ID: item.ID, GroupID: item.GroupID, Name: item.Name, Description: item.Description, SortOrder: item.SortOrder, Active: item.Active, Sources: sources})
	}
	return views, nil
}

func (s *Service) sourceTitleMap(ctx context.Context, groupID uint64, assignmentIDs, projectIDs []uint64) (map[sourceKey]string, error) {
	titles := make(map[sourceKey]string)
	if len(assignmentIDs) > 0 {
		var rows []struct {
			ID    uint64 `gorm:"column:id"`
			Title string `gorm:"column:title"`
		}
		if err := s.db.WithContext(ctx).Table("assignments").Select("id, title").Where("group_id = ? AND id IN ?", groupID, uniqueIDs(assignmentIDs)).Find(&rows).Error; err != nil {
			return nil, internalError("读取关联作业名称失败", err)
		}
		for _, row := range rows {
			titles[sourceKey{model.CapabilitySourceAssignment, row.ID}] = row.Title
		}
	}
	if len(projectIDs) > 0 {
		var rows []struct {
			ID    uint64 `gorm:"column:id"`
			Title string `gorm:"column:title"`
		}
		if err := s.db.WithContext(ctx).Table("practice_projects").Select("id, title").Where("group_id = ? AND id IN ?", groupID, uniqueIDs(projectIDs)).Find(&rows).Error; err != nil {
			return nil, internalError("读取关联实践项目名称失败", err)
		}
		for _, row := range rows {
			titles[sourceKey{model.CapabilitySourcePractice, row.ID}] = row.Title
		}
	}
	return titles, nil
}

func (s *Service) sourceOptions(ctx context.Context, groupID uint64) ([]SourceOption, error) {
	result := make([]SourceOption, 0)
	var assignments []model.Assignment
	if err := s.db.WithContext(ctx).Select("id, title").Where("group_id = ?", groupID).Order("id DESC").Find(&assignments).Error; err != nil {
		return nil, internalError("读取组内作业失败", err)
	}
	for _, assignment := range assignments {
		result = append(result, SourceOption{Type: model.CapabilitySourceAssignment, ID: assignment.ID, Title: assignment.Title})
	}
	var projects []model.PracticeProject
	if err := s.db.WithContext(ctx).Select("id, title").Where("group_id = ?", groupID).Order("id DESC").Find(&projects).Error; err != nil {
		return nil, internalError("读取组内实践项目失败", err)
	}
	for _, project := range projects {
		result = append(result, SourceOption{Type: model.CapabilitySourcePractice, ID: project.ID, Title: project.Title})
	}
	return result, nil
}

func (s *Service) groupUsers(ctx context.Context, groupID uint64) ([]capabilityUser, error) {
	var users []capabilityUser
	err := s.db.WithContext(ctx).Table("users").Select("users.id, users.name, users.nickname, users.real_name").
		Joins("JOIN user_group_members ON user_group_members.user_id = users.id").
		Where("user_group_members.group_id = ? AND users.status = ?", groupID, model.UserStatusEnabled).
		Order("users.id ASC").Scan(&users).Error
	if err != nil {
		return nil, internalError("读取组内成员失败", err)
	}
	return users, nil
}

func (s *Service) dimensionView(ctx context.Context, dimension model.CapabilityDimension) (Dimension, error) {
	var links []model.CapabilityDimensionSource
	if err := s.db.WithContext(ctx).Where("dimension_id = ? AND group_id = ?", dimension.ID, dimension.GroupID).Order("id ASC").Find(&links).Error; err != nil {
		return Dimension{}, internalError("读取能力维度来源失败", err)
	}
	view := Dimension{ID: dimension.ID, GroupID: dimension.GroupID, Name: dimension.Name, Description: dimension.Description, SortOrder: dimension.SortOrder, Active: dimension.Active, Sources: make([]SourceRef, 0, len(links))}
	for _, link := range links {
		view.Sources = append(view.Sources, SourceRef{Type: link.SourceType, ID: link.SourceID})
	}
	return view, nil
}

func (s *Service) validateSources(db *gorm.DB, groupID uint64, refs []SourceRef) error {
	for _, ref := range refs {
		switch ref.Type {
		case model.CapabilitySourceAssignment:
			var count int64
			if err := db.Model(&model.Assignment{}).Where("id = ? AND group_id = ?", ref.ID, groupID).Count(&count).Error; err != nil {
				return internalError("验证关联作业失败", err)
			}
			if count == 0 {
				return badRequest("关联作业不存在或不属于本组")
			}
		case model.CapabilitySourcePractice:
			var count int64
			if err := db.Model(&model.PracticeProject{}).Where("id = ? AND group_id = ?", ref.ID, groupID).Count(&count).Error; err != nil {
				return internalError("验证关联实践项目失败", err)
			}
			if count == 0 {
				return badRequest("关联实践项目不存在或不属于本组")
			}
		default:
			return badRequest("评价来源类型不合法")
		}
	}
	return nil
}

func (s *Service) requireManagerGroup(ctx context.Context, actor Actor, groupID uint64) error {
	return s.requireManagerGroupWithDB(s.db.WithContext(ctx), actor, groupID)
}

func (s *Service) requireManagerGroupWithDB(db *gorm.DB, actor Actor, groupID uint64) error {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return forbidden("当前账号无能力管理权限")
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		var count int64
		if err := db.Model(&model.UserGroup{}).Where("id = ? AND status = ?", groupID, model.UserGroupStatusActive).Count(&count).Error; err != nil {
			return internalError("验证能力组别失败", err)
		}
		if count == 0 {
			return forbidden("无权管理该组别")
		}
		return nil
	}
	var count int64
	err := db.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ?", actor.ID, groupID, model.UserGroupStatusActive, model.UserStatusEnabled).Count(&count).Error
	if err != nil {
		return internalError("验证能力管理组别失败", err)
	}
	if count == 0 {
		return forbidden("无权管理该组别")
	}
	return nil
}

func (s *Service) requireMemberGroup(ctx context.Context, userID, groupID uint64) error {
	return s.requireMemberGroupWithDB(s.db.WithContext(ctx), userID, groupID)
}

func (s *Service) requireMemberGroupWithDB(db *gorm.DB, userID, groupID uint64) error {
	if userID == 0 {
		return serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	var count int64
	err := db.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ?", userID, groupID, model.UserGroupStatusActive, model.UserStatusEnabled).Count(&count).Error
	if err != nil {
		return internalError("验证能力成员身份失败", err)
	}
	if count == 0 {
		return forbidden("无权访问该组别成员能力")
	}
	return nil
}

func normalizeDimensionInput(input DimensionInput) (DimensionInput, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 100 || utf8.RuneCountInString(input.Description) > 5000 || len(input.Sources) > maxSourcesPerDimension {
		return DimensionInput{}, badRequest("能力维度内容不合法")
	}
	seen := make(map[sourceKey]bool, len(input.Sources))
	for _, ref := range input.Sources {
		key := sourceKey{ref.Type, ref.ID}
		if ref.ID == 0 || (ref.Type != model.CapabilitySourceAssignment && ref.Type != model.CapabilitySourcePractice) || seen[key] {
			return DimensionInput{}, badRequest("评价来源内容不合法或重复")
		}
		seen[key] = true
	}
	return input, nil
}

func validateDimensionName(db *gorm.DB, groupID uint64, name string, exceptID uint64) error {
	query := db.Model(&model.CapabilityDimension{}).Where("group_id = ? AND active = ? AND name = ?", groupID, true, name)
	if exceptID > 0 {
		query = query.Where("id <> ?", exceptID)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return internalError("验证能力维度名称失败", err)
	}
	if count > 0 {
		return badRequest("本组已存在同名能力维度")
	}
	return nil
}

func replaceSources(tx *gorm.DB, dimension model.CapabilityDimension, refs []SourceRef) error {
	if err := tx.Where("dimension_id = ?", dimension.ID).Delete(&model.CapabilityDimensionSource{}).Error; err != nil {
		return internalError("更新能力评价来源失败", err)
	}
	links := make([]model.CapabilityDimensionSource, 0, len(refs))
	for _, ref := range refs {
		links = append(links, model.CapabilityDimensionSource{GroupID: dimension.GroupID, DimensionID: dimension.ID, SourceType: ref.Type, SourceID: ref.ID})
	}
	if len(links) == 0 {
		return nil
	}
	if err := tx.Create(&links).Error; err != nil {
		return internalError("保存能力评价来源失败", err)
	}
	return nil
}

func notFoundOrInternal(err error, notFoundMessage, internalMessage string) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return serviceError(http.StatusNotFound, notFoundMessage, nil)
	}
	return internalError(internalMessage, err)
}

func displayName(name string, nickname, realName *string) string {
	if preferredName := (model.User{Name: name, Nickname: nickname, RealName: realName}).PreferredName(); preferredName != "" {
		return preferredName
	}
	if strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	return "成员"
}

func uniqueIDs(values []uint64) []uint64 {
	seen := make(map[uint64]bool, len(values))
	result := make([]uint64, 0, len(values))
	for _, value := range values {
		if value > 0 && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}
