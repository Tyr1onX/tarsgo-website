package trainingqa

import (
	"context"
	"gorm.io/gorm"
	"time"
)

type CommunityListItem struct {
	ID           uint64                 `json:"id"`
	GroupID      uint64                 `json:"groupId"`
	GroupName    string                 `json:"groupName,omitempty"`
	Category     string                 `json:"category"`
	Title        string                 `json:"title"`
	Visibility   string                 `json:"visibility"`
	IsSolved     bool                   `json:"isSolved,omitempty"`
	IsFAQ        bool                   `json:"isFaq,omitempty"`
	IsPinned     bool                   `json:"isPinned"`
	IsFeatured   bool                   `json:"isFeatured"`
	IsHidden     bool                   `json:"isHidden"`
	IsLegacy     bool                   `json:"isLegacy"`
	CreatedAt    time.Time              `json:"createdAt"`
	LastReplyAt  *time.Time             `json:"lastReplyAt,omitempty"`
	CommentCount int                    `json:"commentCount"`
	ViewCount    int                    `json:"viewCount"`
	Participants []CommunityParticipant `json:"participants"`
	LikeCount    int                    `json:"likeCount"`
	LikedByMe    bool                   `json:"likedByMe"`
	SavedByMe    bool                   `json:"savedByMe"`
}

func (s *Service) communityListQuery(ctx context.Context, actor Actor, hot bool) (*gorm.DB, error) {
	fields := `q.id, q.group_id, q.category, q.title, q.visibility, q.is_solved, q.is_faq,
 q.is_pinned, q.is_featured, q.is_hidden, q.created_at, q.last_reply_at,
 COALESCE(ug.name, '') AS group_name,
 (SELECT COUNT(*) FROM training_question_posts cp WHERE cp.question_id = q.id AND cp.deleted_at IS NULL) AS comment_count,
 (SELECT COUNT(*) FROM community_post_views pv WHERE pv.question_id = q.id) AS view_count,
 (SELECT COUNT(*) FROM community_post_reactions lr WHERE lr.question_id = q.id AND lr.kind = 'like') AS like_count,
 EXISTS (SELECT 1 FROM community_post_reactions ml WHERE ml.question_id = q.id AND ml.user_id = ? AND ml.kind = 'like') AS liked_by_me,
 EXISTS (SELECT 1 FROM community_post_reactions mb WHERE mb.question_id = q.id AND mb.user_id = ? AND mb.kind = 'bookmark') AS saved_by_me`
	args := []any{actor.ID, actor.ID}
	if hot {
		fields += `, ((SELECT COUNT(*) FROM community_post_reactions hr WHERE hr.question_id = q.id AND hr.kind = 'like' AND hr.created_at >= ?) +
  (SELECT COUNT(*) FROM training_question_posts hp WHERE hp.question_id = q.id AND hp.deleted_at IS NULL AND hp.created_at >= ?)) AS recent_interactions`
		since := s.now().UTC().Add(-communityRecentWindow)
		args = append(args, since, since)
	}
	query := s.db.WithContext(ctx).Table("training_questions AS q").Select(fields, args...).
		Joins("LEFT JOIN user_groups AS ug ON ug.id = q.group_id").
		Joins("JOIN users AS author ON author.id = q.asker_id").Where("q.deleted_at IS NULL")
	return s.communityPostAccess(ctx, actor, query)
}

func (s *Service) communityListViews(ctx context.Context, rows []communityPostRow) ([]CommunityListItem, error) {
	views := make([]CommunityListItem, 0, len(rows))
	ids := make([]uint64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	participants, err := s.communityPostParticipants(ctx, ids)
	if err != nil {
		return nil, internalError("读取社区参与成员失败", err)
	}
	for _, row := range rows {
		views = append(views, CommunityListItem{
			ID: row.ID, GroupID: communityGroupID(row.GroupID), GroupName: row.GroupName,
			Category: row.Category, Title: row.Title, Visibility: row.Visibility,
			IsSolved: row.IsSolved, IsFAQ: row.IsFAQ, IsPinned: row.IsPinned, IsFeatured: row.IsFeatured,
			IsHidden: row.IsHidden, IsLegacy: row.GroupID != nil, CreatedAt: row.CreatedAt, LastReplyAt: row.LastReplyAt,
			CommentCount: row.CommentCount, ViewCount: row.ViewCount, Participants: participants[row.ID],
			LikeCount: row.LikeCount, LikedByMe: row.LikedByMe, SavedByMe: row.SavedByMe,
		})
	}
	return views, nil
}
