package community

import (
	"context"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"mime/multipart"
	"strings"
	"tarsgo-backend/model"
	"tarsgo-backend/service/organization"
	"time"
	"unicode/utf8"
)

const (
	communityDefaultPageSize = 20
	communityMaxPageSize     = 40
	communityRecentWindow    = 7 * 24 * time.Hour
)

const CommunityDefaultPageSize = communityDefaultPageSize

type CommunityListFilter struct {
	Sort          string
	Category      string
	Keyword       string
	Page          int
	PageSize      int
	Saved         bool
	GroupID       uint64 // Used only by existing group specific FAQ and growth views.
	MineOnly      bool
	FAQOnly       bool
	IncludeGrowth bool
	Status        string
}

type CommunityListResult struct {
	Items         []CommunityListItem     `json:"items"`
	Page          int                     `json:"page"`
	HasMore       bool                    `json:"hasMore"`
	GrowthProfile *CommunityGrowthProfile `json:"growthProfile,omitempty"`
}

type CommunityPostView struct {
	ID                       uint64                        `json:"id"`
	GroupID                  uint64                        `json:"groupId"`
	GroupName                string                        `json:"groupName,omitempty"`
	Category                 string                        `json:"category"`
	Title                    string                        `json:"title"`
	Body                     string                        `json:"body"`
	AuthorID                 uint64                        `json:"authorId"`
	AuthorName               string                        `json:"authorName"`
	AuthorAvatar             *string                       `json:"authorAvatar,omitempty"`
	AuthorLevel              int                           `json:"authorLevel"`
	AuthorFeaturedBadge      *CommunityFeaturedBadge       `json:"authorFeaturedBadge,omitempty"`
	AuthorPositions          []organization.MemberPosition `json:"authorPositions,omitempty"`
	AuthorTeamIdentityStatus string                        `json:"authorTeamIdentityStatus"`
	Visibility               string                        `json:"visibility"`
	IsSolved                 bool                          `json:"isSolved,omitempty"`
	AcceptedSolutionID       *uint64                       `json:"acceptedSolutionId,omitempty"`
	IsFAQ                    bool                          `json:"isFaq,omitempty"`
	IsPinned                 bool                          `json:"isPinned"`
	IsFeatured               bool                          `json:"isFeatured"`
	IsHidden                 bool                          `json:"isHidden"`
	IsLegacy                 bool                          `json:"isLegacy"`
	CreatedAt                time.Time                     `json:"createdAt"`
	EditedAt                 *time.Time                    `json:"editedAt,omitempty"`
	LastReplyAt              *time.Time                    `json:"lastReplyAt,omitempty"`
	CommentCount             int                           `json:"commentCount"`
	ViewCount                int                           `json:"viewCount"`
	Participants             []CommunityParticipant        `json:"participants"`
	LikeCount                int                           `json:"likeCount"`
	LikedByMe                bool                          `json:"likedByMe"`
	SavedByMe                bool                          `json:"savedByMe"`
	CanEdit                  bool                          `json:"canEdit"`
	CanModerate              bool                          `json:"canModerate"`
	Attachments              []AttachmentView              `json:"attachments"`
}

type CommunityParticipant struct {
	ID        uint64  `json:"id"`
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

type CommunityCommentView struct {
	ID                       uint64                        `json:"id"`
	ParentPostID             *uint64                       `json:"parentPostId,omitempty"`
	AuthorID                 uint64                        `json:"authorId"`
	AuthorName               string                        `json:"authorName"`
	AuthorAvatar             *string                       `json:"authorAvatar,omitempty"`
	AuthorLevel              int                           `json:"authorLevel"`
	AuthorFeaturedBadge      *CommunityFeaturedBadge       `json:"authorFeaturedBadge,omitempty"`
	AuthorPositions          []organization.MemberPosition `json:"authorPositions,omitempty"`
	AuthorTeamIdentityStatus string                        `json:"authorTeamIdentityStatus"`
	Body                     string                        `json:"body"`
	CreatedAt                time.Time                     `json:"createdAt"`
	EditedAt                 *time.Time                    `json:"editedAt,omitempty"`
	IsDeleted                bool                          `json:"isDeleted"`
	IsFeatured               bool                          `json:"isFeatured"`
	CanEdit                  bool                          `json:"canEdit"`
	CanLike                  bool                          `json:"canLike"`
	LikedByMe                bool                          `json:"likedByMe"`
	LikeCount                int                           `json:"likeCount"`
	IsAcceptedSolution       bool                          `json:"isAcceptedSolution"`
	CanAcceptSolution        bool                          `json:"canAcceptSolution"`
	Attachments              []AttachmentView              `json:"attachments"`
}

type CommunityPostDetail struct {
	Post     CommunityPostView      `json:"post"`
	Comments []CommunityCommentView `json:"comments"`
}

type CommunityTopicSummary struct {
	ID           uint64     `json:"id"`
	Category     string     `json:"category"`
	Title        string     `json:"title"`
	IsFeatured   bool       `json:"isFeatured"`
	CreatedAt    time.Time  `json:"createdAt"`
	LastReplyAt  *time.Time `json:"lastReplyAt,omitempty"`
	CommentCount int        `json:"commentCount"`
	ViewCount    int        `json:"viewCount"`
}

type CommunityTopicRecommendations struct {
	Related     []CommunityTopicSummary `json:"related"`
	Recommended []CommunityTopicSummary `json:"recommended"`
}

type CommunityPostInput struct {
	Category     string
	Title        string
	Body         string
	Files        []*multipart.FileHeader
	UploadTokens []string
}

type CommunityCommentInput struct {
	Body         string
	ParentPostID *uint64
	Files        []*multipart.FileHeader
	UploadTokens []string
}

type CommunityPostUpdate struct {
	Category     string
	Title        string
	Body         string
	Files        []*multipart.FileHeader
	UploadTokens []string
}

type CommunityCommentUpdate struct {
	Body         string
	Files        []*multipart.FileHeader
	UploadTokens []string
}

type CommunityModerationUpdate struct {
	Pinned *bool
	Hidden *bool
}

type CommunityReactionState struct {
	Active    bool `json:"active"`
	LikeCount int  `json:"likeCount"`
}

type CommunityCommentReactionState struct {
	Active    bool `json:"active"`
	LikeCount int  `json:"likeCount"`
}

type CommunitySolutionUpdate struct {
	CommentID *uint64 `json:"commentId"`
}

type communityPostRow struct {
	model.TrainingQuestion
	GroupName                string  `gorm:"column:group_name"`
	AuthorName               string  `gorm:"column:author_name"`
	AuthorAvatar             *string `gorm:"column:author_avatar"`
	AuthorTeamIdentityStatus string  `gorm:"column:author_team_identity_status"`
	CommentCount             int     `gorm:"column:comment_count"`
	ViewCount                int     `gorm:"column:view_count"`
	LikeCount                int     `gorm:"column:like_count"`
	LikedByMe                bool    `gorm:"column:liked_by_me"`
	SavedByMe                bool    `gorm:"column:saved_by_me"`
}

type communityCommentRow struct {
	model.TrainingQuestionPost
	AuthorName               string  `gorm:"column:author_name"`
	AuthorAvatar             *string `gorm:"column:author_avatar"`
	AuthorTeamIdentityStatus string  `gorm:"column:author_team_identity_status"`
	LikeCount                int     `gorm:"column:like_count"`
	LikedByMe                bool    `gorm:"column:liked_by_me"`
}

func IsCommunityCategory(category string) bool {
	switch category {
	case model.CommunityCategoryTechnology, model.CommunityCategoryProject, model.CommunityCategoryExperience, model.CommunityCategoryTeam:
		return true
	default:
		return false
	}
}

func (s *Service) ListCommunity(ctx context.Context, actor Actor, filter CommunityListFilter) (*CommunityListResult, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后查看吉甲社区")
	}
	if filter.Sort == "" {
		filter.Sort = "latest"
	}
	if filter.Sort != "latest" && filter.Sort != "hot" {
		return nil, badRequest("排序方式不合法")
	}
	if filter.Category != "" && !IsCommunityCategory(filter.Category) {
		return nil, badRequest("社区分类不合法")
	}
	if utf8.RuneCountInString(strings.TrimSpace(filter.Keyword)) > 100 {
		return nil, badRequest("搜索关键词过长")
	}
	if filter.Status != "" && filter.Status != "open" && filter.Status != "solved" {
		return nil, badRequest("历史问题状态筛选不合法")
	}
	if filter.Page < 1 || filter.Page > 1000 {
		return nil, badRequest("页码不合法")
	}
	if filter.PageSize == 0 {
		filter.PageSize = communityDefaultPageSize
	}
	if filter.PageSize < 1 || filter.PageSize > communityMaxPageSize {
		return nil, badRequest("每页数量不合法")
	}
	if filter.GroupID != 0 {
		if err := s.requireGroupMember(ctx, actor, filter.GroupID); err != nil {
			return nil, err
		}
	}

	query, err := s.communityListQuery(ctx, actor, filter.Sort == "hot")
	if err != nil {
		return nil, internalError("读取社区访问范围失败", err)
	}
	if filter.GroupID != 0 {
		query = query.Where("q.group_id = ?", filter.GroupID)
	}
	if filter.Category != "" {
		query = query.Where("q.category = ?", filter.Category)
	}
	if filter.Saved {
		query = query.Where(`EXISTS (
			SELECT 1 FROM community_post_reactions saved
			WHERE saved.question_id = q.id AND saved.user_id = ? AND saved.kind = 'bookmark'
		)`, actor.ID)
	}
	if filter.MineOnly {
		query = query.Where("q.asker_id = ?", actor.ID)
	}
	if filter.FAQOnly {
		query = query.Where("q.is_faq = ? AND q.visibility = ? AND q.is_solved = ?", true, model.TrainingQuestionPublic, true)
	}
	switch filter.Status {
	case "open":
		query = query.Where("q.is_solved = ?", false)
	case "solved":
		query = query.Where("q.is_solved = ?", true)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + escapeLike(keyword) + "%"
		query = query.Where(`(q.title LIKE ? ESCAPE '!' OR q.body LIKE ? ESCAPE '!' OR EXISTS (
			SELECT 1 FROM training_question_posts search_post
			WHERE search_post.question_id = q.id AND search_post.deleted_at IS NULL AND search_post.body LIKE ? ESCAPE '!'
		))`, like, like, like)
	}
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		query = query.Where("q.is_hidden = ?", false)
	}

	if filter.Sort == "hot" {
		query = query.Order("q.is_pinned DESC, recent_interactions DESC, COALESCE(q.last_reply_at, q.created_at) DESC, q.id DESC")
	} else {
		query = query.Order("q.is_pinned DESC, COALESCE(q.last_reply_at, q.created_at) DESC, q.id DESC")
	}
	rows := make([]communityPostRow, 0, filter.PageSize+1)
	if err := query.Limit(filter.PageSize + 1).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error; err != nil {
		return nil, internalError("读取社区帖子失败", err)
	}
	result := &CommunityListResult{Page: filter.Page, HasMore: len(rows) > filter.PageSize}
	if result.HasMore {
		rows = rows[:filter.PageSize]
	}
	result.Items, err = s.communityListViews(ctx, rows)
	if err != nil {
		return nil, err
	}
	if filter.IncludeGrowth {
		result.GrowthProfile, err = s.communityGrowthProfile(ctx, s.db.WithContext(ctx), actor.ID, s.now())
		if err != nil {
			return nil, internalError("读取社区成长档案失败", err)
		}
	}
	return result, nil
}

func (s *Service) HotCommunityPosts(ctx context.Context, actor Actor, limit int) ([]CommunityListItem, error) {
	if limit < 1 || limit > 10 {
		limit = 5
	}
	page, err := s.ListCommunity(ctx, actor, CommunityListFilter{Sort: "hot", Page: 1, PageSize: limit})
	if err != nil {
		return nil, err
	}
	return page.Items, nil
}

func (s *Service) RelatedCommunityPosts(ctx context.Context, actor Actor, postID uint64) (*CommunityTopicRecommendations, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后查看吉甲社区")
	}
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if question.DeletedAt != nil {
		return nil, notFound("帖子不存在")
	}

	baseQuery := func() (*gorm.DB, error) {
		query, queryErr := s.communityPostQuery(ctx, actor)
		if queryErr != nil {
			return nil, internalError("读取社区访问范围失败", queryErr)
		}
		if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
			query = query.Where("q.is_hidden = ?", false)
		}
		return query.Where("q.id <> ?", postID), nil
	}
	query, err := baseQuery()
	if err != nil {
		return nil, err
	}
	var relatedRows []communityPostRow
	if err := query.Where("q.category = ?", question.Category).
		Order("q.is_pinned DESC, recent_interactions DESC, COALESCE(q.last_reply_at, q.created_at) DESC, q.id DESC").
		Limit(5).Find(&relatedRows).Error; err != nil {
		return nil, internalError("读取相关社区话题失败", err)
	}

	excludedIDs := []uint64{postID}
	for _, row := range relatedRows {
		excludedIDs = append(excludedIDs, row.ID)
	}
	query, err = baseQuery()
	if err != nil {
		return nil, err
	}
	var recommendedRows []communityPostRow
	if err := query.Where("q.id NOT IN ?", excludedIDs).
		Order("recent_interactions DESC, COALESCE(q.last_reply_at, q.created_at) DESC, q.id DESC").
		Limit(5).Find(&recommendedRows).Error; err != nil {
		return nil, internalError("读取推荐社区话题失败", err)
	}

	return &CommunityTopicRecommendations{
		Related: summarizeCommunityTopics(relatedRows), Recommended: summarizeCommunityTopics(recommendedRows),
	}, nil
}

func summarizeCommunityTopics(rows []communityPostRow) []CommunityTopicSummary {
	items := make([]CommunityTopicSummary, 0, len(rows))
	for _, row := range rows {
		items = append(items, CommunityTopicSummary{
			ID: row.ID, Category: row.Category, Title: row.Title, IsFeatured: row.IsFeatured, CreatedAt: row.CreatedAt,
			LastReplyAt: row.LastReplyAt, CommentCount: row.CommentCount, ViewCount: row.ViewCount,
		})
	}
	return items
}

func (s *Service) GetCommunityPost(ctx context.Context, actor Actor, postID uint64) (*CommunityPostDetail, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后查看吉甲社区")
	}
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if question.DeletedAt != nil {
		return nil, notFound("帖子不存在")
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&model.CommunityPostViewRecord{
		QuestionID: postID,
		UserID:     actor.ID,
	}).Error; err != nil {
		return nil, internalError("记录社区浏览失败", err)
	}
	rows := []communityPostRow{}
	query, err := s.communityPostQuery(ctx, actor)
	if err != nil {
		return nil, internalError("读取社区访问范围失败", err)
	}
	if err := query.Where("q.id = ?", postID).Limit(1).Find(&rows).Error; err != nil {
		return nil, internalError("读取社区帖子失败", err)
	}
	if len(rows) == 0 {
		return nil, notFound("帖子不存在")
	}
	attachments, err := s.loadAttachments(ctx, []uint64{postID})
	if err != nil {
		return nil, internalError("读取社区附件失败", err)
	}
	views, err := s.communityPostViewsWithAttachments(ctx, actor, rows, attachments)
	if err != nil {
		return nil, err
	}
	detail := &CommunityPostDetail{Post: views[0], Comments: []CommunityCommentView{}}
	var comments []communityCommentRow
	if err := s.db.WithContext(ctx).Table("training_question_posts AS p").
		Select(`p.*, COALESCE(NULLIF(TRIM(u.real_name), ''), '姓名待核实') AS author_name, u.avatar_url AS author_avatar, u.team_identity_status AS author_team_identity_status,
			(SELECT COUNT(*) FROM community_comment_reactions cr WHERE cr.comment_id = p.id) AS like_count,
			EXISTS (SELECT 1 FROM community_comment_reactions mr WHERE mr.comment_id = p.id AND mr.user_id = ?) AS liked_by_me`, actor.ID).
		Joins("JOIN users AS u ON u.id = p.author_id").
		Where("p.question_id = ?", postID).
		Order("p.created_at ASC, p.id ASC").Find(&comments).Error; err != nil {
		return nil, internalError("读取社区回复失败", err)
	}
	commentAuthorIDs := make([]uint64, 0, len(comments))
	for _, comment := range comments {
		commentAuthorIDs = append(commentAuthorIDs, comment.AuthorID)
	}
	commentLevels, err := communityAuthorLevels(ctx, s.db, commentAuthorIDs)
	if err != nil {
		return nil, internalError("读取社区回复作者等级失败", err)
	}
	commentBadges, err := communityAuthorFeaturedBadges(ctx, s.db, commentAuthorIDs)
	if err != nil {
		return nil, internalError("读取社区回复作者徽章失败", err)
	}
	commentPositions := communityAuthorPositions(commentAuthorIDs)
	commentAttachments := make(map[uint64][]model.TrainingQuestionAttachment)
	for _, file := range attachments[postID] {
		if file.PostID != nil {
			commentAttachments[*file.PostID] = append(commentAttachments[*file.PostID], file)
		}
	}
	for _, comment := range comments {
		view := CommunityCommentView{
			ID: comment.ID, ParentPostID: comment.ParentPostID, AuthorID: comment.AuthorID,
			AuthorName: comment.AuthorName, AuthorAvatar: comment.AuthorAvatar, AuthorLevel: commentLevels[comment.AuthorID],
			AuthorFeaturedBadge: commentBadges[comment.AuthorID], AuthorPositions: commentPositions[comment.AuthorID],
			AuthorTeamIdentityStatus: model.NormalizeTeamIdentityStatus(comment.AuthorTeamIdentityStatus), Body: comment.Body,
			CreatedAt: comment.CreatedAt, EditedAt: comment.EditedAt, IsDeleted: comment.DeletedAt != nil, IsFeatured: comment.IsFeatured,
			CanEdit: comment.AuthorID == actor.ID && comment.DeletedAt == nil, CanLike: actor.ID != comment.AuthorID && comment.DeletedAt == nil && !question.IsHidden,
			LikedByMe: comment.LikedByMe, LikeCount: comment.LikeCount,
			IsAcceptedSolution: question.AcceptedSolutionID != nil && *question.AcceptedSolutionID == comment.ID,
			CanAcceptSolution:  question.GroupID == nil && question.Visibility == model.TrainingQuestionPublic && (question.AskerID == actor.ID || actor.RoleName == model.RoleNameSuperAdmin) && !question.IsHidden && comment.DeletedAt == nil && comment.AuthorID != actor.ID && comment.AuthorID != question.AskerID,
			Attachments:        []AttachmentView{},
		}
		if view.IsDeleted {
			view.Body = "该回复已删除"
		} else {
			for _, file := range commentAttachments[comment.ID] {
				view.Attachments = append(view.Attachments, communityAttachmentView(file))
			}
		}
		detail.Comments = append(detail.Comments, view)
	}
	return detail, nil
}

func (s *Service) communityPostQuery(ctx context.Context, actor Actor) (*gorm.DB, error) {
	recentSince := s.now().UTC().Add(-communityRecentWindow)
	query := s.db.WithContext(ctx).Table("training_questions AS q").
		Select(`q.*,
			COALESCE(ug.name, '') AS group_name,
			COALESCE(NULLIF(TRIM(author.real_name), ''), '姓名待核实') AS author_name,
			author.avatar_url AS author_avatar, author.team_identity_status AS author_team_identity_status,
			(SELECT COUNT(*) FROM training_question_posts cp WHERE cp.question_id = q.id AND cp.deleted_at IS NULL) AS comment_count,
			(SELECT COUNT(*) FROM community_post_views pv WHERE pv.question_id = q.id) AS view_count,
			(SELECT COUNT(*) FROM community_post_reactions lr WHERE lr.question_id = q.id AND lr.kind = 'like') AS like_count,
			EXISTS (SELECT 1 FROM community_post_reactions ml WHERE ml.question_id = q.id AND ml.user_id = ? AND ml.kind = 'like') AS liked_by_me,
			EXISTS (SELECT 1 FROM community_post_reactions mb WHERE mb.question_id = q.id AND mb.user_id = ? AND mb.kind = 'bookmark') AS saved_by_me,
			((SELECT COUNT(*) FROM community_post_reactions hr WHERE hr.question_id = q.id AND hr.kind = 'like' AND hr.created_at >= ?) +
			 (SELECT COUNT(*) FROM training_question_posts hp WHERE hp.question_id = q.id AND hp.deleted_at IS NULL AND hp.created_at >= ?)) AS recent_interactions`,
			actor.ID, actor.ID, recentSince, recentSince).
		Joins("LEFT JOIN user_groups AS ug ON ug.id = q.group_id").
		Joins("JOIN users AS author ON author.id = q.asker_id").
		Where("q.deleted_at IS NULL")
	return s.communityPostAccess(ctx, actor, query)
}

// Shared by list/detail so projection changes cannot broaden visibility.
func (s *Service) communityPostAccess(ctx context.Context, actor Actor, query *gorm.DB) (*gorm.DB, error) {
	groupIDs, err := s.communityVisibleLegacyGroupIDs(ctx, actor)
	if err != nil {
		return nil, err
	}
	access := s.db.Session(&gorm.Session{NewDB: true}).Where("(q.group_id IS NULL AND q.visibility = ?)", model.TrainingQuestionPublic)
	if len(groupIDs) > 0 {
		legacyPublic := "(q.group_id IN ? AND ug.status = ? AND ug.name IN ? AND q.visibility = ?)"
		access = access.Or(legacyPublic, groupIDs, model.UserGroupStatusActive, technicalGroups, model.TrainingQuestionPublic)
		if actor.RoleName == model.RoleNameAdmin {
			access = access.Or("(q.group_id IN ? AND ug.status = ? AND ug.name IN ? AND q.visibility = ?)", groupIDs, model.UserGroupStatusActive, technicalGroups, model.TrainingQuestionPrivate)
		}
		if actor.RoleName == model.RoleNameSuperAdmin {
			access = access.Or("(q.group_id IN ? AND ug.status = ? AND ug.name IN ?)", groupIDs, model.UserGroupStatusActive, technicalGroups)
		}
	}
	access = access.Or("(q.asker_id = ? AND q.visibility = ?)", actor.ID, model.TrainingQuestionPrivate)
	return query.Where(access), nil
}

func (s *Service) communityVisibleLegacyGroupIDs(ctx context.Context, actor Actor) ([]uint64, error) {
	if actor.RoleName == model.RoleNameSuperAdmin {
		return activeTechnicalGroupIDs(s.db.WithContext(ctx))
	}
	return memberTechnicalGroupIDs(s.db.WithContext(ctx), actor.ID)
}

func (s *Service) communityPostViewsWithAttachments(ctx context.Context, actor Actor, rows []communityPostRow, attachments map[uint64][]model.TrainingQuestionAttachment) ([]CommunityPostView, error) {
	if len(rows) == 0 {
		return []CommunityPostView{}, nil
	}
	ids := make([]uint64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	authorIDs := make([]uint64, 0, len(rows))
	for _, row := range rows {
		authorIDs = append(authorIDs, row.AskerID)
	}
	authorLevels, err := communityAuthorLevels(ctx, s.db, authorIDs)
	if err != nil {
		return nil, internalError("读取社区作者等级失败", err)
	}
	authorBadges, err := communityAuthorFeaturedBadges(ctx, s.db, authorIDs)
	if err != nil {
		return nil, internalError("读取社区作者徽章失败", err)
	}
	authorPositions := communityAuthorPositions(authorIDs)

	participants, err := s.communityPostParticipants(ctx, ids)
	if err != nil {
		return nil, internalError("读取社区参与成员失败", err)
	}
	views := make([]CommunityPostView, 0, len(rows))
	for _, row := range rows {
		view := CommunityPostView{
			ID: row.ID, GroupID: communityGroupID(row.GroupID), GroupName: row.GroupName,
			Category: row.Category, Title: row.Title, Body: row.Body, AuthorID: row.AskerID,
			AuthorName: row.AuthorName, AuthorAvatar: row.AuthorAvatar, AuthorLevel: authorLevels[row.AskerID],
			AuthorFeaturedBadge: authorBadges[row.AskerID], AuthorPositions: authorPositions[row.AskerID],
			AuthorTeamIdentityStatus: model.NormalizeTeamIdentityStatus(row.AuthorTeamIdentityStatus), Visibility: row.Visibility,
			IsSolved: row.IsSolved, AcceptedSolutionID: row.AcceptedSolutionID, IsFAQ: row.IsFAQ, IsPinned: row.IsPinned, IsFeatured: row.IsFeatured, IsHidden: row.IsHidden,
			IsLegacy: row.GroupID != nil, CreatedAt: row.CreatedAt,
			EditedAt: row.EditedAt, LastReplyAt: row.LastReplyAt, CommentCount: row.CommentCount, ViewCount: row.ViewCount,
			Participants: participants[row.ID], LikeCount: row.LikeCount,
			LikedByMe: row.LikedByMe, SavedByMe: row.SavedByMe, CanEdit: row.AskerID == actor.ID && row.DeletedAt == nil,
			CanModerate: isCommunityAdmin(actor), Attachments: []AttachmentView{},
		}
		for _, file := range attachments[row.ID] {
			if file.PostID == nil {
				view.Attachments = append(view.Attachments, communityAttachmentView(file))
			}
		}
		views = append(views, view)
	}
	return views, nil
}

type communityParticipantRow struct {
	QuestionID uint64  `gorm:"column:question_id"`
	UserID     uint64  `gorm:"column:user_id"`
	Name       string  `gorm:"column:author_name"`
	AvatarURL  *string `gorm:"column:avatar_url"`
}

func (s *Service) communityPostParticipants(ctx context.Context, questionIDs []uint64) (map[uint64][]CommunityParticipant, error) {
	result := make(map[uint64][]CommunityParticipant, len(questionIDs))
	if len(questionIDs) == 0 {
		return result, nil
	}
	var rows []communityParticipantRow
	query := `SELECT ranked.question_id, ranked.user_id, ranked.author_name, ranked.avatar_url
		FROM (
			SELECT latest_per_member.*,
				ROW_NUMBER() OVER (PARTITION BY latest_per_member.question_id ORDER BY latest_per_member.activity_at DESC, latest_per_member.activity_kind DESC, latest_per_member.activity_id DESC, latest_per_member.user_id) AS participant_rank
			FROM (
				SELECT activity.*,
					ROW_NUMBER() OVER (PARTITION BY activity.question_id, activity.user_id ORDER BY activity.activity_at DESC, activity.activity_kind DESC, activity.activity_id DESC) AS member_rank
				FROM (
				SELECT q.id AS question_id, q.asker_id AS user_id,
						COALESCE(NULLIF(TRIM(u.real_name), ''), '姓名待核实') AS author_name,
						u.avatar_url, q.created_at AS activity_at, q.id AS activity_id, 0 AS activity_kind
					FROM training_questions q JOIN users u ON u.id = q.asker_id
					WHERE q.id IN ? AND q.deleted_at IS NULL
					UNION ALL
					SELECT p.question_id, p.author_id AS user_id,
						COALESCE(NULLIF(TRIM(u.real_name), ''), '姓名待核实') AS author_name,
						u.avatar_url, p.created_at AS activity_at, p.id AS activity_id, 1 AS activity_kind
					FROM training_question_posts p JOIN users u ON u.id = p.author_id
					WHERE p.question_id IN ? AND p.deleted_at IS NULL
				) AS activity
			) AS latest_per_member
			WHERE latest_per_member.member_rank = 1
		) AS ranked
		WHERE ranked.participant_rank <= 5
		ORDER BY ranked.question_id, ranked.participant_rank`
	if err := s.db.WithContext(ctx).Raw(query, questionIDs, questionIDs).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.QuestionID] = append(result[row.QuestionID], CommunityParticipant{ID: row.UserID, Name: row.Name, AvatarURL: row.AvatarURL})
	}
	return result, nil
}

func communityAuthorPositions(userIDs []uint64) map[uint64][]organization.MemberPosition {
	result := make(map[uint64][]organization.MemberPosition, len(userIDs))
	for _, userID := range userIDs {
		if userID == 0 {
			continue
		}
		if _, exists := result[userID]; exists {
			continue
		}
		if positions := organization.MemberPositions(userID); len(positions) > 0 {
			result[userID] = positions
		}
	}
	return result
}

func (s *Service) canCommunityComment(ctx context.Context, db *gorm.DB, actor Actor, question *model.TrainingQuestion) bool {
	if question.GroupID == nil {
		return question.Visibility == model.TrainingQuestionPublic
	}
	if question.Visibility == model.TrainingQuestionPrivate {
		return question.AskerID == actor.ID || s.isManager(ctx, db, actor, *question.GroupID)
	}
	return s.requireGroupMemberWithDB(ctx, db, actor, *question.GroupID) == nil
}

func isCommunityAdmin(actor Actor) bool {
	return actor.RoleName == model.RoleNameAdmin || actor.RoleName == model.RoleNameSuperAdmin
}

func communityAttachmentView(file model.TrainingQuestionAttachment) AttachmentView {
	return AttachmentView{ID: file.ID, FileName: file.FileName, ContentType: file.ContentType, Size: file.Size, URL: fmt.Sprintf("/api/community/files/%d", file.ID)}
}
