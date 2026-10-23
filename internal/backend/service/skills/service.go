package skills

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

const (
	StateLocked    = "locked"
	StateAvailable = "available"
	StatePracticed = "practiced"
	StateMastered  = "mastered"
)

type Actor struct {
	ID       uint64
	RoleName string
}

type Group struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

type NodeInput struct {
	GroupID         uint64 `json:"groupId"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	LearningGoal    string `json:"learningGoal"`
	PassingCriteria string `json:"passingCriteria"`
	SortOrder       uint   `json:"sortOrder"`
}

type Node struct {
	ID                uint64   `json:"id"`
	GroupID           uint64   `json:"groupId"`
	Name              string   `json:"name"`
	Description       string   `json:"description"`
	LearningGoal      string   `json:"learningGoal"`
	PassingCriteria   string   `json:"passingCriteria"`
	SortOrder         uint     `json:"sortOrder"`
	Active            bool     `json:"active"`
	PrerequisiteIDs   []uint64 `json:"prerequisiteIds"`
	AssignmentIDs     []uint64 `json:"assignmentIds"`
	CanDelete         bool     `json:"canDelete,omitempty"`
	DeleteBlockReason string   `json:"deleteBlockReason,omitempty"`
}

type NodeOrder struct {
	NodeID    uint64 `json:"nodeId"`
	SortOrder uint   `json:"sortOrder"`
}

type ReviewEvent struct {
	ID           uint64    `json:"id"`
	SkillName    string    `json:"skillName"`
	Action       string    `json:"action"`
	ActorID      uint64    `json:"actorId"`
	ActorName    string    `json:"actorName"`
	EvidenceType string    `json:"evidenceType"`
	EvidenceID   *uint64   `json:"evidenceId,omitempty"`
	EvidenceNote string    `json:"evidenceNote"`
	CreatedAt    time.Time `json:"createdAt"`
}

type NodeProgress struct {
	Node
	State         string        `json:"state"`
	StartedAt     *time.Time    `json:"startedAt,omitempty"`
	ReviewHistory []ReviewEvent `json:"reviewHistory"`
}

type GroupProgress struct {
	Group
	Nodes []NodeProgress `json:"nodes"`
}

type MineResult struct {
	Groups []GroupProgress `json:"groups"`
}

type Member struct {
	UserID        uint64        `json:"userId"`
	DisplayName   string        `json:"displayName"`
	State         string        `json:"state"`
	StartedAt     *time.Time    `json:"startedAt,omitempty"`
	ReviewHistory []ReviewEvent `json:"reviewHistory,omitempty"`
}

type ReviewInput struct {
	Action       string  `json:"action"`
	EvidenceType string  `json:"evidenceType"`
	EvidenceID   *uint64 `json:"evidenceId"`
	EvidenceNote string  `json:"evidenceNote"`
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

func (s *Service) ListMy(ctx context.Context, userID uint64) (*MineResult, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	var groups []Group
	err := s.db.WithContext(ctx).Table("user_groups").
		Select("user_groups.id, user_groups.name").
		Joins("JOIN user_group_members ON user_group_members.group_id = user_groups.id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", userID, groupNames, model.UserGroupStatusActive, model.UserStatusEnabled).
		Order("user_groups.id ASC").Scan(&groups).Error
	if err != nil {
		return nil, internalError("读取技能路线组别失败", err)
	}
	result := &MineResult{Groups: make([]GroupProgress, 0, len(groups))}
	for _, group := range groups {
		items, err := s.listMyGroup(ctx, userID, group)
		if err != nil {
			return nil, err
		}
		result.Groups = append(result.Groups, *items)
	}
	return result, nil
}

func (s *Service) listMyGroup(ctx context.Context, userID uint64, group Group) (*GroupProgress, error) {
	var records []model.SkillNode
	if err := s.db.WithContext(ctx).Where("group_id = ?", group.ID).
		Order("sort_order ASC, id ASC").Find(&records).Error; err != nil {
		return nil, internalError("读取技能节点失败", err)
	}
	nodeIDs := make([]uint64, 0, len(records))
	for _, item := range records {
		nodeIDs = append(nodeIDs, item.ID)
	}
	progress := &GroupProgress{Group: group, Nodes: make([]NodeProgress, 0, len(records))}
	if len(nodeIDs) == 0 {
		return progress, nil
	}
	var dependencies []model.SkillNodePrerequisite
	if err := s.db.WithContext(ctx).Where("skill_node_id IN ?", nodeIDs).Find(&dependencies).Error; err != nil {
		return nil, internalError("读取技能前置条件失败", err)
	}
	var assignmentLinks []struct {
		SkillNodeID  uint64
		AssignmentID uint64
	}
	if err := s.db.WithContext(ctx).Table("skill_node_assignments").
		Select("skill_node_assignments.skill_node_id, skill_node_assignments.assignment_id").
		Joins("JOIN assignments ON assignments.id = skill_node_assignments.assignment_id").
		Joins("LEFT JOIN assignment_targets ON assignment_targets.assignment_id = assignments.id AND assignment_targets.user_id = ?", userID).
		Where("skill_node_assignments.skill_node_id IN ? AND assignments.group_id = ? AND (assignments.is_group_wide = ? OR assignment_targets.user_id IS NOT NULL)", nodeIDs, group.ID, true).
		Find(&assignmentLinks).Error; err != nil {
		return nil, internalError("读取技能训练关联失败", err)
	}
	var starts []model.SkillNodeProgress
	if err := s.db.WithContext(ctx).Where("user_id = ? AND skill_node_id IN ?", userID, nodeIDs).Find(&starts).Error; err != nil {
		return nil, internalError("读取技能挑战进度失败", err)
	}
	var reviews []model.SkillReviewEvent
	if err := s.db.WithContext(ctx).Where("user_id = ? AND skill_node_id IN ?", userID, nodeIDs).
		Order("created_at ASC, id ASC").Find(&reviews).Error; err != nil {
		return nil, internalError("读取技能审核记录失败", err)
	}
	hasHistory := make(map[uint64]bool, len(starts)+len(reviews))
	for _, item := range starts {
		hasHistory[item.SkillNodeID] = true
	}
	for _, event := range reviews {
		hasHistory[event.SkillNodeID] = true
	}
	visibleRecords := make([]model.SkillNode, 0, len(records))
	visibleIDs := make([]uint64, 0, len(records))
	activeIDs := make(map[uint64]bool, len(records))
	for _, item := range records {
		if !item.Active && !hasHistory[item.ID] {
			continue
		}
		visibleRecords = append(visibleRecords, item)
		visibleIDs = append(visibleIDs, item.ID)
		activeIDs[item.ID] = item.Active
	}
	records = visibleRecords
	nodeIDs = visibleIDs
	if len(nodeIDs) == 0 {
		return progress, nil
	}
	var practicedIDs []uint64
	if err := s.db.WithContext(ctx).Table("skill_node_assignments").Distinct("skill_node_assignments.skill_node_id").
		Joins("JOIN assignments ON assignments.id = skill_node_assignments.assignment_id").
		Joins("JOIN assignment_submissions ON assignment_submissions.assignment_id = assignments.id AND assignment_submissions.user_id = ?", userID).
		Joins("JOIN assignment_reviews ON assignment_reviews.submission_id = assignment_submissions.id AND assignment_reviews.decision = ?", model.AssignmentReviewPassed).
		Where("skill_node_assignments.skill_node_id IN ? AND assignments.group_id = ?", nodeIDs, group.ID).
		Pluck("skill_node_assignments.skill_node_id", &practicedIDs).Error; err != nil {
		return nil, internalError("读取技能实践证据失败", err)
	}
	depMap := make(map[uint64][]uint64, len(records))
	assignmentMap := make(map[uint64][]uint64, len(records))
	startMap := make(map[uint64]time.Time, len(starts))
	latest := make(map[uint64]model.SkillReviewEvent, len(reviews))
	for _, dependency := range dependencies {
		depMap[dependency.SkillNodeID] = append(depMap[dependency.SkillNodeID], dependency.PrerequisiteNodeID)
	}
	for _, link := range assignmentLinks {
		assignmentMap[link.SkillNodeID] = append(assignmentMap[link.SkillNodeID], link.AssignmentID)
	}
	for _, item := range starts {
		startMap[item.SkillNodeID] = item.StartedAt
	}
	for _, event := range reviews {
		latest[event.SkillNodeID] = event
	}
	practiced := make(map[uint64]bool, len(practicedIDs))
	for _, id := range practicedIDs {
		practiced[id] = true
	}
	mastered := make(map[uint64]bool, len(records))
	for id, event := range latest {
		mastered[id] = event.Action == model.SkillReviewMastered
	}
	for _, item := range records {
		preIDs := activePrerequisites(depMap[item.ID], activeIDs)
		state := statusFor(item.ID, preIDs, mastered, practiced)
		if !item.Active && state != StateMastered {
			state = StateLocked
		}
		view := NodeProgress{Node: nodeView(item, preIDs, assignmentMap[item.ID]), State: state, ReviewHistory: eventViewsForNode(reviews, item.ID)}
		if started, ok := startMap[item.ID]; ok {
			view.StartedAt = &started
		}
		progress.Nodes = append(progress.Nodes, view)
	}
	return progress, nil
}

func (s *Service) ListAdminGroups(ctx context.Context, actor Actor) ([]Group, error) {
	if actor.RoleName == model.RoleNameSuperAdmin {
		var groups []Group
		err := s.db.WithContext(ctx).Table("user_groups").Select("id, name").
			Where("name IN ? AND status = ?", groupNames, model.UserGroupStatusActive).
			Order("id ASC").Scan(&groups).Error
		if err != nil {
			return nil, internalError("读取可管理技能组别失败", err)
		}
		return groups, nil
	}
	if actor.RoleName != model.RoleNameAdmin {
		return nil, forbidden("当前账号无技能路线管理权限")
	}
	var groups []Group
	err := s.db.WithContext(ctx).Table("user_groups").
		Select("user_groups.id, user_groups.name").
		Joins("JOIN user_group_members ON user_group_members.group_id = user_groups.id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", actor.ID, groupNames, model.UserGroupStatusActive, model.UserStatusEnabled).
		Order("user_groups.id ASC").Scan(&groups).Error
	if err != nil {
		return nil, internalError("读取可管理技能组别失败", err)
	}
	return groups, nil
}

func (s *Service) ListAdminNodes(ctx context.Context, actor Actor, groupID uint64) ([]Node, error) {
	if err := s.requireManagerGroup(ctx, actor, groupID); err != nil {
		return nil, err
	}
	var records []model.SkillNode
	if err := s.db.WithContext(ctx).Where("group_id = ?", groupID).Order("sort_order ASC, id ASC").Find(&records).Error; err != nil {
		return nil, internalError("读取技能节点失败", err)
	}
	ids := make([]uint64, 0, len(records))
	for _, item := range records {
		ids = append(ids, item.ID)
	}
	dependencies := []model.SkillNodePrerequisite{}
	links := []model.SkillNodeAssignment{}
	if len(ids) > 0 {
		if err := s.db.WithContext(ctx).Where("skill_node_id IN ?", ids).Find(&dependencies).Error; err != nil {
			return nil, internalError("读取技能前置条件失败", err)
		}
		if err := s.db.WithContext(ctx).Where("skill_node_id IN ?", ids).Find(&links).Error; err != nil {
			return nil, internalError("读取技能训练关联失败", err)
		}
	}
	depMap, assignmentMap := linkMaps(dependencies, links)
	result := make([]Node, 0, len(records))
	for _, item := range records {
		result = append(result, nodeView(item, depMap[item.ID], assignmentMap[item.ID]))
	}
	if len(records) > 0 {
		deleteState, err := s.nodeDeleteState(ctx, ids)
		if err != nil {
			return nil, internalError("读取技能节点引用状态失败", err)
		}
		for index := range result {
			result[index].CanDelete = deleteState[result[index].ID] == ""
			result[index].DeleteBlockReason = deleteState[result[index].ID]
		}
	}
	return result, nil
}

func (s *Service) nodeDeleteState(ctx context.Context, nodeIDs []uint64) (map[uint64]string, error) {
	blocked := make(map[uint64]map[string]bool, len(nodeIDs))
	for _, id := range nodeIDs {
		blocked[id] = map[string]bool{}
	}
	add := func(id uint64, reason string) {
		if reasons, exists := blocked[id]; exists {
			reasons[reason] = true
		}
	}
	var progress []struct{ SkillNodeID uint64 }
	if err := s.db.WithContext(ctx).Model(&model.SkillNodeProgress{}).Select("skill_node_id").Where("skill_node_id IN ?", nodeIDs).Find(&progress).Error; err != nil {
		return nil, err
	}
	for _, row := range progress {
		add(row.SkillNodeID, "已有学习进度")
	}
	var reviews []struct{ SkillNodeID uint64 }
	if err := s.db.WithContext(ctx).Model(&model.SkillReviewEvent{}).Select("skill_node_id").Where("skill_node_id IN ?", nodeIDs).Find(&reviews).Error; err != nil {
		return nil, err
	}
	for _, row := range reviews {
		add(row.SkillNodeID, "已有审核历史")
	}
	var dependencies []model.SkillNodePrerequisite
	if err := s.db.WithContext(ctx).Where("skill_node_id IN ? OR prerequisite_node_id IN ?", nodeIDs, nodeIDs).Find(&dependencies).Error; err != nil {
		return nil, err
	}
	for _, row := range dependencies {
		add(row.SkillNodeID, "存在前置关系")
		add(row.PrerequisiteNodeID, "存在前置关系")
	}
	var assignmentLinks []model.SkillNodeAssignment
	if err := s.db.WithContext(ctx).Select("skill_node_id").Where("skill_node_id IN ?", nodeIDs).Find(&assignmentLinks).Error; err != nil {
		return nil, err
	}
	for _, row := range assignmentLinks {
		add(row.SkillNodeID, "关联了训练作业")
	}
	result := make(map[uint64]string, len(nodeIDs))
	for _, id := range nodeIDs {
		reasons := make([]string, 0, len(blocked[id]))
		for _, reason := range []string{"已有学习进度", "已有审核历史", "存在前置关系", "关联了训练作业"} {
			if blocked[id][reason] {
				reasons = append(reasons, reason)
			}
		}
		result[id] = strings.Join(reasons, "、")
	}
	return result, nil
}

// ReorderNodes stores the automatically computed within-layer order generated
// by the graph view. It accepts the complete group node set so clients cannot
// rewrite another group's layout or leave part of a route unsorted.
func (s *Service) ReorderNodes(ctx context.Context, actor Actor, groupID uint64, orders []NodeOrder) error {
	if len(orders) == 0 || len(orders) > 1000 {
		return serviceError(http.StatusBadRequest, "技能路线顺序参数不合法", nil)
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, groupID).Error; err != nil {
			return notFoundOrInternal(err, "技能组别不存在", "锁定技能路线失败")
		}
		if err := s.requireManagerGroupWithDB(tx, actor, groupID); err != nil {
			return err
		}
		var records []model.SkillNode
		if err := tx.Where("group_id = ?", groupID).Find(&records).Error; err != nil {
			return internalError("读取技能节点失败", err)
		}
		if len(records) != len(orders) {
			return serviceError(http.StatusConflict, "技能路线已变化，请重新加载后整理", nil)
		}
		valid := make(map[uint64]bool, len(records))
		for _, node := range records {
			valid[node.ID] = true
		}
		seen := make(map[uint64]bool, len(orders))
		for _, order := range orders {
			if !valid[order.NodeID] || seen[order.NodeID] {
				return serviceError(http.StatusBadRequest, "技能路线顺序必须包含本组每个节点且不能重复", nil)
			}
			seen[order.NodeID] = true
		}
		for _, order := range orders {
			if err := tx.Model(&model.SkillNode{}).Where("id = ? AND group_id = ?", order.NodeID, groupID).Update("sort_order", order.SortOrder).Error; err != nil {
				return internalError("保存自动整理结果失败", err)
			}
		}
		return nil
	})
}

func (s *Service) CreateNode(ctx context.Context, actor Actor, input NodeInput) (*Node, error) {
	input, err := normalizeNodeInput(input)
	if err != nil {
		return nil, err
	}
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return nil, forbidden("当前账号无技能路线管理权限")
	}
	item := model.SkillNode{
		GroupID: input.GroupID, Name: input.Name, Description: input.Description,
		LearningGoal: input.LearningGoal, PassingCriteria: input.PassingCriteria,
		SortOrder: input.SortOrder, Active: true, CreatedBy: actor.ID,
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, input.GroupID).Error; err != nil {
			return notFoundOrInternal(err, "技能组别不存在", "锁定技能路线失败")
		}
		if err := s.requireManagerGroupWithDB(tx, actor, input.GroupID); err != nil {
			return err
		}
		return tx.Create(&item).Error
	})
	if err != nil {
		if isDuplicate(err) {
			return nil, serviceError(http.StatusConflict, "该组别已存在同名技能", err)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("创建技能节点失败", err)
	}
	view := nodeView(item, nil, nil)
	return &view, nil
}

func (s *Service) UpdateNode(ctx context.Context, actor Actor, nodeID uint64, input NodeInput) (*Node, error) {
	input, err := normalizeNodeInput(input)
	if err != nil {
		return nil, err
	}
	item, err := s.getManagedNode(ctx, actor, nodeID)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{
		"name": input.Name, "description": input.Description, "learning_goal": input.LearningGoal,
		"passing_criteria": input.PassingCriteria, "sort_order": input.SortOrder,
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, item.GroupID).Error; err != nil {
			return internalError("锁定技能路线失败", err)
		}
		if err := s.requireManagerGroupWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		return tx.Model(&model.SkillNode{}).Where("id = ? AND group_id = ?", item.ID, item.GroupID).Updates(updates).Error
	})
	if err != nil {
		if isDuplicate(err) {
			return nil, serviceError(http.StatusConflict, "该组别已存在同名技能", err)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新技能节点失败", err)
	}
	item.Name, item.Description, item.LearningGoal, item.PassingCriteria, item.SortOrder = input.Name, input.Description, input.LearningGoal, input.PassingCriteria, input.SortOrder
	returned := nodeView(*item, nil, nil)
	return &returned, nil
}

func (s *Service) SetActive(ctx context.Context, actor Actor, nodeID uint64, active bool) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		item, err := s.getManagedNodeForUpdateWithDB(tx, actor, nodeID)
		if err != nil {
			return err
		}
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, item.GroupID).Error; err != nil {
			return internalError("锁定技能路线失败", err)
		}
		if !active {
			var dependants int64
			if err := tx.Table("skill_node_prerequisites").
				Joins("JOIN skill_nodes ON skill_nodes.id = skill_node_prerequisites.skill_node_id").
				Where("skill_node_prerequisites.prerequisite_node_id = ? AND skill_nodes.active = ?", item.ID, true).
				Count(&dependants).Error; err != nil {
				return internalError("检查技能路线依赖失败", err)
			}
			if dependants > 0 {
				return serviceError(http.StatusConflict, "请先调整启用节点的前置关系，再停用此技能", nil)
			}
		}
		if err := tx.Model(&model.SkillNode{}).Where("id = ?", item.ID).Update("active", active).Error; err != nil {
			return internalError("更新技能节点状态失败", err)
		}
		return nil
	})
}

// DeleteNode permits physical removal only before a node has acquired learning,
// assessment, prerequisite, or assignment references. Historic nodes are
// retained through SetActive(false).
func (s *Service) DeleteNode(ctx context.Context, actor Actor, nodeID uint64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		item, err := s.getManagedNodeForUpdateWithDB(tx, actor, nodeID)
		if err != nil {
			return err
		}
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, item.GroupID).Error; err != nil {
			return internalError("锁定技能路线失败", err)
		}
		var progress, reviews, prerequisites, assignments int64
		if err := tx.Model(&model.SkillNodeProgress{}).Where("skill_node_id = ?", nodeID).Count(&progress).Error; err != nil {
			return internalError("检查技能学习历史失败", err)
		}
		if err := tx.Model(&model.SkillReviewEvent{}).Where("skill_node_id = ?", nodeID).Count(&reviews).Error; err != nil {
			return internalError("检查技能审核历史失败", err)
		}
		if err := tx.Model(&model.SkillNodePrerequisite{}).
			Where("skill_node_id = ? OR prerequisite_node_id = ?", nodeID, nodeID).Count(&prerequisites).Error; err != nil {
			return internalError("检查技能依赖关系失败", err)
		}
		if err := tx.Model(&model.SkillNodeAssignment{}).Where("skill_node_id = ?", nodeID).Count(&assignments).Error; err != nil {
			return internalError("检查关联作业失败", err)
		}
		if progress+reviews+prerequisites+assignments > 0 {
			return serviceError(http.StatusConflict, "该节点已有学习或审核历史、前置关系或关联作业，不能删除；请停用节点以保留记录", nil)
		}
		result := tx.Where("id = ? AND group_id = ?", nodeID, item.GroupID).Delete(&model.SkillNode{})
		if result.Error != nil {
			return internalError("删除技能节点失败", result.Error)
		}
		if result.RowsAffected == 0 {
			return notFoundOrInternal(gorm.ErrRecordNotFound, "技能节点不存在", "删除技能节点失败")
		}
		return nil
	})
}

func (s *Service) SetPrerequisites(ctx context.Context, actor Actor, nodeID uint64, prerequisiteIDs []uint64) error {
	ids, err := normalizeIDs(prerequisiteIDs)
	if err != nil {
		return serviceError(http.StatusBadRequest, "前置技能参数不合法", err)
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		item, err := s.getManagedNodeForUpdateWithDB(tx, actor, nodeID)
		if err != nil {
			return err
		}
		// Serializing changes on the group's row prevents two concurrent edits
		// from each passing the cycle check against stale dependency graphs.
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, item.GroupID).Error; err != nil {
			return internalError("锁定技能路线失败", err)
		}
		if containsID(ids, nodeID) {
			return serviceError(http.StatusBadRequest, "技能不能依赖自身", nil)
		}
		var dependencies []model.SkillNode
		if len(ids) > 0 {
			if err := tx.Where("id IN ? AND group_id = ? AND active = ?", ids, item.GroupID, true).Find(&dependencies).Error; err != nil {
				return internalError("读取前置技能失败", err)
			}
			if len(dependencies) != len(ids) {
				return forbidden("前置技能必须属于同一组别且处于启用状态")
			}
		}
		var existing []model.SkillNodePrerequisite
		if err := tx.Joins("JOIN skill_nodes ON skill_nodes.id = skill_node_prerequisites.skill_node_id").
			Where("skill_nodes.group_id = ?", item.GroupID).Find(&existing).Error; err != nil {
			return internalError("读取技能依赖关系失败", err)
		}
		graph := make(map[uint64][]uint64)
		for _, dependency := range existing {
			if dependency.SkillNodeID != nodeID {
				graph[dependency.SkillNodeID] = append(graph[dependency.SkillNodeID], dependency.PrerequisiteNodeID)
			}
		}
		graph[nodeID] = ids
		if hasDependencyCycle(graph) {
			return serviceError(http.StatusBadRequest, "技能前置关系不能形成循环", nil)
		}
		if err := tx.Where("skill_node_id = ?", nodeID).Delete(&model.SkillNodePrerequisite{}).Error; err != nil {
			return internalError("更新技能前置关系失败", err)
		}
		for _, prerequisiteID := range ids {
			if err := tx.Create(&model.SkillNodePrerequisite{SkillNodeID: nodeID, PrerequisiteNodeID: prerequisiteID}).Error; err != nil {
				return internalError("保存技能前置关系失败", err)
			}
		}
		return nil
	})
}

func (s *Service) SetAssignments(ctx context.Context, actor Actor, nodeID uint64, assignmentIDs []uint64) error {
	ids, err := normalizeIDs(assignmentIDs)
	if err != nil {
		return serviceError(http.StatusBadRequest, "训练作业参数不合法", err)
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		item, err := s.getManagedNodeForUpdateWithDB(tx, actor, nodeID)
		if err != nil {
			return err
		}
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, item.GroupID).Error; err != nil {
			return internalError("锁定技能路线失败", err)
		}
		if len(ids) > 0 {
			var count int64
			if err := tx.Model(&model.Assignment{}).Where("id IN ? AND group_id = ?", ids, item.GroupID).Count(&count).Error; err != nil {
				return internalError("验证关联训练作业失败", err)
			}
			if int(count) != len(ids) {
				return forbidden("关联训练作业必须属于同一组别")
			}
		}
		if err := tx.Where("skill_node_id = ?", nodeID).Delete(&model.SkillNodeAssignment{}).Error; err != nil {
			return internalError("更新技能训练关联失败", err)
		}
		for _, assignmentID := range ids {
			if err := tx.Create(&model.SkillNodeAssignment{SkillNodeID: nodeID, AssignmentID: assignmentID}).Error; err != nil {
				return internalError("保存技能训练关联失败", err)
			}
		}
		return nil
	})
}

func (s *Service) Start(ctx context.Context, userID, nodeID uint64) (*NodeProgress, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	var view NodeProgress
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.SkillNode
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND active = ?", nodeID, true).Take(&item).Error; err != nil {
			return notFoundOrInternal(err, "技能节点不存在", "读取技能节点失败")
		}
		if err := s.requireMemberGroupWithDB(tx, userID, item.GroupID); err != nil {
			return err
		}
		status, prereqIDs, err := s.statusForUser(ctx, userID, item)
		if err != nil {
			return err
		}
		if status == StateLocked {
			return serviceError(http.StatusConflict, "请先完成该技能的前置条件", nil)
		}
		if status == StateMastered {
			return serviceError(http.StatusConflict, "该技能已確認掌握", nil)
		}
		progress := model.SkillNodeProgress{SkillNodeID: item.ID, UserID: userID, StartedAt: s.now()}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&progress).Error; err != nil {
			return internalError("开始技能挑战失败", err)
		}
		var existing model.SkillNodeProgress
		if err := tx.Where("skill_node_id = ? AND user_id = ?", item.ID, userID).Take(&existing).Error; err != nil {
			return internalError("读取技能挑战状态失败", err)
		}
		view = NodeProgress{Node: nodeView(item, prereqIDs, nil), State: status, StartedAt: &existing.StartedAt, ReviewHistory: []ReviewEvent{}}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &view, nil
}

func (s *Service) Review(ctx context.Context, actor Actor, nodeID, userID uint64, input ReviewInput) ([]ReviewEvent, error) {
	input.Action = strings.TrimSpace(input.Action)
	input.EvidenceType = strings.TrimSpace(input.EvidenceType)
	input.EvidenceNote = strings.TrimSpace(input.EvidenceNote)
	if userID == 0 || (input.Action != model.SkillReviewMastered && input.Action != model.SkillReviewRevoked) {
		return nil, serviceError(http.StatusBadRequest, "技能审核参数不合法", nil)
	}
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return nil, forbidden("当前账号无技能路线管理权限")
	}
	if input.EvidenceID != nil && *input.EvidenceID == 0 {
		return nil, serviceError(http.StatusBadRequest, "证据编号不合法", nil)
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.SkillNode
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, nodeID).Error; err != nil {
			return notFoundOrInternal(err, "技能节点不存在", "读取技能节点失败")
		}
		var group model.UserGroup
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, item.GroupID).Error; err != nil {
			return internalError("锁定技能路线失败", err)
		}
		if err := s.requireManagerGroupWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		if input.Action == model.SkillReviewMastered && !item.Active {
			return serviceError(http.StatusConflict, "已停用的技能不能新增掌握确认", nil)
		}
		if err := s.requireMemberGroupWithDB(tx, userID, item.GroupID); err != nil {
			return err
		}
		latest, err := s.latestReviewWithDB(tx, userID, nodeID)
		if err != nil {
			return err
		}
		if input.Action == model.SkillReviewMastered {
			if latest != nil && latest.Action == model.SkillReviewMastered {
				return serviceError(http.StatusConflict, "该技能已确认掌握", nil)
			}
			if err := s.requirePrerequisitesMastered(tx, userID, item.ID); err != nil {
				return err
			}
		} else if latest == nil || latest.Action != model.SkillReviewMastered {
			return serviceError(http.StatusConflict, "当前没有可撤销的掌握确认", nil)
		}
		if err := s.validateEvidence(tx, item, userID, input); err != nil {
			return err
		}
		var reviewer model.User
		if err := tx.Select("id, name, nickname, real_name").Where("id = ? AND status = ?", actor.ID, model.UserStatusEnabled).Take(&reviewer).Error; err != nil {
			return internalError("读取技能确认人失败", err)
		}
		event := model.SkillReviewEvent{
			GroupID: item.GroupID, SkillNodeID: nodeID, SkillName: item.Name, UserID: userID, ActorID: actor.ID, ActorName: displayName(reviewer),
			Action: input.Action, EvidenceType: input.EvidenceType, EvidenceID: input.EvidenceID,
			EvidenceNote: input.EvidenceNote, CreatedAt: s.now(),
		}
		if err := tx.Create(&event).Error; err != nil {
			return internalError("保存技能审核记录失败", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.MemberHistory(ctx, actor, nodeID, userID)
}

func (s *Service) ListAdminMembers(ctx context.Context, actor Actor, groupID, nodeID uint64) ([]Member, error) {
	if err := s.requireManagerGroup(ctx, actor, groupID); err != nil {
		return nil, err
	}
	var node model.SkillNode
	if err := s.db.WithContext(ctx).Where("id = ? AND group_id = ?", nodeID, groupID).Take(&node).Error; err != nil {
		return nil, notFoundOrInternal(err, "技能节点不存在", "读取技能节点失败")
	}
	var users []model.User
	if err := s.db.WithContext(ctx).Table("users").Select("users.id, users.name, users.nickname, users.real_name").
		Joins("JOIN user_group_members ON user_group_members.user_id = users.id").
		Where("user_group_members.group_id = ? AND users.status = ?", groupID, model.UserStatusEnabled).
		Order("users.id ASC").Scan(&users).Error; err != nil {
		return nil, internalError("读取组内成员失败", err)
	}
	userIDs := make([]uint64, 0, len(users))
	for _, user := range users {
		userIDs = append(userIDs, user.ID)
	}
	if len(userIDs) == 0 {
		return []Member{}, nil
	}
	var graphNodes []model.SkillNode
	if err := s.db.WithContext(ctx).Where("group_id = ? AND active = ?", groupID, true).Find(&graphNodes).Error; err != nil {
		return nil, internalError("读取技能路线失败", err)
	}
	graphIDs := make([]uint64, 0, len(graphNodes))
	active := make(map[uint64]bool, len(graphNodes))
	for _, graphNode := range graphNodes {
		graphIDs = append(graphIDs, graphNode.ID)
		active[graphNode.ID] = true
	}
	if !containsID(graphIDs, nodeID) {
		graphIDs = append(graphIDs, nodeID)
		active[nodeID] = node.Active
	}
	var dependencies []model.SkillNodePrerequisite
	if len(graphIDs) > 0 {
		if err := s.db.WithContext(ctx).Where("skill_node_id IN ?", graphIDs).Find(&dependencies).Error; err != nil {
			return nil, internalError("读取技能前置条件失败", err)
		}
	}
	depMap := make(map[uint64][]uint64)
	for _, dependency := range dependencies {
		depMap[dependency.SkillNodeID] = append(depMap[dependency.SkillNodeID], dependency.PrerequisiteNodeID)
	}
	var reviews []model.SkillReviewEvent
	if err := s.db.WithContext(ctx).Where("user_id IN ? AND skill_node_id IN ?", userIDs, graphIDs).
		Order("created_at ASC, id ASC").Find(&reviews).Error; err != nil {
		return nil, internalError("读取组内技能审核记录失败", err)
	}
	var starts []model.SkillNodeProgress
	if err := s.db.WithContext(ctx).Where("user_id IN ? AND skill_node_id = ?", userIDs, nodeID).Find(&starts).Error; err != nil {
		return nil, internalError("读取组内挑战状态失败", err)
	}
	var passed []uint64
	if err := s.db.WithContext(ctx).Table("assignment_submissions").Distinct("assignment_submissions.user_id").
		Joins("JOIN assignment_reviews ON assignment_reviews.submission_id = assignment_submissions.id AND assignment_reviews.decision = ?", model.AssignmentReviewPassed).
		Joins("JOIN assignments ON assignments.id = assignment_submissions.assignment_id").
		Joins("JOIN skill_node_assignments ON skill_node_assignments.assignment_id = assignments.id").
		Where("skill_node_assignments.skill_node_id = ? AND assignments.group_id = ? AND assignment_submissions.user_id IN ?", nodeID, groupID, userIDs).
		Pluck("assignment_submissions.user_id", &passed).Error; err != nil {
		return nil, internalError("读取组内作业实践记录失败", err)
	}
	latest := make(map[uint64]map[uint64]model.SkillReviewEvent)
	for _, event := range reviews {
		if latest[event.UserID] == nil {
			latest[event.UserID] = make(map[uint64]model.SkillReviewEvent)
		}
		latest[event.UserID][event.SkillNodeID] = event
	}
	startMap := make(map[uint64]time.Time, len(starts))
	for _, item := range starts {
		startMap[item.UserID] = item.StartedAt
	}
	practiced := make(map[uint64]bool, len(passed))
	for _, userID := range passed {
		practiced[userID] = true
	}
	result := make([]Member, 0, len(users))
	preIDs := activePrerequisites(depMap[nodeID], active)
	for _, user := range users {
		mastered := make(map[uint64]bool)
		for skillID, event := range latest[user.ID] {
			mastered[skillID] = event.Action == model.SkillReviewMastered
		}
		state := statusFor(nodeID, preIDs, mastered, map[uint64]bool{nodeID: practiced[user.ID]})
		if !node.Active && state != StateMastered {
			state = StateLocked
		}
		member := Member{UserID: user.ID, DisplayName: displayName(user), State: state}
		if start, ok := startMap[user.ID]; ok {
			member.StartedAt = &start
		}
		member.ReviewHistory = eventViewsForUserNode(reviews, user.ID, nodeID)
		result = append(result, member)
	}
	return result, nil
}

func (s *Service) MemberHistory(ctx context.Context, actor Actor, nodeID, userID uint64) ([]ReviewEvent, error) {
	item, err := s.getManagedNode(ctx, actor, nodeID)
	if err != nil {
		return nil, err
	}
	if err := s.requireMemberGroup(ctx, userID, item.GroupID); err != nil {
		return nil, err
	}
	var events []model.SkillReviewEvent
	if err := s.db.WithContext(ctx).Where("skill_node_id = ? AND user_id = ?", nodeID, userID).
		Order("created_at ASC, id ASC").Find(&events).Error; err != nil {
		return nil, internalError("读取技能审核历史失败", err)
	}
	return reviewEventViews(events), nil
}

func (s *Service) statusForUser(ctx context.Context, userID uint64, item model.SkillNode) (string, []uint64, error) {
	var dependencies []model.SkillNodePrerequisite
	if err := s.db.WithContext(ctx).Joins("JOIN skill_nodes ON skill_nodes.id = skill_node_prerequisites.prerequisite_node_id").
		Where("skill_node_prerequisites.skill_node_id = ? AND skill_nodes.active = ?", item.ID, true).Find(&dependencies).Error; err != nil {
		return "", nil, internalError("读取技能前置条件失败", err)
	}
	preIDs := make([]uint64, 0, len(dependencies))
	for _, dependency := range dependencies {
		preIDs = append(preIDs, dependency.PrerequisiteNodeID)
	}
	var relevant []model.SkillReviewEvent
	ids := append(append([]uint64{}, preIDs...), item.ID)
	if err := s.db.WithContext(ctx).Where("user_id = ? AND skill_node_id IN ?", userID, ids).
		Order("created_at ASC, id ASC").Find(&relevant).Error; err != nil {
		return "", nil, internalError("读取技能审核记录失败", err)
	}
	mastered := make(map[uint64]bool)
	for _, event := range relevant {
		mastered[event.SkillNodeID] = event.Action == model.SkillReviewMastered
	}
	if mastered[item.ID] {
		return StateMastered, preIDs, nil
	}
	if !allMastered(preIDs, mastered) {
		return StateLocked, preIDs, nil
	}
	var passed int64
	err := s.db.WithContext(ctx).Table("skill_node_assignments").
		Joins("JOIN assignments ON assignments.id = skill_node_assignments.assignment_id").
		Joins("JOIN assignment_submissions ON assignment_submissions.assignment_id = assignments.id AND assignment_submissions.user_id = ?", userID).
		Joins("JOIN assignment_reviews ON assignment_reviews.submission_id = assignment_submissions.id AND assignment_reviews.decision = ?", model.AssignmentReviewPassed).
		Where("skill_node_assignments.skill_node_id = ?", item.ID).Count(&passed).Error
	if err != nil {
		return "", nil, internalError("读取技能实践证据失败", err)
	}
	if passed > 0 {
		return StatePracticed, preIDs, nil
	}
	return StateAvailable, preIDs, nil
}

func (s *Service) requirePrerequisitesMastered(db *gorm.DB, userID, nodeID uint64) error {
	var dependencies []model.SkillNodePrerequisite
	if err := db.Joins("JOIN skill_nodes ON skill_nodes.id = skill_node_prerequisites.prerequisite_node_id").
		Where("skill_node_prerequisites.skill_node_id = ? AND skill_nodes.active = ?", nodeID, true).Find(&dependencies).Error; err != nil {
		return internalError("读取技能前置条件失败", err)
	}
	ids := make([]uint64, 0, len(dependencies))
	for _, dependency := range dependencies {
		ids = append(ids, dependency.PrerequisiteNodeID)
	}
	var events []model.SkillReviewEvent
	if len(ids) > 0 {
		if err := db.Where("user_id = ? AND skill_node_id IN ?", userID, ids).Order("created_at ASC, id ASC").Find(&events).Error; err != nil {
			return internalError("读取前置技能审核记录失败", err)
		}
	}
	mastered := make(map[uint64]bool)
	for _, event := range events {
		mastered[event.SkillNodeID] = event.Action == model.SkillReviewMastered
	}
	if !allMastered(ids, mastered) {
		return serviceError(http.StatusConflict, "请先确认全部前置技能", nil)
	}
	return nil
}

func (s *Service) latestReviewWithDB(db *gorm.DB, userID, nodeID uint64) (*model.SkillReviewEvent, error) {
	var event model.SkillReviewEvent
	err := db.Where("user_id = ? AND skill_node_id = ?", userID, nodeID).Order("created_at DESC, id DESC").Take(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, internalError("读取技能审核状态失败", err)
	}
	return &event, nil
}

func (s *Service) validateEvidence(db *gorm.DB, item model.SkillNode, userID uint64, input ReviewInput) error {
	if input.Action == model.SkillReviewRevoked && input.EvidenceNote == "" {
		return serviceError(http.StatusBadRequest, "撤销掌握确认时请填写原因", nil)
	}
	switch input.EvidenceType {
	case model.SkillEvidenceAssignment:
		if input.EvidenceID == nil {
			return serviceError(http.StatusBadRequest, "请选择作业证据", nil)
		}
		var assignmentID uint64
		err := db.Table("assignments").Select("assignments.id").
			Joins("JOIN skill_node_assignments ON skill_node_assignments.assignment_id = assignments.id").
			Where("assignments.id = ? AND assignments.group_id = ? AND skill_node_assignments.skill_node_id = ?", *input.EvidenceID, item.GroupID, item.ID).
			Take(&assignmentID).Error
		if err != nil {
			return notFoundOrInternal(err, "该作业不是此技能的关联证据", "验证技能作业证据失败")
		}
		var latest model.AssignmentReview
		err = db.Table("assignment_reviews").Select("assignment_reviews.*").
			Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").
			Where("assignment_submissions.assignment_id = ? AND assignment_submissions.user_id = ?", *input.EvidenceID, userID).
			Order("assignment_reviews.created_at DESC, assignment_reviews.id DESC").Take(&latest).Error
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && latest.Decision != model.AssignmentReviewPassed) {
			return serviceError(http.StatusConflict, "只有已通过的关联作业可以作为实践证据", nil)
		}
		if err != nil {
			return internalError("验证作业批改证据失败", err)
		}
	case model.SkillEvidenceQuestion:
		if input.EvidenceID == nil {
			return serviceError(http.StatusBadRequest, "请选择答疑记录证据", nil)
		}
		var questionID uint64
		err := db.Table("training_questions").Select("training_questions.id").
			Where("training_questions.id = ? AND training_questions.group_id = ? AND (training_questions.asker_id = ? OR EXISTS (SELECT 1 FROM training_question_posts WHERE training_question_posts.question_id = training_questions.id AND training_question_posts.author_id = ?))", *input.EvidenceID, item.GroupID, userID, userID).
			Take(&questionID).Error
		if err != nil {
			return notFoundOrInternal(err, "该答疑记录不能作为此成员的证据", "验证技能答疑证据失败")
		}
	case model.SkillEvidenceNote:
		if input.EvidenceID != nil {
			return serviceError(http.StatusBadRequest, "文字说明不能包含记录编号", nil)
		}
	default:
		return serviceError(http.StatusBadRequest, "技能证据类型不合法", nil)
	}
	if input.EvidenceNote == "" && input.EvidenceID == nil {
		return serviceError(http.StatusBadRequest, "请填写技能掌握依据", nil)
	}
	if utf8.RuneCountInString(input.EvidenceNote) > 2000 {
		return serviceError(http.StatusBadRequest, "技能依据不能超过 2000 字", nil)
	}
	return nil
}

func (s *Service) getManagedNode(ctx context.Context, actor Actor, nodeID uint64) (*model.SkillNode, error) {
	return s.getManagedNodeWithDB(s.db.WithContext(ctx), actor, nodeID)
}

func (s *Service) getManagedNodeWithDB(db *gorm.DB, actor Actor, nodeID uint64) (*model.SkillNode, error) {
	var item model.SkillNode
	if err := db.First(&item, nodeID).Error; err != nil {
		return nil, notFoundOrInternal(err, "技能节点不存在", "读取技能节点失败")
	}
	if err := s.requireManagerGroupWithDB(db, actor, item.GroupID); err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) getManagedNodeForUpdateWithDB(db *gorm.DB, actor Actor, nodeID uint64) (*model.SkillNode, error) {
	var item model.SkillNode
	if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, nodeID).Error; err != nil {
		return nil, notFoundOrInternal(err, "技能节点不存在", "读取技能节点失败")
	}
	if err := s.requireManagerGroupWithDB(db, actor, item.GroupID); err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) requireManagerGroup(ctx context.Context, actor Actor, groupID uint64) error {
	return s.requireManagerGroupWithDB(s.db.WithContext(ctx), actor, groupID)
}

func (s *Service) requireManagerGroupWithDB(db *gorm.DB, actor Actor, groupID uint64) error {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin) {
		return forbidden("当前账号无技能路线管理权限")
	}
	if actor.RoleName == model.RoleNameSuperAdmin {
		var count int64
		err := db.Model(&model.UserGroup{}).Where("id = ? AND name IN ? AND status = ?", groupID, groupNames, model.UserGroupStatusActive).Count(&count).Error
		if err != nil {
			return internalError("验证技能组别失败", err)
		}
		if count == 0 {
			return forbidden("该组别不存在或未开放技能路线")
		}
		return nil
	}
	var count int64
	err := db.Table("user_group_members").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", actor.ID, groupID, groupNames, model.UserGroupStatusActive, model.UserStatusEnabled).
		Count(&count).Error
	if err != nil {
		return internalError("验证技能管理组别失败", err)
	}
	if count == 0 {
		return forbidden("无权管理该组别的技能路线")
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
	err := db.Table("user_group_members").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_group_members.group_id = ? AND user_groups.name IN ? AND user_groups.status = ? AND users.status = ?", userID, groupID, groupNames, model.UserGroupStatusActive, model.UserStatusEnabled).
		Count(&count).Error
	if err != nil {
		return internalError("验证技能组别成员身份失败", err)
	}
	if count == 0 {
		return forbidden("无权访问该组别的技能路线")
	}
	return nil
}

func normalizeNodeInput(input NodeInput) (NodeInput, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.LearningGoal = strings.TrimSpace(input.LearningGoal)
	input.PassingCriteria = strings.TrimSpace(input.PassingCriteria)
	if input.GroupID == 0 || input.Name == "" || input.LearningGoal == "" || input.PassingCriteria == "" || utf8.RuneCountInString(input.Name) > 100 || utf8.RuneCountInString(input.Description) > 5000 || utf8.RuneCountInString(input.LearningGoal) > 5000 || utf8.RuneCountInString(input.PassingCriteria) > 5000 {
		return NodeInput{}, serviceError(http.StatusBadRequest, "技能节点内容不合法", nil)
	}
	return input, nil
}

func normalizeIDs(values []uint64) ([]uint64, error) {
	seen := make(map[uint64]bool, len(values))
	result := make([]uint64, 0, len(values))
	for _, value := range values {
		if value == 0 {
			return nil, fmt.Errorf("id must be positive")
		}
		if seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result, nil
}

func hasDependencyCycle(graph map[uint64][]uint64) bool {
	const (
		visiting uint8 = 1
		visited  uint8 = 2
	)
	state := make(map[uint64]uint8, len(graph))
	var visit func(uint64) bool
	visit = func(id uint64) bool {
		if state[id] == visiting {
			return true
		}
		if state[id] == visited {
			return false
		}
		state[id] = visiting
		for _, next := range graph[id] {
			if visit(next) {
				return true
			}
		}
		state[id] = visited
		return false
	}
	for id := range graph {
		if visit(id) {
			return true
		}
	}
	return false
}

func statusFor(nodeID uint64, prereqs []uint64, mastered, practiced map[uint64]bool) string {
	if mastered[nodeID] {
		return StateMastered
	}
	if !allMastered(prereqs, mastered) {
		return StateLocked
	}
	if practiced[nodeID] {
		return StatePracticed
	}
	return StateAvailable
}

func allMastered(ids []uint64, mastered map[uint64]bool) bool {
	for _, id := range ids {
		if !mastered[id] {
			return false
		}
	}
	return true
}

func activePrerequisites(ids []uint64, active map[uint64]bool) []uint64 {
	result := make([]uint64, 0, len(ids))
	for _, id := range ids {
		if active[id] {
			result = append(result, id)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func containsID(ids []uint64, target uint64) bool {
	for _, id := range ids {
		if id == target {
			return true
		}
	}
	return false
}

func nodeView(item model.SkillNode, prereqIDs, assignmentIDs []uint64) Node {
	return Node{
		ID: item.ID, GroupID: item.GroupID, Name: item.Name, Description: item.Description,
		LearningGoal: item.LearningGoal, PassingCriteria: item.PassingCriteria,
		SortOrder: item.SortOrder, Active: item.Active,
		PrerequisiteIDs: append([]uint64{}, prereqIDs...), AssignmentIDs: append([]uint64{}, assignmentIDs...),
	}
}

func linkMaps(dependencies []model.SkillNodePrerequisite, links []model.SkillNodeAssignment) (map[uint64][]uint64, map[uint64][]uint64) {
	depMap := make(map[uint64][]uint64)
	assignmentMap := make(map[uint64][]uint64)
	for _, item := range dependencies {
		depMap[item.SkillNodeID] = append(depMap[item.SkillNodeID], item.PrerequisiteNodeID)
	}
	for _, item := range links {
		assignmentMap[item.SkillNodeID] = append(assignmentMap[item.SkillNodeID], item.AssignmentID)
	}
	return depMap, assignmentMap
}

func eventViewsForNode(events []model.SkillReviewEvent, nodeID uint64) []ReviewEvent {
	result := make([]ReviewEvent, 0)
	for _, event := range events {
		if event.SkillNodeID == nodeID {
			result = append(result, reviewEventView(event))
		}
	}
	return result
}

func eventViewsForUserNode(events []model.SkillReviewEvent, userID, nodeID uint64) []ReviewEvent {
	result := make([]ReviewEvent, 0)
	for _, event := range events {
		if event.UserID == userID && event.SkillNodeID == nodeID {
			result = append(result, reviewEventView(event))
		}
	}
	return result
}

func reviewEventView(event model.SkillReviewEvent) ReviewEvent {
	return ReviewEvent{ID: event.ID, SkillName: event.SkillName, Action: event.Action, ActorID: event.ActorID, ActorName: event.ActorName, EvidenceType: event.EvidenceType, EvidenceID: event.EvidenceID, EvidenceNote: event.EvidenceNote, CreatedAt: event.CreatedAt}
}

func reviewEventViews(events []model.SkillReviewEvent) []ReviewEvent {
	result := make([]ReviewEvent, 0, len(events))
	for _, event := range events {
		result = append(result, reviewEventView(event))
	}
	return result
}

func displayName(user model.User) string {
	if user.RealName != nil && strings.TrimSpace(*user.RealName) != "" {
		return strings.TrimSpace(*user.RealName)
	}
	if user.Nickname != nil && strings.TrimSpace(*user.Nickname) != "" {
		return strings.TrimSpace(*user.Nickname)
	}
	if strings.TrimSpace(user.Name) != "" {
		return strings.TrimSpace(user.Name)
	}
	return "成员"
}

func isDuplicate(err error) bool {
	return err != nil && (strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique constraint"))
}

func notFoundOrInternal(err error, notFound, internal string) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return serviceError(http.StatusNotFound, notFound, err)
	}
	return internalError(internal, err)
}

func serviceError(status int, message string, err error) *ServiceError {
	return &ServiceError{Status: status, Message: message, Err: err}
}

func forbidden(message string) *ServiceError { return serviceError(http.StatusForbidden, message, nil) }

func internalError(message string, err error) *ServiceError {
	return serviceError(http.StatusInternalServerError, message, err)
}

func (s *Service) now() time.Time {
	if s.Now == nil {
		return time.Now()
	}
	return s.Now()
}
