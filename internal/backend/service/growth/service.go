package growth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
	"tarsgo-backend/service/capabilities"
)

var technicalGroupNames = []string{"机械组", "电控组", "视觉组", "AI组"}

type AssignmentReader interface {
	ListMine(ctx context.Context, actor assignment.Actor) ([]assignment.AssignmentView, error)
}

type CapabilityReader interface {
	ListMine(ctx context.Context, userID uint64) (*capabilities.MineResult, error)
}

type Service struct {
	db           *gorm.DB
	assignments  AssignmentReader
	capabilities CapabilityReader
	Now          func() time.Time
}

type Profile struct {
	DisplayName string      `json:"displayName"`
	Groups      []string    `json:"groups"`
	Stats       Statistics  `json:"stats"`
	Events      []Event     `json:"events"`
	NextAction  *NextAction `json:"nextAction,omitempty"`
}

type Statistics struct {
	CompletedChallenges int `json:"completedChallenges"`
	FirstSubmissions    int `json:"firstSubmissions"`
	PracticeProjects    int `json:"practiceProjects"`
	ProjectsAccepted    int `json:"projectsAccepted"`
	QuestionsAsked      int `json:"questionsAsked"`
	DiscussionThreads   int `json:"discussionThreads"`
	ResolvedQuestions   int `json:"resolvedQuestions"`
	FAQContributions    int `json:"faqContributions"`
	WeeklyReports       int `json:"weeklyReports"`
}

type Event struct {
	Key         string    `json:"key"`
	Kind        string    `json:"kind"`
	Title       string    `json:"title"`
	Description string    `json:"description,omitempty"`
	GroupID     uint64    `json:"groupId,omitempty"`
	GroupName   string    `json:"groupName,omitempty"`
	OccurredAt  time.Time `json:"occurredAt"`
	Href        string    `json:"href,omitempty"`
}

type NextAction struct {
	Title  string    `json:"title"`
	Detail string    `json:"detail,omitempty"`
	DueAt  time.Time `json:"dueAt,omitempty"`
	Status string    `json:"status,omitempty"`
	Href   string    `json:"href"`
}

type membershipRow struct {
	ID        uint64
	GroupID   uint64
	GroupName string
	JoinedAt  time.Time
}

type assignmentEventRow struct {
	ID           uint64
	AssignmentID uint64
	GroupID      uint64
	Attempt      uint
	SubmittedAt  time.Time
	Title        string
	GroupName    string
}

type practiceEventRow struct {
	ID        uint64
	ProjectID uint64
	GroupID   uint64
	JoinedAt  time.Time
	Project   string
	GroupName string
}

type practiceSubmissionEventRow struct {
	ID         uint64
	ProjectID  uint64
	GroupID    uint64
	Attempt    uint
	Decision   string
	CreatedAt  time.Time
	ReviewedAt *time.Time
	Project    string
	GroupName  string
}

type reviewEventRow struct {
	ID           uint64
	AssignmentID uint64
	GroupID      uint64
	SubmissionID uint64
	Attempt      uint
	Decision     string
	CreatedAt    time.Time
	Title        string
	GroupName    string
}

type questionRow struct {
	ID         uint64
	GroupID    uint64
	AskerID    uint64
	Title      string
	Visibility string
	IsSolved   bool
	SolvedAt   *time.Time
	IsFAQ      bool
	FAQAt      *time.Time
	CreatedAt  time.Time
	GroupName  string
}

type questionPostRow struct {
	ID         uint64
	QuestionID uint64
	Kind       string
	CreatedAt  time.Time
}

type questionGrowthEventRow struct {
	ID         uint64
	QuestionID uint64
	Kind       string
	OccurredAt time.Time
}

type weeklyReportRow struct {
	ID        uint64
	GroupID   *uint64
	WeekStart model.WeeklyReportWeekStart
	UpdatedAt time.Time
	GroupName string
}

type skillReviewRow struct {
	ID           uint64
	SkillNodeID  uint64
	GroupID      uint64
	Action       string
	EvidenceNote string
	CreatedAt    time.Time
	NodeName     string
	GroupName    string
	ActorName    string
}

func NewService(db *gorm.DB, assignments AssignmentReader, capabilityReaders ...CapabilityReader) *Service {
	service := &Service{db: db, assignments: assignments, Now: time.Now}
	if len(capabilityReaders) > 0 {
		service.capabilities = capabilityReaders[0]
	}
	return service
}

// GetMine builds a private profile from records owned by the authenticated user.
// It never accepts a user ID from the request and does not persist derived events.
func (s *Service) GetMine(ctx context.Context, userID uint64) (*Profile, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	var user model.User
	if err := s.db.WithContext(ctx).Select("id", "name", "nickname", "real_name", "status").
		Where("id = ? AND status = ?", userID, model.UserStatusEnabled).Take(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, serviceError(http.StatusNotFound, "成长档案不存在", nil)
		}
		return nil, internalError("读取成长档案身份失败", err)
	}

	var memberships []membershipRow
	if err := s.db.WithContext(ctx).Table("user_group_members").
		Select("user_group_members.id, user_group_members.group_id, user_group_members.joined_at, user_groups.name AS group_name").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Where("user_group_members.user_id = ? AND user_groups.status = ?", userID, model.UserGroupStatusActive).
		Order("user_group_members.joined_at ASC, user_group_members.id ASC").Scan(&memberships).Error; err != nil {
		return nil, internalError("读取成长档案组别失败", err)
	}

	profile := &Profile{
		DisplayName: displayName(user),
		Groups:      make([]string, 0, len(memberships)),
		Events:      make([]Event, 0),
	}
	groupIDs := make([]uint64, 0, len(memberships))
	groupNames := make(map[uint64]string, len(memberships))
	for _, membership := range memberships {
		profile.Groups = append(profile.Groups, membership.GroupName)
		groupIDs = append(groupIDs, membership.GroupID)
		groupNames[membership.GroupID] = membership.GroupName
		if validEventTime(membership.JoinedAt, s.now()) {
			profile.Events = append(profile.Events, Event{
				Key:        fmt.Sprintf("membership:%d", membership.ID),
				Kind:       "membership",
				Title:      "加入" + membership.GroupName,
				GroupID:    membership.GroupID,
				GroupName:  membership.GroupName,
				OccurredAt: membership.JoinedAt,
			})
		}
	}
	if len(groupIDs) > 0 {
		if err := s.loadSkillEvents(ctx, userID, groupIDs, profile); err != nil {
			return nil, err
		}
		if err := s.loadPracticeEvents(ctx, userID, groupIDs, profile); err != nil {
			return nil, err
		}
	}

	technicalGroupIDs := make([]uint64, 0, len(groupIDs))
	for _, groupID := range groupIDs {
		if containsGroupName(technicalGroupNames, groupNames[groupID]) {
			technicalGroupIDs = append(technicalGroupIDs, groupID)
		}
	}

	if len(groupIDs) > 0 {
		if err := s.loadAssignmentEvents(ctx, userID, groupIDs, profile); err != nil {
			return nil, err
		}
	}
	if len(technicalGroupIDs) > 0 {
		if err := s.loadQuestionEvents(ctx, userID, technicalGroupIDs, profile); err != nil {
			return nil, err
		}
		if s.assignments != nil {
			items, err := s.assignments.ListMine(ctx, assignment.Actor{ID: userID, RoleName: model.RoleNameUser})
			if err != nil {
				return nil, internalError("读取下一项训练任务失败", err)
			}
			for _, item := range items {
				if item.Status == "passed" {
					profile.Stats.CompletedChallenges++
					continue
				}
				if profile.NextAction == nil {
					profile.NextAction = &NextAction{
						Title:  item.Title,
						Detail: item.GroupName,
						DueAt:  item.DueAt,
						Status: item.Status,
						Href:   fmt.Sprintf("/dashboard/assignments?assignmentId=%d", item.ID),
					}
				}
			}
		}
		if profile.NextAction == nil {
			profile.NextAction = &NextAction{Title: "继续技术探索", Detail: "查看组内问题与 FAQ", Href: "/dashboard/questions"}
		}
	}

	if err := s.loadWeeklyReportEvents(ctx, userID, profile); err != nil {
		return nil, err
	}
	if s.capabilities != nil {
		if err := s.loadCapabilityEvents(ctx, userID, profile); err != nil {
			return nil, err
		}
	}
	if profile.NextAction == nil {
		profile.NextAction = &NextAction{Title: "填写本周工作周报", Href: "/dashboard/weekly-reports"}
	}

	profile.Stats.FirstSubmissions = countEvents(profile.Events, "assignment_first_submission")
	profile.Stats.PracticeProjects = countUniqueProjectEvents(profile.Events, "practice_project_joined")
	profile.Stats.ProjectsAccepted = countUniqueProjectEvents(profile.Events, "practice_project_review_passed")
	profile.Stats.QuestionsAsked = countEvents(profile.Events, "question_asked")
	profile.Stats.ResolvedQuestions = countUniqueQuestionEvents(profile.Events, "question_solved")
	profile.Stats.FAQContributions = countUniqueQuestionEvents(profile.Events, "faq_contribution")
	profile.Stats.WeeklyReports = countEvents(profile.Events, "weekly_report")
	sort.SliceStable(profile.Events, func(i, j int) bool {
		if profile.Events[i].OccurredAt.Equal(profile.Events[j].OccurredAt) {
			return profile.Events[i].Key < profile.Events[j].Key
		}
		return profile.Events[i].OccurredAt.Before(profile.Events[j].OccurredAt)
	})
	return profile, nil
}

func (s *Service) loadAssignmentEvents(ctx context.Context, userID uint64, groupIDs []uint64, profile *Profile) error {
	var submissions []assignmentEventRow
	if err := s.db.WithContext(ctx).Table("assignment_submissions").
		Select("assignment_submissions.id, assignment_submissions.assignment_id, assignments.group_id, assignment_submissions.attempt, assignment_submissions.submitted_at, assignments.title, user_groups.name AS group_name").
		Joins("JOIN assignments ON assignments.id = assignment_submissions.assignment_id").
		Joins("JOIN user_groups ON user_groups.id = assignments.group_id").
		Where("assignment_submissions.user_id = ? AND assignments.group_id IN ?", userID, groupIDs).
		Order("assignment_submissions.submitted_at ASC, assignment_submissions.id ASC").Scan(&submissions).Error; err != nil {
		return internalError("读取作业提交成长记录失败", err)
	}
	for _, row := range submissions {
		if !validEventTime(row.SubmittedAt, s.now()) {
			continue
		}
		kind, title := "assignment_resubmission", "重新提交训练作业"
		if row.Attempt == 1 {
			kind, title = "assignment_first_submission", "首次提交训练作业"
		}
		profile.Events = append(profile.Events, Event{
			Key:         fmt.Sprintf("assignment-submission:%d", row.ID),
			Kind:        kind,
			Title:       title,
			Description: row.Title,
			GroupID:     row.GroupID,
			GroupName:   row.GroupName,
			OccurredAt:  row.SubmittedAt,
			Href:        fmt.Sprintf("/dashboard/assignments?assignmentId=%d", row.AssignmentID),
		})
	}

	var reviews []reviewEventRow
	if err := s.db.WithContext(ctx).Table("assignment_reviews").
		Select("assignment_reviews.id, assignment_reviews.submission_id, assignment_reviews.decision, assignment_reviews.created_at, assignment_submissions.assignment_id, assignments.group_id, assignment_submissions.attempt, assignments.title, user_groups.name AS group_name").
		Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").
		Joins("JOIN assignments ON assignments.id = assignment_submissions.assignment_id").
		Joins("JOIN user_groups ON user_groups.id = assignments.group_id").
		Where("assignment_submissions.user_id = ? AND assignments.group_id IN ?", userID, groupIDs).
		Order("assignment_reviews.created_at ASC, assignment_reviews.id ASC").Scan(&reviews).Error; err != nil {
		return internalError("读取作业批改成长记录失败", err)
	}
	for _, row := range reviews {
		if !validEventTime(row.CreatedAt, s.now()) {
			continue
		}
		title := "作业批改"
		if row.Decision == model.AssignmentReviewPassed {
			title = "作业批改通过"
		} else if row.Decision == model.AssignmentReviewNeedsRedo {
			title = "作业退回重做"
		}
		profile.Events = append(profile.Events, Event{
			Key:         fmt.Sprintf("assignment-review:%d", row.ID),
			Kind:        "assignment_review_" + row.Decision,
			Title:       title,
			Description: fmt.Sprintf("%s · 第 %d 次提交", row.Title, row.Attempt),
			GroupID:     row.GroupID,
			GroupName:   row.GroupName,
			OccurredAt:  row.CreatedAt,
			Href:        fmt.Sprintf("/dashboard/assignments?assignmentId=%d", row.AssignmentID),
		})
	}
	return nil
}

func (s *Service) loadPracticeEvents(ctx context.Context, userID uint64, groupIDs []uint64, profile *Profile) error {
	var entries []practiceEventRow
	if err := s.db.WithContext(ctx).Table("practice_entries").
		Select("practice_entries.id, practice_entries.project_id, practice_projects.group_id, practice_entries.joined_at, practice_projects.title AS project, user_groups.name AS group_name").
		Joins("JOIN practice_projects ON practice_projects.id = practice_entries.project_id").
		Joins("JOIN user_groups ON user_groups.id = practice_projects.group_id").
		Where("practice_entries.user_id = ? AND practice_projects.group_id IN ?", userID, groupIDs).
		Order("practice_entries.joined_at ASC, practice_entries.id ASC").Scan(&entries).Error; err != nil {
		return internalError("读取实践项目成长记录失败", err)
	}
	projectIDs := make([]uint64, 0, len(entries))
	for _, row := range entries {
		projectIDs = append(projectIDs, row.ProjectID)
		if validEventTime(row.JoinedAt, s.now()) {
			profile.Events = append(profile.Events, Event{
				Key: fmt.Sprintf("practice-entry:%d", row.ID), Kind: "practice_project_joined",
				Title: "参与实践项目", Description: row.Project, GroupName: row.GroupName,
				GroupID:    row.GroupID,
				OccurredAt: row.JoinedAt, Href: fmt.Sprintf("/dashboard/practice-projects?projectId=%d", row.ProjectID),
			})
		}
	}
	if len(projectIDs) == 0 {
		return nil
	}
	var submissions []practiceSubmissionEventRow
	if err := s.db.WithContext(ctx).Table("practice_submissions").
		Select("practice_submissions.id, practice_submissions.project_id, practice_projects.group_id, practice_submissions.attempt, practice_submissions.decision, practice_submissions.created_at, practice_submissions.reviewed_at, practice_projects.title AS project, user_groups.name AS group_name").
		Joins("JOIN practice_projects ON practice_projects.id = practice_submissions.project_id").
		Joins("JOIN user_groups ON user_groups.id = practice_projects.group_id").
		Where("practice_submissions.user_id = ? AND practice_submissions.project_id IN ?", userID, projectIDs).
		Order("practice_submissions.created_at ASC, practice_submissions.id ASC").Scan(&submissions).Error; err != nil {
		return internalError("读取实践项目提交成长记录失败", err)
	}
	for _, row := range submissions {
		if validEventTime(row.CreatedAt, s.now()) {
			profile.Events = append(profile.Events, Event{
				Key: fmt.Sprintf("practice-submission:%d", row.ID), Kind: "practice_project_submission",
				Title: "提交实践项目进展", Description: fmt.Sprintf("%s · 第 %d 次提交", row.Project, row.Attempt),
				GroupName: row.GroupName, OccurredAt: row.CreatedAt,
				GroupID: row.GroupID,
				Href:    fmt.Sprintf("/dashboard/practice-projects?projectId=%d", row.ProjectID),
			})
		}
		if row.ReviewedAt == nil || !validEventTime(*row.ReviewedAt, s.now()) {
			continue
		}
		title := "实践项目评价完成"
		if row.Decision == model.PracticeReviewPassed {
			title = "实践项目验收通过"
		} else if row.Decision == model.PracticeReviewRedo {
			title = "实践项目需要补充"
		}
		profile.Events = append(profile.Events, Event{
			Key: fmt.Sprintf("practice-review:%d", row.ID), Kind: "practice_project_review_" + row.Decision,
			Title: title, Description: fmt.Sprintf("%s · 第 %d 次提交", row.Project, row.Attempt),
			GroupName: row.GroupName, OccurredAt: *row.ReviewedAt,
			GroupID: row.GroupID,
			Href:    fmt.Sprintf("/dashboard/practice-projects?projectId=%d", row.ProjectID),
		})
	}
	return nil
}

func (s *Service) loadCapabilityEvents(ctx context.Context, userID uint64, profile *Profile) error {
	result, err := s.capabilities.ListMine(ctx, userID)
	if err != nil {
		return internalError("读取能力变化记录失败", err)
	}
	if result == nil {
		return nil
	}
	for _, group := range result.Groups {
		for _, dimension := range group.Dimensions {
			for _, history := range dimension.History {
				if !validEventTime(history.EvaluatedAt, s.now()) {
					continue
				}
				profile.Events = append(profile.Events, Event{
					Key:  fmt.Sprintf("capability:%d:%s:%d", dimension.ID, history.SourceType, history.ID),
					Kind: "capability_evaluation", Title: "能力评价更新",
					Description: fmt.Sprintf("%s · %s", dimension.Name, history.SourceTitle),
					GroupName:   group.GroupName, OccurredAt: history.EvaluatedAt,
					GroupID: group.GroupID,
					Href:    "/dashboard/capabilities",
				})
			}
		}
	}
	return nil
}

func (s *Service) loadQuestionEvents(ctx context.Context, userID uint64, groupIDs []uint64, profile *Profile) error {
	var questions []questionRow
	if err := s.db.WithContext(ctx).Table("training_questions").
		Select("training_questions.id, training_questions.group_id, training_questions.asker_id, training_questions.title, training_questions.visibility, training_questions.is_solved, training_questions.solved_at, training_questions.is_faq, training_questions.faq_at, training_questions.created_at, user_groups.name AS group_name").
		Joins("JOIN user_groups ON user_groups.id = training_questions.group_id").
		Where("training_questions.group_id IN ? AND (training_questions.asker_id = ? OR (training_questions.visibility = ? AND EXISTS (SELECT 1 FROM training_question_posts WHERE training_question_posts.question_id = training_questions.id AND training_question_posts.author_id = ?)))", groupIDs, userID, model.TrainingQuestionPublic, userID).
		Order("training_questions.created_at ASC, training_questions.id ASC").Scan(&questions).Error; err != nil {
		return internalError("读取答疑成长记录失败", err)
	}
	if len(questions) == 0 {
		return nil
	}
	questionIDs := make([]uint64, 0, len(questions))
	questionByID := make(map[uint64]questionRow, len(questions))
	for _, row := range questions {
		questionIDs = append(questionIDs, row.ID)
		questionByID[row.ID] = row
	}

	var milestones []questionGrowthEventRow
	if err := s.db.WithContext(ctx).Table("training_question_growth_events").
		Select("id, question_id, kind, occurred_at").
		Where("question_id IN ?", questionIDs).
		Order("occurred_at ASC, id ASC").Scan(&milestones).Error; err != nil {
		return internalError("读取答疑成长状态记录失败", err)
	}
	milestoneTimes := make(map[string]struct{}, len(milestones))
	for _, row := range milestones {
		question, ok := questionByID[row.QuestionID]
		if !ok || !validEventTime(row.OccurredAt, s.now()) {
			continue
		}
		switch row.Kind {
		case model.TrainingQuestionGrowthSolved:
			if question.AskerID != userID {
				continue
			}
			profile.Events = append(profile.Events, Event{
				Key:         fmt.Sprintf("question:%d:solved:%d", question.ID, row.ID),
				Kind:        "question_solved",
				Title:       "自己的问题得到解决",
				Description: question.Title,
				GroupID:     question.GroupID,
				GroupName:   question.GroupName,
				OccurredAt:  row.OccurredAt,
				Href:        questionHref(question.GroupID, question.ID),
			})
		case model.TrainingQuestionGrowthFAQ:
			if question.Visibility != model.TrainingQuestionPublic {
				continue
			}
			profile.Events = append(profile.Events, Event{
				Key:         fmt.Sprintf("question:%d:faq:%d", question.ID, row.ID),
				Kind:        "faq_contribution",
				Title:       "参与的问题收录为组内 FAQ",
				Description: question.Title,
				GroupID:     question.GroupID,
				GroupName:   question.GroupName,
				OccurredAt:  row.OccurredAt,
				Href:        questionHref(question.GroupID, question.ID),
			})
		default:
			continue
		}
		milestoneTimes[questionMilestoneKey(row.QuestionID, row.Kind, row.OccurredAt)] = struct{}{}
	}

	for _, row := range questions {
		if row.AskerID == userID && validEventTime(row.CreatedAt, s.now()) {
			profile.Events = append(profile.Events, Event{
				Key:         fmt.Sprintf("question:%d:asked", row.ID),
				Kind:        "question_asked",
				Title:       "提出技术问题",
				Description: row.Title,
				GroupID:     row.GroupID,
				GroupName:   row.GroupName,
				OccurredAt:  row.CreatedAt,
				Href:        questionHref(row.GroupID, row.ID),
			})
		}
		if row.AskerID == userID && row.IsSolved && row.SolvedAt != nil && validEventTime(*row.SolvedAt, s.now()) {
			_, alreadyRecorded := milestoneTimes[questionMilestoneKey(row.ID, model.TrainingQuestionGrowthSolved, *row.SolvedAt)]
			if !alreadyRecorded {
				profile.Events = append(profile.Events, Event{
					Key:         fmt.Sprintf("question:%d:solved:source", row.ID),
					Kind:        "question_solved",
					Title:       "自己的问题得到解决",
					Description: row.Title,
					GroupID:     row.GroupID,
					GroupName:   row.GroupName,
					OccurredAt:  *row.SolvedAt,
					Href:        questionHref(row.GroupID, row.ID),
				})
			}
		}
		if row.IsFAQ && row.Visibility == model.TrainingQuestionPublic && row.FAQAt != nil && validEventTime(*row.FAQAt, s.now()) {
			_, alreadyRecorded := milestoneTimes[questionMilestoneKey(row.ID, model.TrainingQuestionGrowthFAQ, *row.FAQAt)]
			if !alreadyRecorded {
				profile.Events = append(profile.Events, Event{
					Key:         fmt.Sprintf("question:%d:faq:source", row.ID),
					Kind:        "faq_contribution",
					Title:       "参与的问题收录为组内 FAQ",
					Description: row.Title,
					GroupID:     row.GroupID,
					GroupName:   row.GroupName,
					OccurredAt:  *row.FAQAt,
					Href:        questionHref(row.GroupID, row.ID),
				})
			}
		}
	}

	var posts []questionPostRow
	if err := s.db.WithContext(ctx).Table("training_question_posts").
		Select("training_question_posts.id, training_question_posts.question_id, training_question_posts.kind, training_question_posts.created_at").
		Joins("JOIN training_questions ON training_questions.id = training_question_posts.question_id").
		Where("training_question_posts.author_id = ? AND training_question_posts.question_id IN ?", userID, questionIDs).
		Order("training_question_posts.created_at ASC, training_question_posts.id ASC").Scan(&posts).Error; err != nil {
		return internalError("读取技术讨论成长记录失败", err)
	}
	discussionThreads := make(map[uint64]struct{})
	for _, row := range posts {
		if !validEventTime(row.CreatedAt, s.now()) {
			continue
		}
		question, ok := questionByID[row.QuestionID]
		if !ok {
			continue
		}
		discussionThreads[row.QuestionID] = struct{}{}
		profile.Events = append(profile.Events, Event{
			Key:         fmt.Sprintf("question-post:%d", row.ID),
			Kind:        "discussion_participation",
			Title:       "参与技术讨论",
			Description: question.Title,
			GroupID:     question.GroupID,
			GroupName:   question.GroupName,
			OccurredAt:  row.CreatedAt,
			Href:        questionHref(question.GroupID, question.ID),
		})
	}
	profile.Stats.DiscussionThreads = len(discussionThreads)
	return nil
}

func (s *Service) loadWeeklyReportEvents(ctx context.Context, userID uint64, profile *Profile) error {
	var reports []weeklyReportRow
	if err := s.db.WithContext(ctx).Table("weekly_reports").
		Select("weekly_reports.id, weekly_reports.group_id, weekly_reports.week_start, weekly_reports.updated_at, COALESCE(user_groups.name, '') AS group_name").
		Joins("LEFT JOIN user_groups ON user_groups.id = weekly_reports.group_id").
		Where("weekly_reports.user_id = ?", userID).
		Order("weekly_reports.week_start ASC, weekly_reports.id ASC").Scan(&reports).Error; err != nil {
		return internalError("读取工作周报成长记录失败", err)
	}
	for _, row := range reports {
		if !validEventTime(row.UpdatedAt, s.now()) {
			continue
		}
		week := string(row.WeekStart)
		profile.Events = append(profile.Events, Event{
			Key:         fmt.Sprintf("weekly-report:%d", row.ID),
			Kind:        "weekly_report",
			Title:       "提交工作周报",
			Description: week,
			GroupID:     uintValue(row.GroupID),
			GroupName:   row.GroupName,
			OccurredAt:  row.UpdatedAt,
			Href:        "/dashboard/weekly-reports?weekStart=" + week,
		})
	}
	return nil
}

func (s *Service) loadSkillEvents(ctx context.Context, userID uint64, groupIDs []uint64, profile *Profile) error {
	var rows []skillReviewRow
	if err := s.db.WithContext(ctx).Table("skill_review_events").
		Select("skill_review_events.id, skill_review_events.skill_node_id, skill_review_events.group_id, skill_review_events.action, skill_review_events.evidence_note, skill_review_events.created_at, skill_review_events.skill_name AS node_name, user_groups.name AS group_name, skill_review_events.actor_name").
		Joins("JOIN user_groups ON user_groups.id = skill_review_events.group_id").
		Where("skill_review_events.user_id = ? AND skill_review_events.group_id IN ?", userID, groupIDs).
		Order("skill_review_events.created_at ASC, skill_review_events.id ASC").Scan(&rows).Error; err != nil {
		return internalError("读取技能成长记录失败", err)
	}
	for _, row := range rows {
		if !validEventTime(row.CreatedAt, s.now()) {
			continue
		}
		title := "确认掌握技能 · " + row.NodeName
		kind := "skill_mastered"
		if row.Action == "revoked" {
			title = "技能确认已撤销 · " + row.NodeName
			kind = "skill_mastery_revoked"
		}
		description := strings.TrimSpace(row.EvidenceNote)
		if row.ActorName != "" {
			actorLabel := "确认人："
			if row.Action == "revoked" {
				actorLabel = "撤销人："
			}
			description = actorLabel + row.ActorName
			if strings.TrimSpace(row.EvidenceNote) != "" {
				description += " · " + strings.TrimSpace(row.EvidenceNote)
			}
		}
		profile.Events = append(profile.Events, Event{
			Key:         fmt.Sprintf("skill-review:%d", row.ID),
			Kind:        kind,
			Title:       title,
			Description: description,
			GroupID:     row.GroupID,
			GroupName:   row.GroupName,
			OccurredAt:  row.CreatedAt,
			Href:        fmt.Sprintf("/dashboard/skills?groupId=%d&nodeId=%d", row.GroupID, row.SkillNodeID),
		})
	}
	return nil
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func displayName(user model.User) string {
	for _, value := range []*string{user.RealName, user.Nickname} {
		if value != nil && strings.TrimSpace(*value) != "" {
			return strings.TrimSpace(*value)
		}
	}
	if value := strings.TrimSpace(user.Name); value != "" {
		return value
	}
	return fmt.Sprintf("成员 %d", user.ID)
}

func validEventTime(value, now time.Time) bool {
	return !value.IsZero() && value.Year() >= 2000 && !value.After(now.Add(24*time.Hour))
}

func uintValue(value *uint64) uint64 {
	if value == nil {
		return 0
	}
	return *value
}

func containsGroupName(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func hasGroupName(rows []membershipRow, target string) bool {
	for _, row := range rows {
		if row.GroupName == target {
			return true
		}
	}
	return false
}

func questionHref(groupID, questionID uint64) string {
	return fmt.Sprintf("/dashboard/questions?groupId=%d&questionId=%d", groupID, questionID)
}

func countEvents(events []Event, kind string) int {
	count := 0
	for _, event := range events {
		if event.Kind == kind {
			count++
		}
	}
	return count
}

func countUniqueProjectEvents(events []Event, kind string) int {
	seen := make(map[string]struct{})
	for _, event := range events {
		if event.Kind != kind {
			continue
		}
		key := event.Href
		if key == "" {
			key = event.GroupName + "\x00" + event.Description
		}
		seen[key] = struct{}{}
	}
	return len(seen)
}

func countUniqueQuestionEvents(events []Event, kind string) int {
	questionIDs := make(map[string]struct{})
	for _, event := range events {
		if event.Kind != kind {
			continue
		}
		parts := strings.SplitN(event.Key, ":", 3)
		if len(parts) == 3 && parts[0] == "question" {
			questionIDs[parts[1]] = struct{}{}
		}
	}
	return len(questionIDs)
}

func questionMilestoneKey(questionID uint64, kind string, occurredAt time.Time) string {
	return fmt.Sprintf("%d:%s:%d", questionID, kind, occurredAt.UTC().Truncate(time.Second).Unix())
}

func serviceError(status int, message string, err error) *ServiceError {
	return &ServiceError{Status: status, Message: message, Err: err}
}

func internalError(message string, err error) *ServiceError {
	return serviceError(http.StatusInternalServerError, message, err)
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
