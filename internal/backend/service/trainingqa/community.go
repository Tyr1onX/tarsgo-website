package trainingqa

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
	"tarsgo-backend/service/organization"
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
	Items         []CommunityPostView     `json:"items"`
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

	query, err := s.communityPostQuery(ctx, actor)
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
	result.Items, err = s.communityPostViews(ctx, actor, rows)
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

func (s *Service) HotCommunityPosts(ctx context.Context, actor Actor, limit int) ([]CommunityPostView, error) {
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
	views, err := s.communityPostViews(ctx, actor, rows)
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
	attachments, err := s.loadAttachments(ctx, []uint64{postID})
	if err != nil {
		return nil, internalError("读取社区附件失败", err)
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
			for _, file := range attachments[postID] {
				if file.PostID != nil && *file.PostID == comment.ID {
					view.Attachments = append(view.Attachments, communityAttachmentView(file))
				}
			}
		}
		detail.Comments = append(detail.Comments, view)
	}
	return detail, nil
}

func (s *Service) CreateCommunityPost(ctx context.Context, actor Actor, input CommunityPostInput) (*CommunityPostDetail, error) {
	category := strings.TrimSpace(input.Category)
	title, body := strings.TrimSpace(input.Title), strings.TrimSpace(input.Body)
	if actor.ID == 0 {
		return nil, forbidden("请先登录后发布内容")
	}
	if !IsCommunityCategory(category) || title == "" || utf8.RuneCountInString(title) > 160 || body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("帖子标题、正文或分类不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	question := model.TrainingQuestion{
		GroupID: nil, AskerID: actor.ID, Title: title, Body: body,
		Category: category, Visibility: model.TrainingQuestionPublic,
	}
	var stored []*storedQuestionFile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Serialize this member's daily reward check before any consistent reads.
		if err := lockCommunityXPAwardUser(tx, actor.ID); err != nil {
			return err
		}
		if err := tx.Create(&question).Error; err != nil {
			return err
		}
		if err := grantCommunityContributionXP(tx, actor.ID, communityXPPost, question.ID, question.ID,
			fmt.Sprintf("post:%d", question.ID), s.now()); err != nil {
			return err
		}
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, 0, question.ID, nil, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			if errors.Is(err, errQuestionFileTooLarge) {
				return badRequest("单张图片不能超过 10 MB")
			}
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		if finalBody != question.Body {
			question.Body = finalBody
			if err := tx.Model(&question).Update("body", finalBody).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("发布社区帖子失败", err)
	}
	return s.GetCommunityPost(ctx, actor, question.ID)
}

func (s *Service) UpdateCommunityPost(ctx context.Context, actor Actor, postID uint64, input CommunityPostUpdate) (*CommunityPostDetail, error) {
	category, title, body := strings.TrimSpace(input.Category), strings.TrimSpace(input.Title), strings.TrimSpace(input.Body)
	if !IsCommunityCategory(category) || title == "" || utf8.RuneCountInString(title) > 160 || body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("帖子标题、正文或分类不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if question.AskerID != actor.ID || question.DeletedAt != nil {
		return nil, forbidden("只能编辑自己的帖子")
	}
	now := s.now().UTC()
	var stored []*storedQuestionFile
	var removed []string
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, postID).Error; err != nil {
			return err
		}
		if current.DeletedAt != nil || current.AskerID != actor.ID {
			return forbidden("只能编辑自己的帖子")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &current); err != nil {
			return err
		}
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, communityGroupID(current.GroupID), postID, nil, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		removed, err = removeDeletedInlineAttachments(tx, postID, nil, current.Body, finalBody)
		if err != nil {
			return err
		}
		return tx.Model(&current).Updates(map[string]any{"category": category, "title": title, "body": finalBody, "edited_at": now, "updated_at": now}).Error
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("编辑社区帖子失败", err)
	}
	for _, path := range removed {
		s.files.remove(path)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}

func (s *Service) DeleteCommunityPost(ctx context.Context, actor Actor, postID uint64) error {
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return err
	}
	if question.AskerID != actor.ID || question.DeletedAt != nil {
		return forbidden("只能删除自己的帖子")
	}
	now := s.now().UTC()
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.TrainingQuestion{}).
			Where("id = ? AND asker_id = ? AND deleted_at IS NULL", postID, actor.ID).
			Updates(map[string]any{"deleted_at": now, "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return revokeCommunityQuestionXP(tx, postID, now)
	}); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return notFound("帖子不存在")
		}
		return internalError("删除社区帖子失败", err)
	}
	return nil
}

func (s *Service) AddCommunityComment(ctx context.Context, actor Actor, postID uint64, input CommunityCommentInput) (*CommunityPostDetail, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("回复内容不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	var stored []*storedQuestionFile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the contributor before reads so two comments on different posts
		// cannot both pass the same daily XP quota concurrently.
		if err := lockCommunityXPAwardUser(tx, actor.ID); err != nil {
			return err
		}
		var question model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, postID).Error; err != nil {
			return err
		}
		if question.DeletedAt != nil {
			return notFound("帖子不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if !s.canCommunityComment(ctx, tx, actor, &question) {
			return forbidden("当前账号不能参与这条讨论")
		}
		if input.ParentPostID != nil {
			var parent model.TrainingQuestionPost
			if err := tx.Where("id = ? AND question_id = ? AND deleted_at IS NULL", *input.ParentPostID, postID).Take(&parent).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return badRequest("回复目标不存在")
				}
				return err
			}
		}
		comment := model.TrainingQuestionPost{QuestionID: postID, ParentPostID: input.ParentPostID, AuthorID: actor.ID, Kind: model.TrainingQuestionComment, Body: body}
		if err := tx.Create(&comment).Error; err != nil {
			return err
		}
		if question.GroupID == nil && question.Visibility == model.TrainingQuestionPublic {
			if err := grantCommunityContributionXP(tx, actor.ID, communityXPComment, comment.ID, question.ID,
				fmt.Sprintf("comment:%d", comment.ID), s.now()); err != nil {
				return err
			}
		}
		if actor.ID != question.AskerID && !question.IsHidden {
			if err := recordCommunityXP(tx, question.AskerID, &actor.ID, communityXPReply, comment.ID, question.ID,
				fmt.Sprintf("reply:%d", comment.ID), 1, s.now()); err != nil {
				return err
			}
		}
		now := s.now().UTC()
		if err := tx.Model(&question).Updates(map[string]any{"last_reply_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		commentID := comment.ID
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, communityGroupID(question.GroupID), question.ID, &commentID, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		if finalBody != comment.Body {
			if err := tx.Model(&comment).Update("body", finalBody).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("帖子不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("发布社区回复失败", err)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}

func (s *Service) UpdateCommunityComment(ctx context.Context, actor Actor, commentID uint64, body string) (*CommunityPostDetail, error) {
	return s.UpdateCommunityCommentContent(ctx, actor, commentID, CommunityCommentUpdate{Body: body})
}

func (s *Service) UpdateCommunityCommentContent(ctx context.Context, actor Actor, commentID uint64, input CommunityCommentUpdate) (*CommunityPostDetail, error) {
	body := input.Body
	body = strings.TrimSpace(body)
	if body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("回复内容不合法")
	}
	if err := validateCommunityUploadBindings(body, input.Files, input.UploadTokens); err != nil {
		return nil, err
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	var comment model.TrainingQuestionPost
	if err := s.db.WithContext(ctx).First(&comment, commentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		return nil, internalError("读取社区回复失败", err)
	}
	question, err := s.loadQuestion(ctx, comment.QuestionID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if comment.AuthorID != actor.ID || comment.DeletedAt != nil || question.DeletedAt != nil {
		return nil, forbidden("只能编辑自己的回复")
	}
	var stored []*storedQuestionFile
	var removed []string
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.TrainingQuestionPost
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, commentID).Error; err != nil {
			return err
		}
		if current.AuthorID != actor.ID || current.DeletedAt != nil {
			return forbidden("只能编辑自己的回复")
		}
		var currentQuestion model.TrainingQuestion
		if err := tx.First(&currentQuestion, current.QuestionID).Error; err != nil {
			return err
		}
		if currentQuestion.DeletedAt != nil {
			return notFound("帖子不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &currentQuestion); err != nil {
			return err
		}
		urls, saved, err := saveCommunityAttachments(ctx, tx, s.files, actor.ID, communityGroupID(currentQuestion.GroupID), current.QuestionID, &current.ID, uploads, input.UploadTokens)
		stored = append(stored, saved...)
		if err != nil {
			return err
		}
		finalBody, err := replaceCommunityUploadTokens(body, urls)
		if err != nil {
			return err
		}
		removed, err = removeDeletedInlineAttachments(tx, current.QuestionID, &current.ID, current.Body, finalBody)
		if err != nil {
			return err
		}
		return tx.Model(&current).Updates(map[string]any{"body": finalBody, "edited_at": s.now().UTC()}).Error
	})
	if err != nil {
		for _, file := range stored {
			s.files.remove(file.storagePath)
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("编辑社区回复失败", err)
	}
	for _, path := range removed {
		s.files.remove(path)
	}
	return s.GetCommunityPost(ctx, actor, question.ID)
}

func (s *Service) DeleteCommunityComment(ctx context.Context, actor Actor, commentID uint64) (*CommunityPostDetail, error) {
	var comment model.TrainingQuestionPost
	if err := s.db.WithContext(ctx).First(&comment, commentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		return nil, internalError("读取社区回复失败", err)
	}
	question, err := s.loadQuestion(ctx, comment.QuestionID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if comment.AuthorID != actor.ID || comment.DeletedAt != nil || question.DeletedAt != nil {
		return nil, forbidden("只能删除自己的回复")
	}
	now := s.now().UTC()
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var lockedQuestion model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedQuestion, question.ID).Error; err != nil {
			return err
		}
		var lockedComment model.TrainingQuestionPost
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedComment, commentID).Error; err != nil {
			return err
		}
		if lockedComment.AuthorID != actor.ID || lockedComment.DeletedAt != nil || lockedQuestion.DeletedAt != nil {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Model(&model.TrainingQuestionPost{}).
			Where("id = ? AND author_id = ? AND deleted_at IS NULL", commentID, actor.ID).
			Updates(map[string]any{"body": "", "deleted_at": now}).Error; err != nil {
			return err
		}
		if lockedQuestion.AcceptedSolutionID != nil && *lockedQuestion.AcceptedSolutionID == commentID {
			if err := revokeCommunityXP(tx, fmt.Sprintf("solution:%d:%d", question.ID, commentID), now); err != nil {
				return err
			}
			if err := tx.Model(&lockedQuestion).Updates(map[string]any{
				"accepted_solution_id": nil, "is_solved": false, "solved_by": nil, "solved_at": nil,
			}).Error; err != nil {
				return err
			}
		}
		if err := revokeCommunityCommentXP(tx, question.ID, commentID, now); err != nil {
			return err
		}
		if err := tx.Where("comment_id = ?", commentID).Delete(&model.CommunityCommentReaction{}).Error; err != nil {
			return err
		}
		var latest *time.Time
		if err := tx.Model(&model.TrainingQuestionPost{}).
			Where("question_id = ? AND deleted_at IS NULL", question.ID).
			Select("MAX(created_at)").Scan(&latest).Error; err != nil {
			return err
		}
		return tx.Model(&model.TrainingQuestion{}).Where("id = ?", question.ID).
			Updates(map[string]any{"last_reply_at": latest, "updated_at": now}).Error
	}); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("删除社区回复失败", err)
	}
	return s.GetCommunityPost(ctx, actor, question.ID)
}

func (s *Service) SetCommunityReaction(ctx context.Context, actor Actor, postID uint64, kind string, active bool) (*CommunityReactionState, error) {
	if kind != "like" && kind != "bookmark" {
		return nil, badRequest("互动类型不合法")
	}
	if actor.ID == 0 {
		return nil, forbidden("请先登录后参与互动")
	}
	now := s.now().UTC()
	state := &CommunityReactionState{Active: active}
	var count int64
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var question model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, postID).Error; err != nil {
			return err
		}
		if question.DeletedAt != nil || question.IsHidden {
			return notFound("帖子不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if active {
			reaction := model.CommunityPostReaction{QuestionID: postID, UserID: actor.ID, Kind: kind, CreatedAt: now}
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reaction)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && kind == "like" && actor.ID != question.AskerID {
				if err := recordCommunityXP(tx, question.AskerID, &actor.ID, communityXPPostLike, postID, postID,
					fmt.Sprintf("post_like:%d:%d", postID, actor.ID), 1, now); err != nil {
					return err
				}
			}
		} else {
			result := tx.Where("question_id = ? AND user_id = ? AND kind = ?", postID, actor.ID, kind).Delete(&model.CommunityPostReaction{})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && kind == "like" && actor.ID != question.AskerID {
				if err := revokeCommunityXP(tx, fmt.Sprintf("post_like:%d:%d", postID, actor.ID), now); err != nil {
					return err
				}
			}
		}
		return tx.Model(&model.CommunityPostReaction{}).Where("question_id = ? AND kind = ?", postID, "like").Count(&count).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("帖子不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存社区互动失败", err)
	}
	state.LikeCount = int(count)
	return state, nil
}

func (s *Service) SetCommunityCommentReaction(ctx context.Context, actor Actor, commentID uint64, active bool) (*CommunityCommentReactionState, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后参与互动")
	}
	now := s.now().UTC()
	state := &CommunityCommentReactionState{Active: active}
	var count int64
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var comment model.TrainingQuestionPost
		if err := tx.First(&comment, commentID).Error; err != nil {
			return err
		}
		var question model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, comment.QuestionID).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&comment, commentID).Error; err != nil {
			return err
		}
		if comment.DeletedAt != nil || question.DeletedAt != nil || question.IsHidden {
			return notFound("回复不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if active {
			reaction := model.CommunityCommentReaction{CommentID: commentID, UserID: actor.ID, CreatedAt: now}
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reaction)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && actor.ID != comment.AuthorID {
				if err := recordCommunityXP(tx, comment.AuthorID, &actor.ID, communityXPCommentLike, commentID, question.ID,
					fmt.Sprintf("comment_like:%d:%d", commentID, actor.ID), 1, now); err != nil {
					return err
				}
			}
		} else {
			result := tx.Where("comment_id = ? AND user_id = ?", commentID, actor.ID).Delete(&model.CommunityCommentReaction{})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 && actor.ID != comment.AuthorID {
				if err := revokeCommunityXP(tx, fmt.Sprintf("comment_like:%d:%d", commentID, actor.ID), now); err != nil {
					return err
				}
			}
		}
		return tx.Model(&model.CommunityCommentReaction{}).Where("comment_id = ?", commentID).Count(&count).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("回复不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("保存回复点赞失败", err)
	}
	state.LikeCount = int(count)
	return state, nil
}

func (s *Service) ModerateCommunityPost(ctx context.Context, actor Actor, postID uint64, update CommunityModerationUpdate) (*CommunityPostDetail, error) {
	if !isCommunityAdmin(actor) {
		return nil, forbidden("当前账号无社区管理权限")
	}
	if update.Pinned == nil && update.Hidden == nil {
		return nil, badRequest("请至少指定一项管理状态")
	}
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	updates := map[string]any{"updated_at": s.now().UTC()}
	if update.Pinned != nil {
		updates["is_pinned"] = *update.Pinned
	}
	if update.Hidden != nil {
		updates["is_hidden"] = *update.Hidden
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var locked model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, postID).Error; err != nil {
			return err
		}
		if locked.DeletedAt != nil {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Model(&locked).Updates(updates).Error; err != nil {
			return err
		}
		if update.Hidden != nil && *update.Hidden {
			return revokeCommunityQuestionXP(tx, postID, s.now())
		}
		return nil
	}); err != nil {
		return nil, internalError("更新社区管理状态失败", err)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}

// SetCommunityPostFeatured changes the independent editorial feature state.
// It intentionally does not modify pinning or any community ordering fields.
func (s *Service) SetCommunityPostFeatured(ctx context.Context, actor Actor, postID uint64, featured bool) error {
	if actor.ID == 0 || actor.RoleName != model.RoleNameSuperAdmin {
		return forbidden("仅超级管理员可管理社区精华")
	}
	if postID == 0 {
		return badRequest("帖子编号不合法")
	}
	return s.setCommunityFeatured(ctx, func(tx *gorm.DB) error {
		var post model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Select("id, is_featured").
			Where("id = ? AND deleted_at IS NULL AND visibility = ? AND category IN ?", postID, model.TrainingQuestionPublic, communityFeatureCategories()).
			Take(&post).Error; err != nil {
			return err
		}
		if post.IsFeatured == featured {
			return nil
		}
		return tx.Model(&post).Update("is_featured", featured).Error
	})
}

// SetCommunityReplyFeatured applies the same service-side authorization and
// audit-backed route to an individual reply, without changing its parent post.
func (s *Service) SetCommunityReplyFeatured(ctx context.Context, actor Actor, replyID uint64, featured bool) error {
	if actor.ID == 0 || actor.RoleName != model.RoleNameSuperAdmin {
		return forbidden("仅超级管理员可管理社区精华")
	}
	if replyID == 0 {
		return badRequest("回复编号不合法")
	}
	return s.setCommunityFeatured(ctx, func(tx *gorm.DB) error {
		var reply model.TrainingQuestionPost
		if err := tx.Table("training_question_posts AS cp").
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Select("cp.id, cp.is_featured").
			Joins("JOIN training_questions AS q ON q.id = cp.question_id").
			Where("cp.id = ? AND cp.deleted_at IS NULL AND q.deleted_at IS NULL AND q.visibility = ? AND q.category IN ?", replyID, model.TrainingQuestionPublic, communityFeatureCategories()).
			Take(&reply).Error; err != nil {
			return err
		}
		if reply.IsFeatured == featured {
			return nil
		}
		return tx.Model(&reply).Update("is_featured", featured).Error
	})
}

func (s *Service) setCommunityFeatured(ctx context.Context, update func(*gorm.DB) error) error {
	err := s.db.WithContext(ctx).Transaction(update)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return notFound("社区内容不存在")
	}
	if err != nil {
		return internalError("更新社区精华状态失败", err)
	}
	return nil
}

func communityFeatureCategories() []string {
	return []string{model.CommunityCategoryTechnology, model.CommunityCategoryProject, model.CommunityCategoryExperience, model.CommunityCategoryTeam}
}

// SetCommunitySolution records an explicitly accepted community reply. Older
// group Q&A keeps its separate resolved state because it has no accepted-reply
// pointer and must not guess which answer earned the reward.
func (s *Service) SetCommunitySolution(ctx context.Context, actor Actor, postID uint64, update CommunitySolutionUpdate) (*CommunityPostDetail, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后采纳解决方案")
	}
	now := s.now().UTC()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var question model.TrainingQuestion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&question, postID).Error; err != nil {
			return err
		}
		if question.DeletedAt != nil || question.IsHidden {
			return notFound("帖子不存在")
		}
		if err := s.requireVisibleWithDB(ctx, tx, actor, &question); err != nil {
			return err
		}
		if question.GroupID != nil || question.Visibility != model.TrainingQuestionPublic {
			return badRequest("仅支持在公开社区帖子中采纳解决方案")
		}
		if question.AskerID != actor.ID && actor.RoleName != model.RoleNameSuperAdmin {
			return forbidden("只有帖子作者或超级管理员可以管理最佳答案")
		}
		if update.CommentID == nil {
			if question.AcceptedSolutionID == nil {
				return nil
			}
			acceptedID := *question.AcceptedSolutionID
			if err := revokeCommunityXP(tx, fmt.Sprintf("solution:%d:%d", postID, acceptedID), now); err != nil {
				return err
			}
			return tx.Model(&question).Updates(map[string]any{
				"accepted_solution_id": nil, "is_solved": false, "solved_by": nil, "solved_at": nil, "updated_at": now,
			}).Error
		}
		var answer model.TrainingQuestionPost
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND question_id = ? AND deleted_at IS NULL", *update.CommentID, postID).Take(&answer).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return badRequest("采纳的回复不存在")
			}
			return err
		}
		if answer.AuthorID == question.AskerID || answer.AuthorID == actor.ID {
			return badRequest("不能采纳自己的回复")
		}
		if question.AcceptedSolutionID != nil && *question.AcceptedSolutionID == answer.ID {
			return nil
		}
		if question.AcceptedSolutionID != nil {
			previousID := *question.AcceptedSolutionID
			if err := revokeCommunityXP(tx, fmt.Sprintf("solution:%d:%d", postID, previousID), now); err != nil {
				return err
			}
		}
		if err := recordCommunityXP(tx, answer.AuthorID, &actor.ID, communityXPSolution, answer.ID, postID,
			fmt.Sprintf("solution:%d:%d", postID, answer.ID), 10, now); err != nil {
			return err
		}
		return tx.Model(&question).Updates(map[string]any{
			"accepted_solution_id": answer.ID, "is_solved": true, "solved_by": actor.ID, "solved_at": now, "updated_at": now,
		}).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("帖子不存在")
		}
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新解决方案失败", err)
	}
	return s.GetCommunityPost(ctx, actor, postID)
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

func (s *Service) communityPostViews(ctx context.Context, actor Actor, rows []communityPostRow) ([]CommunityPostView, error) {
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
	attachments, err := s.loadAttachments(ctx, ids)
	if err != nil {
		return nil, internalError("读取社区附件失败", err)
	}
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
