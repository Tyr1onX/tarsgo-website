package model

import "time"

const (
	ExpeditionVisibilityTeam         = "team"
	ExpeditionVisibilityParticipants = "participants"

	ExpeditionMilestoneOpen      = "open"
	ExpeditionMilestoneSubmitted = "submitted"
	ExpeditionMilestoneAccepted  = "accepted"

	ExpeditionEventProjectCreated = "project_created"
	ExpeditionEventMilestoneAdded = "milestone_added"
	ExpeditionEventEvidence       = "evidence_submitted"
	ExpeditionEventAccepted       = "milestone_accepted"
	ExpeditionEventRevoked        = "acceptance_revoked"
)

// ExpeditionProject stores only cross-group collaboration metadata. Existing
// assignments, skills and growth records remain the source of their own data.
type ExpeditionProject struct {
	ID         uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	CreatorID  uint64    `json:"creatorId" gorm:"column:creator_id;type:bigint unsigned;not null;index:idx_expedition_project_creator"`
	Title      string    `json:"title" gorm:"size:160;not null"`
	Objective  string    `json:"objective" gorm:"type:text;not null"`
	Visibility string    `json:"visibility" gorm:"size:24;not null;default:team;index:idx_expedition_project_visibility"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt  time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

type ExpeditionProjectMilestone struct {
	ID         uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ProjectID  uint64     `json:"projectId" gorm:"column:project_id;type:bigint unsigned;not null;index:idx_expedition_milestone_project,priority:1"`
	GroupID    *uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;default:null;index:idx_expedition_milestone_project,priority:2"`
	Name       string     `json:"name" gorm:"size:160;not null"`
	Criteria   string     `json:"criteria" gorm:"type:text;not null"`
	DueAt      *time.Time `json:"dueAt,omitempty" gorm:"column:due_at;type:datetime;default:null"`
	State      string     `json:"state" gorm:"size:24;not null;default:open;index:idx_expedition_milestone_state"`
	AcceptedBy *uint64    `json:"acceptedBy,omitempty" gorm:"column:accepted_by;type:bigint unsigned;default:null"`
	AcceptedAt *time.Time `json:"acceptedAt,omitempty" gorm:"column:accepted_at;type:datetime;default:null"`
	CreatedAt  time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt  time.Time  `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

type ExpeditionProjectParticipant struct {
	ID        uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ProjectID uint64    `json:"projectId" gorm:"column:project_id;type:bigint unsigned;not null;uniqueIndex:uk_expedition_participant,priority:1;index:idx_expedition_participant_user,priority:2"`
	GroupID   uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_expedition_participant,priority:2"`
	UserID    uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_expedition_participant,priority:3;index:idx_expedition_participant_user,priority:1"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

// ExpeditionProjectEvent is append-only; current milestone state is a
// convenient projection while this table preserves every evidence/review step.
type ExpeditionProjectEvent struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ProjectID   uint64    `json:"projectId" gorm:"column:project_id;type:bigint unsigned;not null;index:idx_expedition_event_project,priority:1"`
	MilestoneID *uint64   `json:"milestoneId,omitempty" gorm:"column:milestone_id;type:bigint unsigned;default:null;index:idx_expedition_event_project,priority:2"`
	GroupID     *uint64   `json:"groupId,omitempty" gorm:"column:group_id;type:bigint unsigned;default:null"`
	ActorID     uint64    `json:"actorId" gorm:"column:actor_id;type:bigint unsigned;not null;index:idx_expedition_event_actor"`
	ActorName   string    `json:"actorName" gorm:"column:actor_name;size:100;not null"`
	Action      string    `json:"action" gorm:"size:32;not null"`
	Content     string    `json:"content" gorm:"type:text;not null"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_expedition_event_created"`
}
