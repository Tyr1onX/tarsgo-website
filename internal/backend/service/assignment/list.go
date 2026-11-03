package assignment

import (
	"context"
	"time"

	"gorm.io/gorm"
	"tarsgo-backend/model"
)

// Bound IN lists and temporary memory without changing the existing API order.
const assignmentListBatchSize = 200

func (s *Service) listGroupNames(ctx context.Context, items []model.Assignment) (map[uint64]string, error) {
	ids := make([]uint64, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.GroupID)
	}
	var groups []model.UserGroup
	if err := s.db.WithContext(ctx).Select("id", "name").Where("id IN ?", uniqueSortedIDs(ids)).Find(&groups).Error; err != nil {
		return nil, err
	}
	names := make(map[uint64]string, len(groups))
	for _, group := range groups {
		names[group.ID] = group.Name
	}
	for _, id := range ids {
		if _, ok := names[id]; !ok {
			return nil, gorm.ErrRecordNotFound
		}
	}
	return names, nil
}

func (s *Service) memberListViews(ctx context.Context, userID uint64, items []model.Assignment) ([]AssignmentView, error) {
	result := make([]AssignmentView, 0, len(items))
	for start := 0; start < len(items); start += assignmentListBatchSize {
		batch := items[start:min(start+assignmentListBatchSize, len(items))]
		names, err := s.listGroupNames(ctx, batch)
		if err != nil {
			return nil, internalError("读取作业组别失败", err)
		}
		ids := make([]uint64, 0, len(batch))
		for _, item := range batch {
			ids = append(ids, item.ID)
		}
		var latest []model.AssignmentSubmission
		err = s.db.WithContext(ctx).Table("assignment_submissions AS s").Select("s.*").
			Where(`s.assignment_id IN ? AND s.user_id = ? AND NOT EXISTS (
    SELECT 1 FROM assignment_submissions newer WHERE newer.assignment_id = s.assignment_id
     AND newer.user_id = s.user_id AND newer.attempt > s.attempt)`, ids, userID).Find(&latest).Error
		if err != nil {
			return nil, internalError("读取作业提交记录失败", err)
		}
		views, err := s.submissionViews(ctx, latest, false)
		if err != nil {
			return nil, internalError("读取作业提交记录失败", err)
		}
		byAssignment := make(map[uint64][]SubmissionView, len(latest))
		for _, submission := range latest {
			byAssignment[submission.AssignmentID] = []SubmissionView{views[submission.ID]}
		}
		now := s.now()
		for _, item := range batch {
			result = append(result, memberAssignmentView(item, names[item.GroupID], byAssignment[item.ID], now))
		}
	}
	return result, nil
}

func (s *Service) adminListViews(ctx context.Context, items []model.Assignment) ([]AssignmentView, error) {
	result := make([]AssignmentView, 0, len(items))
	for start := 0; start < len(items); start += assignmentListBatchSize {
		batch := items[start:min(start+assignmentListBatchSize, len(items))]
		names, err := s.listGroupNames(ctx, batch)
		if err != nil {
			return nil, internalError("读取作业组别失败", err)
		}
		ids, withdrawn := make([]uint64, 0, len(batch)), make([]uint64, 0)
		for _, item := range batch {
			ids = append(ids, item.ID)
			if item.PublicationStatus == model.AssignmentPublicationWithdrawn {
				withdrawn = append(withdrawn, item.ID)
			}
		}
		var counts []struct {
			AssignmentID                                            uint64
			TargetCount, SubmittedCount, ReviewedCount, PassedCount int
		}
		// Unique targets and anti-joins select exactly one latest attempt/review.
		err = s.db.WithContext(ctx).Raw(`SELECT t.assignment_id, COUNT(*) AS target_count,
   COUNT(s.id) AS submitted_count, COUNT(r.id) AS reviewed_count,
   COALESCE(SUM(r.decision = ?), 0) AS passed_count
   FROM assignment_targets t
   LEFT JOIN assignment_submissions s ON s.assignment_id = t.assignment_id AND s.user_id = t.user_id
    AND NOT EXISTS (SELECT 1 FROM assignment_submissions newer WHERE newer.assignment_id = s.assignment_id AND newer.user_id = s.user_id AND newer.attempt > s.attempt)
   LEFT JOIN assignment_reviews r ON r.submission_id = s.id
    AND NOT EXISTS (SELECT 1 FROM assignment_reviews newer_review WHERE newer_review.submission_id = r.submission_id AND newer_review.id > r.id)
   WHERE t.assignment_id IN ? GROUP BY t.assignment_id`, model.AssignmentReviewPassed, ids).Scan(&counts).Error
		if err != nil {
			return nil, internalError("读取作业统计失败", err)
		}
		byID := make(map[uint64]AssignmentView, len(batch))
		for _, count := range counts {
			byID[count.AssignmentID] = AssignmentView{TargetCount: count.TargetCount, SubmittedCount: count.SubmittedCount, ReviewedCount: count.ReviewedCount, PassedCount: count.PassedCount}
		}
		deletable := make(map[uint64]bool, len(withdrawn))
		if len(withdrawn) > 0 {
			var safeIDs []uint64
			// A review always references a submission; blocking all submissions also
			// blocks reviews. Historical skill/capability references remain protected.
			err = s.db.WithContext(ctx).Raw(`SELECT a.id FROM assignments a WHERE a.id IN ?
    AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM skill_node_assignments l WHERE l.assignment_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM skill_review_events e WHERE e.evidence_type = ? AND e.evidence_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM capability_dimension_sources c WHERE c.source_type = ? AND c.source_id = a.id)`, withdrawn, model.SkillEvidenceAssignment, model.CapabilitySourceAssignment).Scan(&safeIDs).Error
			if err != nil {
				return nil, internalError("读取作业引用状态失败", err)
			}
			for _, id := range safeIDs {
				deletable[id] = true
			}
		}
		for _, item := range batch {
			view, count := assignmentView(item, names[item.GroupID]), byID[item.ID]
			view.TargetCount, view.SubmittedCount, view.ReviewedCount, view.PassedCount = count.TargetCount, count.SubmittedCount, count.ReviewedCount, count.PassedCount
			view.CanDelete = deletable[item.ID]
			result = append(result, view)
		}
	}
	return result, nil
}

type Todo struct {
	ID     uint64    `json:"id"`
	Title  string    `json:"title"`
	DueAt  time.Time `json:"dueAt"`
	Status string    `json:"status"`
}

func (s *Service) ListTodos(ctx context.Context, actor Actor) ([]Todo, error) {
	items, err := s.memberListItems(ctx, actor, true)
	if err != nil {
		return nil, err
	}
	result := make([]Todo, 0)
	now := s.now()
	for start := 0; start < len(items); start += assignmentListBatchSize {
		batch := items[start:min(start+assignmentListBatchSize, len(items))]
		ids := make([]uint64, 0, len(batch))
		for _, item := range batch {
			ids = append(ids, item.ID)
		}
		var rows []struct {
			AssignmentID uint64
			Decision     string
		}
		err := s.db.WithContext(ctx).Raw(`SELECT s.assignment_id, COALESCE(r.decision, '') AS decision
   FROM assignment_submissions s
   LEFT JOIN assignment_reviews r ON r.submission_id=s.id AND NOT EXISTS
    (SELECT 1 FROM assignment_reviews nr WHERE nr.submission_id=r.submission_id AND nr.id>r.id)
   WHERE s.assignment_id IN ? AND s.user_id=? AND NOT EXISTS
    (SELECT 1 FROM assignment_submissions ns WHERE ns.assignment_id=s.assignment_id AND ns.user_id=s.user_id AND ns.attempt>s.attempt)`, ids, actor.ID).Scan(&rows).Error
		if err != nil {
			return nil, internalError("读取作业待办失败", err)
		}
		decisions := make(map[uint64]string, len(rows))
		for _, row := range rows {
			decisions[row.AssignmentID] = row.Decision
		}
		for _, item := range batch {
			decision, submitted := decisions[item.ID]
			status := "pending"
			if submitted {
				if decision != model.AssignmentReviewNeedsRedo {
					continue
				}
				status = decision
			} else if now.After(readStoredUTCWall(item.DueAt)) {
				status = "overdue"
			}
			result = append(result, Todo{ID: item.ID, Title: item.Title, DueAt: readStoredUTCWall(item.DueAt), Status: status})
		}
	}
	return result, nil
}

type AdminTodoSummary struct {
	ReviewCount int64 `json:"reviewCount"`
}

func (s *Service) AdminTodos(ctx context.Context, actor Actor) (*AdminTodoSummary, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	groupIDs, err := managerAssignmentGroupIDs(s.db.WithContext(ctx), actor)
	if err != nil {
		return nil, internalError("读取可管理组别失败", err)
	}
	if len(groupIDs) == 0 {
		return nil, forbidden("当前账号没有可管理的技术组")
	}
	result := &AdminTodoSummary{}
	// Match list semantics: current targets, latest attempt, no review of that
	// attempt, and exclude withdrawn assignments. Do not load files or content.
	err = s.db.WithContext(ctx).Raw(`SELECT COUNT(*) AS review_count
 FROM assignments a
 JOIN assignment_targets t ON t.assignment_id=a.id
 JOIN assignment_submissions s ON s.assignment_id=t.assignment_id AND s.user_id=t.user_id
 WHERE a.group_id IN ? AND a.publication_status <> ?
 AND NOT EXISTS (SELECT 1 FROM assignment_submissions ns WHERE ns.assignment_id=s.assignment_id AND ns.user_id=s.user_id AND ns.attempt>s.attempt)
 AND NOT EXISTS (SELECT 1 FROM assignment_reviews r WHERE r.submission_id=s.id)`, groupIDs, model.AssignmentPublicationWithdrawn).Scan(result).Error
	if err != nil {
		return nil, internalError("读取作业批改待办失败", err)
	}
	return result, nil
}
