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
)

const (
	communityDefaultPageSize = 20
	communityMaxPageSize     = 40
	communityRecentWindow    = 7 * 24 * time.Hour
)

const CommunityDefaultPageSize = communityDefaultPageSize

type CommunityListFilter struct {
	Sort     string
	Category string
	Keyword  string
	Page     int
	PageSize int
	Saved    bool
	GroupID  uint64 // Used only by existing group specific FAQ and growth views.
	MineOnly bool
	FAQOnly  bool
	Status   string
}

type CommunityListResult struct {
	Items   []CommunityPostView `json:"items"`
	Page    int                 `json:"page"`
	HasMore bool                `json:"hasMore"`
}

type CommunityPostView struct {
	ID           uint64           `json:"id"`
	GroupID      uint64           `json:"groupId"`
	GroupName    string           `json:"groupName,omitempty"`
	Category     string           `json:"category"`
	Title        string           `json:"title"`
	Body         string           `json:"body"`
	AuthorID     uint64           `json:"authorId"`
	AuthorName   string           `json:"authorName"`
	AuthorAvatar *string          `json:"authorAvatar,omitempty"`
	Visibility   string           `json:"visibility"`
	IsSolved     bool             `json:"isSolved,omitempty"`
	IsFAQ        bool             `json:"isFaq,omitempty"`
	IsPinned     bool             `json:"isPinned"`
	IsHidden     bool             `json:"isHidden"`
	IsLegacy     bool             `json:"isLegacy"`
	CreatedAt    time.Time        `json:"createdAt"`
	EditedAt     *time.Time       `json:"editedAt,omitempty"`
	LastReplyAt  *time.Time       `json:"lastReplyAt,omitempty"`
	CommentCount int              `json:"commentCount"`
	LikeCount    int              `json:"likeCount"`
	LikedByMe    bool             `json:"likedByMe"`
	SavedByMe    bool             `json:"savedByMe"`
	CanEdit      bool             `json:"canEdit"`
	CanModerate  bool             `json:"canModerate"`
	Attachments  []AttachmentView `json:"attachments"`
}

type CommunityCommentView struct {
	ID           uint64           `json:"id"`
	ParentPostID *uint64          `json:"parentPostId,omitempty"`
	AuthorID     uint64           `json:"authorId"`
	AuthorName   string           `json:"authorName"`
	AuthorAvatar *string          `json:"authorAvatar,omitempty"`
	Body         string           `json:"body"`
	CreatedAt    time.Time        `json:"createdAt"`
	EditedAt     *time.Time       `json:"editedAt,omitempty"`
	IsDeleted    bool             `json:"isDeleted"`
	CanEdit      bool             `json:"canEdit"`
	Attachments  []AttachmentView `json:"attachments"`
}

type CommunityPostDetail struct {
	Post     CommunityPostView      `json:"post"`
	Comments []CommunityCommentView `json:"comments"`
}

type CommunityPostInput struct {
	Category string
	Title    string
	Body     string
	Files    []*multipart.FileHeader
}

type CommunityCommentInput struct {
	Body         string
	ParentPostID *uint64
	Files        []*multipart.FileHeader
}

type CommunityPostUpdate struct {
	Category string
	Title    string
	Body     string
}

type CommunityModerationUpdate struct {
	Pinned *bool
	Hidden *bool
}

type CommunityReactionState struct {
	Active    bool `json:"active"`
	LikeCount int  `json:"likeCount"`
}

type communityPostRow struct {
	model.TrainingQuestion
	GroupName    string  `gorm:"column:group_name"`
	AuthorName   string  `gorm:"column:author_name"`
	AuthorAvatar *string `gorm:"column:author_avatar"`
	CommentCount int     `gorm:"column:comment_count"`
	LikeCount    int     `gorm:"column:like_count"`
	LikedByMe    bool    `gorm:"column:liked_by_me"`
	SavedByMe    bool    `gorm:"column:saved_by_me"`
}

type communityCommentRow struct {
	model.TrainingQuestionPost
	AuthorName   string  `gorm:"column:author_name"`
	AuthorAvatar *string `gorm:"column:author_avatar"`
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
		Select(`p.*, COALESCE(NULLIF(TRIM(u.real_name), ''), NULLIF(TRIM(u.nickname), ''), NULLIF(TRIM(u.name), ''), CONCAT('成员 ', u.id)) AS author_name, u.avatar_url AS author_avatar`).
		Joins("JOIN users AS u ON u.id = p.author_id").
		Where("p.question_id = ?", postID).
		Order("p.created_at ASC, p.id ASC").Find(&comments).Error; err != nil {
		return nil, internalError("读取社区回复失败", err)
	}
	attachments, err := s.loadAttachments(ctx, []uint64{postID})
	if err != nil {
		return nil, internalError("读取社区附件失败", err)
	}
	for _, comment := range comments {
		view := CommunityCommentView{
			ID: comment.ID, ParentPostID: comment.ParentPostID, AuthorID: comment.AuthorID,
			AuthorName: comment.AuthorName, AuthorAvatar: comment.AuthorAvatar, Body: comment.Body,
			CreatedAt: comment.CreatedAt, EditedAt: comment.EditedAt, IsDeleted: comment.DeletedAt != nil,
			CanEdit: comment.AuthorID == actor.ID && comment.DeletedAt == nil, Attachments: []AttachmentView{},
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
		if err := tx.Create(&question).Error; err != nil {
			return err
		}
		for _, upload := range uploads {
			file, err := s.files.save(ctx, 0, question.ID, upload)
			if err != nil {
				if errors.Is(err, errQuestionFileTooLarge) {
					return badRequest("单张图片不能超过 10 MB")
				}
				return err
			}
			stored = append(stored, file)
			if storedQuestionFileTotal(stored) > maxQuestionFilesTotal {
				return badRequest("图片总大小不能超过 20 MB")
			}
			if err := tx.Create(&model.TrainingQuestionAttachment{
				QuestionID: question.ID, UploaderID: actor.ID, FileName: file.fileName,
				StoragePath: file.storagePath, ContentType: file.contentType, Size: file.size,
			}).Error; err != nil {
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
	if err := s.db.WithContext(ctx).Model(&model.TrainingQuestion{}).Where("id = ? AND asker_id = ? AND deleted_at IS NULL", postID, actor.ID).
		Updates(map[string]any{"category": category, "title": title, "body": body, "edited_at": now, "updated_at": now}).Error; err != nil {
		return nil, internalError("编辑社区帖子失败", err)
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
	if err := s.db.WithContext(ctx).Model(&model.TrainingQuestion{}).
		Where("id = ? AND asker_id = ? AND deleted_at IS NULL", postID, actor.ID).
		Updates(map[string]any{"deleted_at": now, "updated_at": now}).Error; err != nil {
		return internalError("删除社区帖子失败", err)
	}
	return nil
}

func (s *Service) AddCommunityComment(ctx context.Context, actor Actor, postID uint64, input CommunityCommentInput) (*CommunityPostDetail, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("回复内容不合法")
	}
	uploads, err := validateQuestionUploads(input.Files)
	if err != nil {
		return nil, err
	}
	var stored []*storedQuestionFile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
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
		now := s.now().UTC()
		if err := tx.Model(&question).Updates(map[string]any{"last_reply_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		for _, upload := range uploads {
			file, err := s.files.save(ctx, communityGroupID(question.GroupID), question.ID, upload)
			if err != nil {
				if errors.Is(err, errQuestionFileTooLarge) {
					return badRequest("单张图片不能超过 10 MB")
				}
				return err
			}
			stored = append(stored, file)
			if storedQuestionFileTotal(stored) > maxQuestionFilesTotal {
				return badRequest("图片总大小不能超过 20 MB")
			}
			commentID := comment.ID
			if err := tx.Create(&model.TrainingQuestionAttachment{
				QuestionID: postID, PostID: &commentID, UploaderID: actor.ID,
				FileName: file.fileName, StoragePath: file.storagePath, ContentType: file.contentType, Size: file.size,
			}).Error; err != nil {
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
	body = strings.TrimSpace(body)
	if body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, badRequest("回复内容不合法")
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
	if err := s.db.WithContext(ctx).Model(&model.TrainingQuestionPost{}).
		Where("id = ? AND author_id = ? AND deleted_at IS NULL", commentID, actor.ID).
		Updates(map[string]any{"body": body, "edited_at": s.now().UTC()}).Error; err != nil {
		return nil, internalError("编辑社区回复失败", err)
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
		if err := tx.Model(&model.TrainingQuestionPost{}).
			Where("id = ? AND author_id = ? AND deleted_at IS NULL", commentID, actor.ID).
			Updates(map[string]any{"body": "", "deleted_at": now}).Error; err != nil {
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
		return nil, internalError("删除社区回复失败", err)
	}
	return s.GetCommunityPost(ctx, actor, question.ID)
}

func (s *Service) SetCommunityReaction(ctx context.Context, actor Actor, postID uint64, kind string, active bool) (*CommunityReactionState, error) {
	if kind != "like" && kind != "bookmark" {
		return nil, badRequest("互动类型不合法")
	}
	question, err := s.loadQuestion(ctx, postID)
	if err != nil {
		return nil, err
	}
	if question.DeletedAt != nil {
		return nil, notFound("帖子不存在")
	}
	if err := s.requireVisible(ctx, actor, question); err != nil {
		return nil, err
	}
	if active {
		reaction := model.CommunityPostReaction{QuestionID: postID, UserID: actor.ID, Kind: kind, CreatedAt: s.now().UTC()}
		if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&reaction).Error; err != nil {
			return nil, internalError("保存社区互动失败", err)
		}
	} else if err := s.db.WithContext(ctx).Where("question_id = ? AND user_id = ? AND kind = ?", postID, actor.ID, kind).
		Delete(&model.CommunityPostReaction{}).Error; err != nil {
		return nil, internalError("取消社区互动失败", err)
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.CommunityPostReaction{}).
		Where("question_id = ? AND kind = ?", postID, "like").Count(&count).Error; err != nil {
		return nil, internalError("读取社区点赞数失败", err)
	}
	return &CommunityReactionState{Active: active, LikeCount: int(count)}, nil
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
	if err := s.db.WithContext(ctx).Model(&model.TrainingQuestion{}).Where("id = ? AND deleted_at IS NULL", postID).Updates(updates).Error; err != nil {
		return nil, internalError("更新社区管理状态失败", err)
	}
	return s.GetCommunityPost(ctx, actor, postID)
}

func (s *Service) communityPostQuery(ctx context.Context, actor Actor) (*gorm.DB, error) {
	recentSince := s.now().UTC().Add(-communityRecentWindow)
	query := s.db.WithContext(ctx).Table("training_questions AS q").
		Select(`q.*,
			COALESCE(ug.name, '') AS group_name,
			COALESCE(NULLIF(TRIM(author.real_name), ''), NULLIF(TRIM(author.nickname), ''), NULLIF(TRIM(author.name), ''), CONCAT('成员 ', author.id)) AS author_name,
			author.avatar_url AS author_avatar,
			(SELECT COUNT(*) FROM training_question_posts cp WHERE cp.question_id = q.id AND cp.deleted_at IS NULL) AS comment_count,
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
	attachments, err := s.loadAttachments(ctx, ids)
	if err != nil {
		return nil, internalError("读取社区附件失败", err)
	}
	views := make([]CommunityPostView, 0, len(rows))
	for _, row := range rows {
		view := CommunityPostView{
			ID: row.ID, GroupID: communityGroupID(row.GroupID), GroupName: row.GroupName,
			Category: row.Category, Title: row.Title, Body: row.Body, AuthorID: row.AskerID,
			AuthorName: row.AuthorName, AuthorAvatar: row.AuthorAvatar, Visibility: row.Visibility,
			IsSolved: row.IsSolved, IsFAQ: row.IsFAQ, IsPinned: row.IsPinned, IsHidden: row.IsHidden,
			IsLegacy: row.GroupID != nil, CreatedAt: row.CreatedAt,
			EditedAt: row.EditedAt, LastReplyAt: row.LastReplyAt, CommentCount: row.CommentCount, LikeCount: row.LikeCount,
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
