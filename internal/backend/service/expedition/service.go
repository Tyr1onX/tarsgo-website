package expedition

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

var groupNames = []string{"机械组", "电控组", "视觉组", "AI组", "运营组"}

type Actor struct {
	ID       uint64
	RoleName string
}

type MilestoneInput struct {
	GroupID  *uint64    `json:"groupId"`
	Name     string     `json:"name"`
	Criteria string     `json:"criteria"`
	DueAt    *time.Time `json:"dueAt"`
}

type ProjectInput struct {
	Title        string             `json:"title"`
	Objective    string             `json:"objective"`
	Visibility   string             `json:"visibility"`
	Milestones   []MilestoneInput   `json:"milestones"`
	Participants []ParticipantInput `json:"participants"`
}

type ParticipantInput struct {
	GroupID uint64 `json:"groupId"`
	UserID  uint64 `json:"userId"`
}

type MilestoneView struct {
	ID         uint64     `json:"id"`
	GroupID    *uint64    `json:"groupId,omitempty"`
	GroupName  string     `json:"groupName,omitempty"`
	Name       string     `json:"name"`
	Criteria   string     `json:"criteria"`
	DueAt      *time.Time `json:"dueAt,omitempty"`
	State      string     `json:"state"`
	AcceptedAt *time.Time `json:"acceptedAt,omitempty"`
}

type EventView struct {
	ID          uint64    `json:"id"`
	MilestoneID *uint64   `json:"milestoneId,omitempty"`
	GroupID     *uint64   `json:"groupId,omitempty"`
	GroupName   string    `json:"groupName,omitempty"`
	ActorName   string    `json:"actorName"`
	Action      string    `json:"action"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ParticipantView struct {
	UserID      uint64 `json:"userId"`
	DisplayName string `json:"displayName"`
	GroupName   string `json:"groupName"`
}

type MemberOption struct {
	UserID      uint64 `json:"userId"`
	DisplayName string `json:"displayName"`
}

type ProjectView struct {
	ID                 uint64            `json:"id"`
	Title              string            `json:"title"`
	Objective          string            `json:"objective"`
	Visibility         string            `json:"visibility"`
	CreatorName        string            `json:"creatorName"`
	ParticipantGroups  []string          `json:"participantGroups"`
	Participants       []ParticipantView `json:"participants"`
	Milestones         []MilestoneView   `json:"milestones"`
	Events             []EventView       `json:"events"`
	AcceptedGroupNames []string          `json:"acceptedGroupNames"`
	HasAcceptedJoint   bool              `json:"hasAcceptedJoint"`
	CreatedAt          time.Time         `json:"createdAt"`
}

type EvidenceInput struct {
	Content string `json:"content"`
}

type ReviewInput struct {
	Action  string `json:"action"`
	Content string `json:"content"`
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

type Service struct {
	db  *gorm.DB
	Now func() time.Time
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, Now: time.Now} }

func (s *Service) CreateProject(ctx context.Context, actor Actor, input ProjectInput) (*ProjectView, error) {
	if actor.RoleName != model.RoleNameSuperAdmin || actor.ID == 0 {
		return nil, forbidden("只有超级管理员可以创建赛季协作项目")
	}
	input, err := normalizeProjectInput(input)
	if err != nil {
		return nil, err
	}
	groupIDs := make([]uint64, 0, len(input.Milestones))
	for _, milestone := range input.Milestones {
		if milestone.GroupID != nil {
			groupIDs = append(groupIDs, *milestone.GroupID)
		}
	}
	groupIDs = uniqueIDs(groupIDs)
	if len(groupIDs) < 2 {
		return nil, badRequest("协作项目至少需要两个技术组的阶段节点")
	}
	participantsByGroup := make(map[uint64][]uint64)
	for _, participant := range input.Participants {
		participantsByGroup[participant.GroupID] = append(participantsByGroup[participant.GroupID], participant.UserID)
	}
	var project model.ExpeditionProject
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&model.UserGroup{}).Where("id IN ? AND name IN ? AND status = ?", groupIDs, groupNames, model.UserGroupStatusActive).Count(&count).Error; err != nil {
			return internal("校验项目组别失败", err)
		}
		if count != int64(len(groupIDs)) {
			return badRequest("项目包含未开放的组别")
		}
		for _, groupID := range groupIDs {
			userIDs := uniqueIDs(participantsByGroup[groupID])
			var memberCount int64
			if err := tx.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").Joins("JOIN users ON users.id = user_group_members.user_id").Where("user_group_members.group_id = ? AND user_group_members.user_id IN ? AND user_groups.status = ? AND users.status = ?", groupID, userIDs, model.UserGroupStatusActive, model.UserStatusEnabled).Count(&memberCount).Error; err != nil {
				return internal("校验协作成员失败", err)
			}
			if memberCount != int64(len(userIDs)) {
				return badRequest("项目成员必须是所选参与组的有效成员")
			}
		}
		creator, err := actorDisplay(tx, actor.ID)
		if err != nil {
			return err
		}
		project = model.ExpeditionProject{CreatorID: actor.ID, Title: input.Title, Objective: input.Objective, Visibility: input.Visibility}
		if err := tx.Create(&project).Error; err != nil {
			return internal("创建协作项目失败", err)
		}
		if err := tx.Create(&model.ExpeditionProjectEvent{ProjectID: project.ID, ActorID: actor.ID, ActorName: creator, Action: model.ExpeditionEventProjectCreated, Content: "协作项目已建立"}).Error; err != nil {
			return internal("记录项目创建历史失败", err)
		}
		for _, inputMilestone := range input.Milestones {
			milestone := model.ExpeditionProjectMilestone{ProjectID: project.ID, GroupID: inputMilestone.GroupID, Name: inputMilestone.Name, Criteria: inputMilestone.Criteria, DueAt: inputMilestone.DueAt, State: model.ExpeditionMilestoneOpen}
			if err := tx.Create(&milestone).Error; err != nil {
				return internal("创建项目阶段失败", err)
			}
			if err := tx.Create(&model.ExpeditionProjectEvent{ProjectID: project.ID, MilestoneID: uint64Ptr(milestone.ID), GroupID: milestone.GroupID, ActorID: actor.ID, ActorName: creator, Action: model.ExpeditionEventMilestoneAdded, Content: milestone.Name}).Error; err != nil {
				return internal("记录阶段创建历史失败", err)
			}
		}
		participantRows := make([]model.ExpeditionProjectParticipant, 0, len(input.Participants))
		seenParticipants := make(map[string]struct{}, len(input.Participants))
		for _, participant := range input.Participants {
			key := fmt.Sprintf("%d:%d", participant.GroupID, participant.UserID)
			if _, exists := seenParticipants[key]; exists {
				continue
			}
			seenParticipants[key] = struct{}{}
			participantRows = append(participantRows, model.ExpeditionProjectParticipant{ProjectID: project.ID, GroupID: participant.GroupID, UserID: participant.UserID})
		}
		if err := tx.Create(&participantRows).Error; err != nil {
			return internal("保存项目成员失败", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.loadProject(ctx, project, nil)
}

func (s *Service) ListMine(ctx context.Context, actor Actor) ([]ProjectView, error) {
	if actor.ID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	groupIDs, err := s.memberGroupIDs(ctx, actor.ID)
	if err != nil {
		return nil, err
	}
	if len(groupIDs) == 0 && actor.RoleName != model.RoleNameSuperAdmin {
		return nil, forbidden("当前账号没有有效的基地组别")
	}
	var projects []model.ExpeditionProject
	query := s.db.WithContext(ctx).Order("created_at DESC, id DESC").Limit(100)
	query = query.Where("visibility = ? OR id IN (?)", model.ExpeditionVisibilityTeam,
		s.db.Model(&model.ExpeditionProjectParticipant{}).Select("project_id").Where("user_id = ?", actor.ID))
	if err := query.Find(&projects).Error; err != nil {
		return nil, internal("读取可见协作项目失败", err)
	}
	result := make([]ProjectView, 0, len(projects))
	for _, project := range projects {
		view, err := s.loadProject(ctx, project, nil)
		if err != nil {
			return nil, err
		}
		result = append(result, *view)
	}
	return result, nil
}

func (s *Service) ListAdmin(ctx context.Context, actor Actor) ([]ProjectView, error) {
	managedIDs, err := s.managerGroupIDs(ctx, actor)
	if err != nil {
		return nil, err
	}
	var projects []model.ExpeditionProject
	query := s.db.WithContext(ctx).Order("created_at DESC, id DESC").Limit(100)
	if actor.RoleName != model.RoleNameSuperAdmin {
		if len(managedIDs) == 0 {
			return []ProjectView{}, nil
		}
		query = query.Where("id IN (?)", s.db.Model(&model.ExpeditionProjectMilestone{}).Select("project_id").Where("group_id IN ?", managedIDs))
	}
	if err := query.Find(&projects).Error; err != nil {
		return nil, internal("读取可管理协作项目失败", err)
	}
	var scope []uint64
	if actor.RoleName != model.RoleNameSuperAdmin {
		scope = managedIDs
	}
	result := make([]ProjectView, 0, len(projects))
	for _, project := range projects {
		view, err := s.loadProject(ctx, project, scope)
		if err != nil {
			return nil, err
		}
		result = append(result, *view)
	}
	return result, nil
}

func (s *Service) ListGroupMembers(ctx context.Context, actor Actor, groupID uint64) ([]MemberOption, error) {
	if err := requireManagerGroupWithDB(s.db.WithContext(ctx), actor, groupID); err != nil {
		return nil, err
	}
	var rows []struct {
		UserID   uint64
		Name     string
		RealName *string
	}
	if err := s.db.WithContext(ctx).Table("user_group_members").Select("users.id AS user_id, users.name, users.real_name").
		Joins("JOIN users ON users.id = user_group_members.user_id").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Where("user_group_members.group_id = ? AND users.status = ? AND user_groups.status = ?", groupID, model.UserStatusEnabled, model.UserGroupStatusActive).
		Order("users.real_name ASC, users.name ASC, users.id ASC").Scan(&rows).Error; err != nil {
		return nil, internal("读取组内项目成员失败", err)
	}
	items := make([]MemberOption, 0, len(rows))
	for _, row := range rows {
		items = append(items, MemberOption{UserID: row.UserID, DisplayName: displayName(model.User{Name: row.Name, RealName: row.RealName})})
	}
	return items, nil
}

func (s *Service) SubmitEvidence(ctx context.Context, actor Actor, milestoneID uint64, content string) (*ProjectView, error) {
	content = strings.TrimSpace(content)
	if content == "" || utf8.RuneCountInString(content) > 5000 {
		return nil, badRequest("成果依据不能为空且不能超过 5000 字")
	}
	var result model.ExpeditionProject
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var milestone model.ExpeditionProjectMilestone
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&milestone, milestoneID).Error; err != nil {
			return notFoundOrInternal(err, "项目阶段不存在", "读取项目阶段失败")
		}
		if milestone.GroupID == nil {
			if actor.RoleName != model.RoleNameSuperAdmin {
				return forbidden("联合验收材料仅限超级管理员提交")
			}
			var total, accepted int64
			if err := tx.Model(&model.ExpeditionProjectMilestone{}).Where("project_id = ? AND group_id IS NOT NULL", milestone.ProjectID).Count(&total).Error; err != nil {
				return internal("检查联合验收条件失败", err)
			}
			if err := tx.Model(&model.ExpeditionProjectMilestone{}).Where("project_id = ? AND group_id IS NOT NULL AND state = ?", milestone.ProjectID, model.ExpeditionMilestoneAccepted).Count(&accepted).Error; err != nil {
				return internal("检查组别验收状态失败", err)
			}
			if total < 2 || accepted != total {
				return conflict("各参与组阶段全部验收后，才能提交联合验收材料")
			}
		} else {
			var count int64
			err := tx.Table("expedition_project_participants").
				Joins("JOIN user_group_members ON user_group_members.group_id = expedition_project_participants.group_id AND user_group_members.user_id = expedition_project_participants.user_id").
				Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
				Joins("JOIN users ON users.id = user_group_members.user_id").
				Where("expedition_project_participants.project_id = ? AND expedition_project_participants.group_id = ? AND expedition_project_participants.user_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", milestone.ProjectID, *milestone.GroupID, actor.ID, groupNames, model.UserGroupStatusActive, model.UserStatusEnabled).
				Count(&count).Error
			if err != nil {
				return internal("验证项目参与身份失败", err)
			}
			if count == 0 {
				return forbidden("只有组别有效且被指定的项目成员可以提交该阶段成果")
			}
		}
		if milestone.State == model.ExpeditionMilestoneAccepted {
			return conflict("已验收阶段需先由授权管理员撤销验收，才能补充成果")
		}
		name, err := actorDisplay(tx, actor.ID)
		if err != nil {
			return err
		}
		if err := tx.Model(&milestone).Updates(map[string]any{"state": model.ExpeditionMilestoneSubmitted, "accepted_by": nil, "accepted_at": nil}).Error; err != nil {
			return internal("提交阶段成果失败", err)
		}
		if err := tx.Create(&model.ExpeditionProjectEvent{ProjectID: milestone.ProjectID, MilestoneID: uint64Ptr(milestone.ID), GroupID: milestone.GroupID, ActorID: actor.ID, ActorName: name, Action: model.ExpeditionEventEvidence, Content: content}).Error; err != nil {
			return internal("记录阶段成果失败", err)
		}
		return tx.First(&result, milestone.ProjectID).Error
	})
	if err != nil {
		return nil, err
	}
	return s.loadProject(ctx, result, nil)
}

func (s *Service) ReviewMilestone(ctx context.Context, actor Actor, milestoneID uint64, input ReviewInput) (*ProjectView, error) {
	input.Action = strings.TrimSpace(input.Action)
	input.Content = strings.TrimSpace(input.Content)
	if (input.Action != "accept" && input.Action != "revoke") || input.Content == "" || utf8.RuneCountInString(input.Content) > 5000 {
		return nil, badRequest("验收操作或依据不合法")
	}
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return nil, forbidden("当前账号无权验收项目阶段")
	}
	var project model.ExpeditionProject
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var milestone model.ExpeditionProjectMilestone
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&milestone, milestoneID).Error; err != nil {
			return notFoundOrInternal(err, "项目阶段不存在", "读取项目阶段失败")
		}
		if milestone.GroupID == nil {
			if actor.RoleName != model.RoleNameSuperAdmin {
				return forbidden("联合成果仅限超级管理员最终验收")
			}
		} else if err := requireManagerGroupWithDB(tx, actor, *milestone.GroupID); err != nil {
			return err
		}
		var projectRow model.ExpeditionProject
		if err := tx.First(&projectRow, milestone.ProjectID).Error; err != nil {
			return internal("读取协作项目失败", err)
		}
		var action, nextState string
		var acceptedAt any
		var acceptedBy any
		switch input.Action {
		case "accept":
			if milestone.State != model.ExpeditionMilestoneSubmitted {
				return conflict("阶段需要先提交成果，才能验收")
			}
			if milestone.GroupID == nil {
				var total, accepted int64
				if err := tx.Model(&model.ExpeditionProjectMilestone{}).Where("project_id = ? AND group_id IS NOT NULL", milestone.ProjectID).Count(&total).Error; err != nil {
					return internal("检查联合验收条件失败", err)
				}
				if err := tx.Model(&model.ExpeditionProjectMilestone{}).Where("project_id = ? AND group_id IS NOT NULL AND state = ?", milestone.ProjectID, model.ExpeditionMilestoneAccepted).Count(&accepted).Error; err != nil {
					return internal("检查组别验收状态失败", err)
				}
				if total < 2 || accepted != total {
					return conflict("各参与组阶段全部验收后，才能进行联合验收")
				}
			}
			nextState, action, acceptedAt, acceptedBy = model.ExpeditionMilestoneAccepted, model.ExpeditionEventAccepted, s.Now(), actor.ID
		case "revoke":
			if milestone.State != model.ExpeditionMilestoneAccepted {
				return conflict("只有已验收的阶段可以撤销验收")
			}
			if milestone.GroupID != nil {
				var finalAccepted int64
				if err := tx.Model(&model.ExpeditionProjectMilestone{}).Where("project_id = ? AND group_id IS NULL AND state = ?", milestone.ProjectID, model.ExpeditionMilestoneAccepted).Count(&finalAccepted).Error; err != nil {
					return internal("检查联合验收状态失败", err)
				}
				if finalAccepted > 0 {
					return conflict("请先撤销联合验收，再撤销组别阶段")
				}
			}
			nextState, action, acceptedAt, acceptedBy = model.ExpeditionMilestoneSubmitted, model.ExpeditionEventRevoked, nil, nil
		}
		name, err := actorDisplay(tx, actor.ID)
		if err != nil {
			return err
		}
		if err := tx.Model(&milestone).Updates(map[string]any{"state": nextState, "accepted_at": acceptedAt, "accepted_by": acceptedBy}).Error; err != nil {
			return internal("更新阶段验收状态失败", err)
		}
		if err := tx.Create(&model.ExpeditionProjectEvent{ProjectID: milestone.ProjectID, MilestoneID: uint64Ptr(milestone.ID), GroupID: milestone.GroupID, ActorID: actor.ID, ActorName: name, Action: action, Content: input.Content}).Error; err != nil {
			return internal("记录阶段验收历史失败", err)
		}
		project = projectRow
		return nil
	})
	if err != nil {
		return nil, err
	}
	var scope []uint64
	if actor.RoleName != model.RoleNameSuperAdmin {
		scope, err = s.managerGroupIDs(ctx, actor)
		if err != nil {
			return nil, err
		}
	}
	return s.loadProject(ctx, project, scope)
}

func (s *Service) loadProject(ctx context.Context, project model.ExpeditionProject, groupScope []uint64) (*ProjectView, error) {
	var creator model.User
	if err := s.db.WithContext(ctx).Select("id, name, real_name").First(&creator, project.CreatorID).Error; err != nil {
		return nil, internal("读取项目负责人失败", err)
	}
	var milestones []model.ExpeditionProjectMilestone
	query := s.db.WithContext(ctx).Where("project_id = ?", project.ID).Order("id ASC")
	if len(groupScope) > 0 {
		query = query.Where("group_id IN ?", groupScope)
	}
	if err := query.Find(&milestones).Error; err != nil {
		return nil, internal("读取项目阶段失败", err)
	}
	groupIDs := make([]uint64, 0, len(milestones))
	for _, milestone := range milestones {
		if milestone.GroupID != nil {
			groupIDs = append(groupIDs, *milestone.GroupID)
		}
	}
	groupIDs = uniqueIDs(groupIDs)
	groupMap := make(map[uint64]string, len(groupIDs))
	if len(groupIDs) > 0 {
		var groups []model.UserGroup
		if err := s.db.WithContext(ctx).Select("id, name").Where("id IN ?", groupIDs).Find(&groups).Error; err != nil {
			return nil, internal("读取参与组别失败", err)
		}
		for _, group := range groups {
			groupMap[group.ID] = group.Name
		}
	}
	eventQuery := s.db.WithContext(ctx).Where("project_id = ?", project.ID).Order("created_at ASC, id ASC")
	if len(groupScope) > 0 {
		eventQuery = eventQuery.Where("group_id IN ? OR group_id IS NULL AND action = ?", groupScope, model.ExpeditionEventProjectCreated)
	}
	var events []model.ExpeditionProjectEvent
	if err := eventQuery.Find(&events).Error; err != nil {
		return nil, internal("读取项目历史失败", err)
	}
	view := &ProjectView{ID: project.ID, Title: project.Title, Objective: project.Objective, Visibility: project.Visibility, CreatorName: displayName(creator), ParticipantGroups: make([]string, 0, len(groupMap)), Participants: make([]ParticipantView, 0), Milestones: make([]MilestoneView, 0, len(milestones)), Events: make([]EventView, 0, len(events)), CreatedAt: project.CreatedAt}
	var participantRows []struct {
		UserID   uint64
		GroupID  uint64
		Name     string
		RealName *string
	}
	participantQuery := s.db.WithContext(ctx).Table("expedition_project_participants").Select("expedition_project_participants.user_id, expedition_project_participants.group_id, users.name, users.real_name").
		Joins("JOIN users ON users.id = expedition_project_participants.user_id").Where("expedition_project_participants.project_id = ?", project.ID)
	if len(groupScope) > 0 {
		participantQuery = participantQuery.Where("expedition_project_participants.group_id IN ?", groupScope)
	}
	if err := participantQuery.Order("users.real_name ASC, users.name ASC").Scan(&participantRows).Error; err != nil {
		return nil, internal("读取项目成员失败", err)
	}
	for _, participant := range participantRows {
		view.Participants = append(view.Participants, ParticipantView{UserID: participant.UserID, DisplayName: displayName(model.User{Name: participant.Name, RealName: participant.RealName}), GroupName: groupMap[participant.GroupID]})
	}
	for _, groupName := range groupMap {
		view.ParticipantGroups = append(view.ParticipantGroups, groupName)
	}
	sort.Strings(view.ParticipantGroups)
	for _, milestone := range milestones {
		item := MilestoneView{ID: milestone.ID, GroupID: milestone.GroupID, Name: milestone.Name, Criteria: milestone.Criteria, DueAt: milestone.DueAt, State: milestone.State, AcceptedAt: milestone.AcceptedAt}
		if milestone.GroupID == nil {
			if milestone.State == model.ExpeditionMilestoneAccepted {
				view.HasAcceptedJoint = true
			}
		} else {
			item.GroupName = groupMap[*milestone.GroupID]
			if milestone.State == model.ExpeditionMilestoneAccepted {
				view.AcceptedGroupNames = append(view.AcceptedGroupNames, item.GroupName)
			}
		}
		view.Milestones = append(view.Milestones, item)
	}
	view.AcceptedGroupNames = uniqueStrings(view.AcceptedGroupNames)
	for _, event := range events {
		view.Events = append(view.Events, EventView{ID: event.ID, MilestoneID: event.MilestoneID, GroupID: event.GroupID, GroupName: eventGroupName(event.GroupID, groupMap), ActorName: event.ActorName, Action: event.Action, Content: event.Content, CreatedAt: event.CreatedAt})
	}
	view.CreatorName = displayName(creator)
	return view, nil
}

func normalizeProjectInput(input ProjectInput) (ProjectInput, error) {
	input.Title = strings.TrimSpace(input.Title)
	input.Objective = strings.TrimSpace(input.Objective)
	input.Visibility = strings.TrimSpace(input.Visibility)
	if input.Visibility == "" {
		input.Visibility = model.ExpeditionVisibilityTeam
	}
	if input.Visibility != model.ExpeditionVisibilityTeam && input.Visibility != model.ExpeditionVisibilityParticipants {
		return ProjectInput{}, badRequest("项目可见范围不合法")
	}
	if input.Title == "" || utf8.RuneCountInString(input.Title) > 160 || input.Objective == "" || utf8.RuneCountInString(input.Objective) > 5000 || len(input.Milestones) < 3 || len(input.Milestones) > 30 {
		return ProjectInput{}, badRequest("项目名称、目标或阶段数量不合法")
	}
	jointCount := 0
	for index := range input.Milestones {
		milestone := &input.Milestones[index]
		milestone.Name, milestone.Criteria = strings.TrimSpace(milestone.Name), strings.TrimSpace(milestone.Criteria)
		if milestone.Name == "" || utf8.RuneCountInString(milestone.Name) > 160 || milestone.Criteria == "" || utf8.RuneCountInString(milestone.Criteria) > 5000 {
			return ProjectInput{}, badRequest("阶段名称与完成标准不能为空")
		}
		if milestone.GroupID == nil {
			jointCount++
		}
	}
	if jointCount != 1 {
		return ProjectInput{}, badRequest("每个跨组项目需要且只能设置一个联合验收阶段")
	}
	if len(input.Participants) == 0 || len(input.Participants) > 500 {
		return ProjectInput{}, badRequest("项目成员数量不合法")
	}
	groupSet := make(map[uint64]struct{})
	participantGroups := make(map[uint64]struct{})
	for _, milestone := range input.Milestones {
		if milestone.GroupID != nil {
			groupSet[*milestone.GroupID] = struct{}{}
		}
	}
	for _, participant := range input.Participants {
		if participant.GroupID == 0 || participant.UserID == 0 {
			return ProjectInput{}, badRequest("项目成员信息不合法")
		}
		if _, exists := groupSet[participant.GroupID]; !exists {
			return ProjectInput{}, badRequest("项目成员必须属于项目参与组")
		}
		participantGroups[participant.GroupID] = struct{}{}
	}
	for groupID := range groupSet {
		if _, exists := participantGroups[groupID]; !exists {
			return ProjectInput{}, badRequest("每个参与组至少需要指定一名成员")
		}
	}
	return input, nil
}

func (s *Service) memberGroupIDs(ctx context.Context, userID uint64) ([]uint64, error) {
	var ids []uint64
	err := s.db.WithContext(ctx).Table("user_group_members").Distinct("user_group_members.group_id").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", userID, groupNames, model.UserGroupStatusActive, model.UserStatusEnabled).
		Pluck("user_group_members.group_id", &ids).Error
	if err != nil {
		return nil, internal("验证项目参与组别失败", err)
	}
	return ids, nil
}

func (s *Service) managerGroupIDs(ctx context.Context, actor Actor) ([]uint64, error) {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return nil, forbidden("当前账号无协作项目管理权限")
	}
	var ids []uint64
	query := s.db.WithContext(ctx).Table("user_groups").Where("user_groups.name IN ? AND user_groups.status = ?", groupNames, model.UserGroupStatusActive)
	if actor.RoleName == model.RoleNameAdmin {
		query = query.Joins("JOIN user_group_members ON user_group_members.group_id = user_groups.id").
			Joins("JOIN users ON users.id = user_group_members.user_id").
			Where("user_group_members.user_id = ? AND users.status = ?", actor.ID, model.UserStatusEnabled)
	}
	if err := query.Distinct("user_groups.id").Pluck("user_groups.id", &ids).Error; err != nil {
		return nil, internal("读取可管理组别失败", err)
	}
	return ids, nil
}

func requireManagerGroupWithDB(db *gorm.DB, actor Actor, groupID uint64) error {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return forbidden("当前账号无权验收项目阶段")
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		var count int64
		if err := db.Model(&model.UserGroup{}).Where("id = ? AND name IN ? AND status = ?", groupID, groupNames, model.UserGroupStatusActive).Count(&count).Error; err != nil {
			return internal("校验项目组别失败", err)
		}
		if count == 0 {
			return forbidden("阶段所属组别未开放协作")
		}
		return nil
	}
	var count int64
	err := db.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", actor.ID, groupID, groupNames, model.UserGroupStatusActive, model.UserStatusEnabled).Count(&count).Error
	if err != nil {
		return internal("验证阶段管理权限失败", err)
	}
	if count == 0 {
		return forbidden("无权管理该组阶段")
	}
	return nil
}

func actorDisplay(db *gorm.DB, userID uint64) (string, error) {
	var user model.User
	if err := db.Select("id, name, real_name, status").First(&user, userID).Error; err != nil {
		return "", internal("读取操作人失败", err)
	}
	if user.Status != model.UserStatusEnabled {
		return "", forbidden("当前账号不可用")
	}
	return displayName(user), nil
}

func displayName(user model.User) string {
	if user.RealName != nil && strings.TrimSpace(*user.RealName) != "" {
		return strings.TrimSpace(*user.RealName)
	}
	if strings.TrimSpace(user.Name) != "" {
		return strings.TrimSpace(user.Name)
	}
	return "成员"
}

func eventGroupName(groupID *uint64, groups map[uint64]string) string {
	if groupID == nil {
		return ""
	}
	return groups[*groupID]
}

func uniqueIDs(input []uint64) []uint64 {
	seen := make(map[uint64]struct{}, len(input))
	out := make([]uint64, 0, len(input))
	for _, id := range input {
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

func uniqueStrings(input []string) []string {
	seen := make(map[string]struct{}, len(input))
	out := make([]string, 0, len(input))
	for _, value := range input {
		if value != "" {
			if _, exists := seen[value]; !exists {
				seen[value] = struct{}{}
				out = append(out, value)
			}
		}
	}
	sort.Strings(out)
	return out
}

func uint64Ptr(value uint64) *uint64 { return &value }

func serviceError(status int, message string, err error) *ServiceError {
	return &ServiceError{Status: status, Message: message, Err: err}
}
func forbidden(message string) *ServiceError { return serviceError(http.StatusForbidden, message, nil) }
func badRequest(message string) *ServiceError {
	return serviceError(http.StatusBadRequest, message, nil)
}
func conflict(message string) *ServiceError { return serviceError(http.StatusConflict, message, nil) }
func internal(message string, err error) *ServiceError {
	return serviceError(http.StatusInternalServerError, message, err)
}
func notFoundOrInternal(err error, missing, failed string) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return serviceError(http.StatusNotFound, missing, nil)
	}
	return internal(failed, err)
}
