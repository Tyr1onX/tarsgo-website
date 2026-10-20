package model

import "time"

const (
	SkillReviewMastered = "mastered"
	SkillReviewRevoked  = "revoked"

	SkillEvidenceAssignment = "assignment"
	SkillEvidenceQuestion   = "question"
	SkillEvidenceNote       = "note"
)

// SkillNode is a configurable learning objective owned by one existing group.
// No node is seeded by migration; each group route is built by its admins.
type SkillNode struct {
	ID              uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID         uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_skill_group_name,priority:1;index:idx_skill_group_active,priority:1"`
	Name            string    `json:"name" gorm:"size:100;not null;uniqueIndex:uk_skill_group_name,priority:2"`
	Description     string    `json:"description" gorm:"type:text;not null"`
	LearningGoal    string    `json:"learningGoal" gorm:"column:learning_goal;type:text;not null"`
	PassingCriteria string    `json:"passingCriteria" gorm:"column:passing_criteria;type:text;not null"`
	SortOrder       uint      `json:"sortOrder" gorm:"column:sort_order;type:int unsigned;not null;default:0"`
	Active          bool      `json:"active" gorm:"type:tinyint(1);not null;default:1;index:idx_skill_group_active,priority:2"`
	CreatedBy       uint64    `json:"createdBy" gorm:"column:created_by;type:bigint unsigned;not null"`
	CreatedAt       time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt       time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (SkillNode) TableName() string { return "skill_nodes" }

type SkillNodePrerequisite struct {
	ID                 uint64 `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	SkillNodeID        uint64 `json:"skillNodeId" gorm:"column:skill_node_id;type:bigint unsigned;not null;uniqueIndex:uk_skill_prerequisite,priority:1;index:idx_skill_prerequisite_target"`
	PrerequisiteNodeID uint64 `json:"prerequisiteNodeId" gorm:"column:prerequisite_node_id;type:bigint unsigned;not null;uniqueIndex:uk_skill_prerequisite,priority:2;index:idx_skill_prerequisite_target"`
}

func (SkillNodePrerequisite) TableName() string { return "skill_node_prerequisites" }

type SkillNodeAssignment struct {
	ID           uint64 `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	SkillNodeID  uint64 `json:"skillNodeId" gorm:"column:skill_node_id;type:bigint unsigned;not null;uniqueIndex:uk_skill_assignment,priority:1;index:idx_skill_assignment_assignment"`
	AssignmentID uint64 `json:"assignmentId" gorm:"column:assignment_id;type:bigint unsigned;not null;uniqueIndex:uk_skill_assignment,priority:2;index:idx_skill_assignment_assignment"`
}

func (SkillNodeAssignment) TableName() string { return "skill_node_assignments" }

// SkillNodeProgress contains only a member's explicit start marker. Challenge,
// practice and mastery are derived from this marker and existing business data.
type SkillNodeProgress struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	SkillNodeID uint64    `json:"skillNodeId" gorm:"column:skill_node_id;type:bigint unsigned;not null;uniqueIndex:uk_skill_progress,priority:1;index:idx_skill_progress_user,priority:2"`
	UserID      uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_skill_progress,priority:2;index:idx_skill_progress_user,priority:1"`
	StartedAt   time.Time `json:"startedAt" gorm:"column:started_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (SkillNodeProgress) TableName() string { return "skill_node_progress" }

// SkillReviewEvent is append-only. Revocation adds an event instead of erasing
// who confirmed a skill and on what basis.
type SkillReviewEvent struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID      uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;index:idx_skill_review_group_user,priority:1"`
	SkillNodeID  uint64    `json:"skillNodeId" gorm:"column:skill_node_id;type:bigint unsigned;not null;index:idx_skill_review_user_node,priority:2"`
	SkillName    string    `json:"skillName" gorm:"column:skill_name;size:100;not null"`
	UserID       uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;index:idx_skill_review_group_user,priority:2;index:idx_skill_review_user_node,priority:1"`
	ActorID      uint64    `json:"actorId" gorm:"column:actor_id;type:bigint unsigned;not null"`
	ActorName    string    `json:"actorName" gorm:"column:actor_name;size:100;not null"`
	Action       string    `json:"action" gorm:"size:20;not null;index:idx_skill_review_user_node,priority:3"`
	EvidenceType string    `json:"evidenceType" gorm:"column:evidence_type;size:20;not null"`
	EvidenceID   *uint64   `json:"evidenceId,omitempty" gorm:"column:evidence_id;type:bigint unsigned;default:null"`
	EvidenceNote string    `json:"evidenceNote" gorm:"column:evidence_note;type:text;not null"`
	CreatedAt    time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_skill_review_user_node,priority:4"`
}

func (SkillReviewEvent) TableName() string { return "skill_review_events" }
