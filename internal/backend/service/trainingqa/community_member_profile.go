package trainingqa

import (
	"context"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
	"tarsgo-backend/service/cobuilderbadge"
	"tarsgo-backend/service/organization"
)

const (
	communityMemberProfileMaxBioRunes = 160
	communityMemberProfilePageSize    = 20
	communityMemberProfileMaxPage     = 10000
)

type CommunityMemberProfileTab string

const (
	CommunityMemberTabOverview CommunityMemberProfileTab = "overview"
	CommunityMemberTabPosts    CommunityMemberProfileTab = "posts"
	CommunityMemberTabReplies  CommunityMemberProfileTab = "replies"
	CommunityMemberTabBadges   CommunityMemberProfileTab = "badges"
	CommunityMemberTabCard     CommunityMemberProfileTab = "card"
)

type CommunityMemberProfileInput struct {
	Bio              *string `json:"bio"`
	FeaturedBadgeKey *string `json:"featuredBadgeKey"`
}

type CommunityMemberProfileResult struct {
	Member     CommunityMemberView          `json:"member"`
	Stats      CommunityMemberStats         `json:"stats"`
	Badges     []cobuilderbadge.PublicBadge `json:"badges,omitempty"`
	Activities []CommunityMemberActivity    `json:"activities,omitempty"`
	Posts      []CommunityMemberPost        `json:"posts,omitempty"`
	Replies    []CommunityMemberReply       `json:"replies,omitempty"`
	Tab        CommunityMemberProfileTab    `json:"tab"`
	Page       int                          `json:"page"`
	HasMore    bool                         `json:"hasMore"`
}

type CommunityMemberView struct {
	ID               uint64                        `json:"id"`
	DisplayName      string                        `json:"displayName"`
	AvatarURL        *string                       `json:"avatarUrl,omitempty"`
	Bio              string                        `json:"bio"`
	Groups           []CommunityMemberGroup        `json:"groups"`
	Positions        []organization.MemberPosition `json:"positions"`
	TeamJoinedAt     *time.Time                    `json:"teamJoinedAt,omitempty"`
	Level            CommunityMemberLevel          `json:"level"`
	FeaturedBadgeKey string                        `json:"featuredBadgeKey,omitempty"`
	FeaturedBadge    *CommunityFeaturedBadge       `json:"featuredBadge,omitempty"`
	IsSelf           bool                          `json:"isSelf"`
}

type CommunityMemberGroup struct {
	Name     string    `json:"name"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joinedAt"`
}

type CommunityMemberLevel struct {
	Level         int     `json:"level"`
	TotalXP       int64   `json:"totalXp"`
	LevelStartXP  int64   `json:"levelStartXp"`
	NextLevelXP   int64   `json:"nextLevelXp"`
	XPToNextLevel int64   `json:"xpToNextLevel"`
	Progress      float64 `json:"progress"`
}

type CommunityFeaturedBadge struct {
	Key         string     `json:"key"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	LevelCode   string     `json:"levelCode"`
	LevelLabel  string     `json:"levelLabel"`
	EarnedAt    *time.Time `json:"earnedAt,omitempty"`
}

type CommunityMemberStats struct {
	PostCount  int64 `json:"postCount"`
	ReplyCount int64 `json:"replyCount"`
	LikeCount  int64 `json:"likeCount"`
}

type CommunityMemberPost struct {
	ID           uint64     `json:"id"`
	Category     string     `json:"category"`
	Title        string     `json:"title"`
	Body         string     `json:"body"`
	CreatedAt    time.Time  `json:"createdAt"`
	EditedAt     *time.Time `json:"editedAt,omitempty"`
	CommentCount int        `json:"commentCount"`
	LikeCount    int        `json:"likeCount"`
	IsPinned     bool       `json:"isPinned"`
}

type CommunityMemberReply struct {
	ID        uint64     `json:"id"`
	PostID    uint64     `json:"postId"`
	PostTitle string     `json:"postTitle"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"createdAt"`
	EditedAt  *time.Time `json:"editedAt,omitempty"`
	LikeCount int        `json:"likeCount"`
	Href      string     `json:"href"`
}

type CommunityMemberActivity struct {
	Kind      string    `json:"kind"`
	ID        uint64    `json:"id"`
	PostID    uint64    `json:"postId"`
	Title     string    `json:"title,omitempty"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	Href      string    `json:"href"`
}

type communityMemberRow struct {
	ID        uint64  `gorm:"column:id"`
	Name      string  `gorm:"column:name"`
	RealName  *string `gorm:"column:real_name"`
	Nickname  *string `gorm:"column:nickname"`
	AvatarURL *string `gorm:"column:avatar_url"`
}

type communityMemberGroupRow struct {
	Name     string    `gorm:"column:name"`
	Role     uint8     `gorm:"column:role"`
	JoinedAt time.Time `gorm:"column:joined_at"`
}

type communityMemberReplyRow struct {
	ID        uint64     `gorm:"column:id"`
	PostID    uint64     `gorm:"column:post_id"`
	PostTitle string     `gorm:"column:post_title"`
	Body      string     `gorm:"column:body"`
	CreatedAt time.Time  `gorm:"column:created_at"`
	EditedAt  *time.Time `gorm:"column:edited_at"`
	LikeCount int        `gorm:"column:like_count"`
}

type communityMemberPostRow struct {
	ID           uint64     `gorm:"column:id"`
	Category     string     `gorm:"column:category"`
	Title        string     `gorm:"column:title"`
	Body         string     `gorm:"column:body"`
	CreatedAt    time.Time  `gorm:"column:created_at"`
	EditedAt     *time.Time `gorm:"column:edited_at"`
	CommentCount int        `gorm:"column:comment_count"`
	LikeCount    int        `gorm:"column:like_count"`
	IsPinned     bool       `gorm:"column:is_pinned"`
}

func (s *Service) GetCommunityMemberProfile(ctx context.Context, actor Actor, memberID uint64, tab CommunityMemberProfileTab, page int) (*CommunityMemberProfileResult, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后查看成员主页")
	}
	if memberID == 0 {
		return nil, badRequest("成员编号不合法")
	}
	if tab == "" {
		tab = CommunityMemberTabOverview
	}
	switch tab {
	case CommunityMemberTabOverview, CommunityMemberTabPosts, CommunityMemberTabReplies, CommunityMemberTabBadges, CommunityMemberTabCard:
	default:
		return nil, badRequest("成员主页栏目不合法")
	}
	if page < 1 || page > communityMemberProfileMaxPage {
		return nil, badRequest("成员主页页码不合法")
	}

	db := s.db.WithContext(ctx)
	var record communityMemberRow
	if err := db.Table("users").Select("id, name, real_name, nickname, avatar_url").Where("id = ? AND status = ?", memberID, model.UserStatusEnabled).Take(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("成员主页不存在")
		}
		return nil, internalError("读取成员资料失败", err)
	}
	displayName := firstCommunityName(record.RealName, record.Nickname, record.Name)
	if displayName == "" {
		displayName = "成员 " + formatCommunityID(record.ID)
	}
	member := CommunityMemberView{
		ID: record.ID, DisplayName: displayName, AvatarURL: record.AvatarURL,
		Bio: "", Groups: []CommunityMemberGroup{}, Positions: organization.MemberPositions(memberID),
		Level: CommunityMemberLevel{Level: 1}, IsSelf: actor.ID == memberID,
	}
	var publicProfile model.CommunityMemberProfile
	if err := db.Where("user_id = ?", memberID).Take(&publicProfile).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, internalError("读取社区公开资料失败", err)
	}
	member.Bio = publicProfile.Bio
	var groupRows []communityMemberGroupRow
	if err := db.Table("user_group_members AS ugm").
		Select("ug.name AS name, ugm.role AS role, ugm.joined_at AS joined_at").
		Joins("JOIN user_groups AS ug ON ug.id = ugm.group_id").
		Where("ugm.user_id = ? AND ug.status = ? AND ug.show = ?", memberID, model.UserGroupStatusActive, 1).
		Order("ugm.joined_at ASC, ug.name ASC").Find(&groupRows).Error; err != nil {
		return nil, internalError("读取成员所属组别失败", err)
	}
	for _, group := range groupRows {
		role := "成员"
		if group.Role == model.UserGroupMemberRoleLeader {
			role = "组长"
		}
		member.Groups = append(member.Groups, CommunityMemberGroup{Name: group.Name, Role: role, JoinedAt: group.JoinedAt})
		if member.TeamJoinedAt == nil || group.JoinedAt.Before(*member.TeamJoinedAt) {
			joinedAt := group.JoinedAt
			member.TeamJoinedAt = &joinedAt
		}
	}
	level, err := s.communityPublicLevel(ctx, db, memberID)
	if err != nil {
		return nil, internalError("读取成员社区等级失败", err)
	}
	member.Level = level
	badge, err := s.communityMemberBadge(ctx, db, memberID)
	if err != nil {
		return nil, internalError("读取成员徽章失败", err)
	}
	member.FeaturedBadge, member.FeaturedBadgeKey = resolveCommunityFeaturedBadge(badge, publicProfile.FeaturedBadgeKey)

	result := &CommunityMemberProfileResult{
		Member: member, Tab: tab, Page: page, Badges: []cobuilderbadge.PublicBadge{},
		Activities: []CommunityMemberActivity{}, Posts: []CommunityMemberPost{}, Replies: []CommunityMemberReply{},
	}
	if tab != CommunityMemberTabCard {
		visiblePosts, err := s.communityPostQuery(ctx, actor)
		if err != nil {
			return nil, err
		}
		visibleMemberPosts := visiblePosts.Where("q.asker_id = ?", memberID)
		if err := visibleMemberPosts.Count(&result.Stats.PostCount).Error; err != nil {
			return nil, internalError("统计成员帖子失败", err)
		}
		repliesQuery, queryErr := s.communityMemberRepliesQuery(ctx, actor, memberID)
		if queryErr != nil {
			return nil, queryErr
		}
		if err := repliesQuery.Count(&result.Stats.ReplyCount).Error; err != nil {
			return nil, internalError("统计成员回复失败", err)
		}
		if err := db.Table("community_post_reactions").Where("kind = ? AND question_id IN (?)", "like", visiblePosts.Where("q.asker_id = ?", memberID).Select("q.id")).Count(&result.Stats.LikeCount).Error; err != nil {
			return nil, internalError("统计成员获赞失败", err)
		}
		var replyLikeCount int64
		if err := db.Table("community_comment_reactions AS cr").
			Joins("JOIN training_question_posts AS cp ON cp.id = cr.comment_id").
			Joins("JOIN (?) AS visible_q ON visible_q.id = cp.question_id", visiblePosts.Select("q.id")).
			Where("cp.author_id = ? AND cp.deleted_at IS NULL", memberID).Count(&replyLikeCount).Error; err != nil {
			return nil, internalError("统计成员回复获赞失败", err)
		}
		result.Stats.LikeCount += replyLikeCount
	}

	switch tab {
	case CommunityMemberTabBadges:
		if badge != nil && len(badge.TierHistory) > 0 {
			result.Badges = append(result.Badges, *badge)
		}
	case CommunityMemberTabPosts:
		rows := make([]communityMemberPostRow, 0, communityMemberProfilePageSize+1)
		query, queryErr := s.communityPostQuery(ctx, actor)
		if queryErr != nil {
			return nil, queryErr
		}
		if err := query.Select(`q.id AS id, q.category AS category, q.title AS title, LEFT(q.body, 2000) AS body,
			q.created_at AS created_at, q.edited_at AS edited_at, q.is_pinned AS is_pinned,
			(SELECT COUNT(*) FROM training_question_posts cp WHERE cp.question_id = q.id AND cp.deleted_at IS NULL) AS comment_count,
			(SELECT COUNT(*) FROM community_post_reactions lr WHERE lr.question_id = q.id AND lr.kind = 'like') AS like_count`).
			Where("q.asker_id = ?", memberID).Order("q.is_pinned DESC, COALESCE(q.last_reply_at, q.created_at) DESC, q.id DESC").
			Offset((page - 1) * communityMemberProfilePageSize).Limit(communityMemberProfilePageSize + 1).Find(&rows).Error; err != nil {
			return nil, internalError("读取成员帖子失败", err)
		}
		result.HasMore = len(rows) > communityMemberProfilePageSize
		if result.HasMore {
			rows = rows[:communityMemberProfilePageSize]
		}
		for _, row := range rows {
			result.Posts = append(result.Posts, CommunityMemberPost{
				ID: row.ID, Category: row.Category, Title: row.Title, Body: communityTextPreview(row.Body, 480),
				CreatedAt: row.CreatedAt, EditedAt: row.EditedAt, CommentCount: row.CommentCount,
				LikeCount: row.LikeCount, IsPinned: row.IsPinned,
			})
		}
	case CommunityMemberTabReplies:
		result.Replies, result.HasMore, err = s.communityMemberReplyPage(ctx, actor, memberID, page, communityMemberProfilePageSize)
		if err != nil {
			return nil, err
		}
	case CommunityMemberTabOverview:
		result.Activities, err = s.communityMemberRecentActivities(ctx, actor, memberID)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (s *Service) UpdateMyCommunityMemberProfile(ctx context.Context, actor Actor, input CommunityMemberProfileInput) (*CommunityMemberProfileResult, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后编辑社区资料")
	}
	if input.Bio == nil && input.FeaturedBadgeKey == nil {
		return nil, badRequest("没有需要保存的社区资料")
	}
	updates := map[string]any{}
	if input.Bio != nil {
		bio := strings.TrimSpace(*input.Bio)
		if utf8.RuneCountInString(bio) > communityMemberProfileMaxBioRunes {
			return nil, badRequest("个人介绍不能超过 160 个字")
		}
		updates["bio"] = bio
	}
	if input.FeaturedBadgeKey != nil {
		key := strings.TrimSpace(*input.FeaturedBadgeKey)
		if key != "" {
			if key != "co_builder" {
				return nil, badRequest("所选徽章不可展示")
			}
			badge, err := s.communityMemberBadge(ctx, s.db.WithContext(ctx), actor.ID)
			if err != nil {
				return nil, internalError("验证代表徽章失败", err)
			}
			if badge == nil || !badge.IsEarned {
				return nil, badRequest("只能选择当前已获得的徽章")
			}
		}
		updates["featured_badge_key"] = key
	}
	profile := model.CommunityMemberProfile{UserID: actor.ID}
	for key, value := range updates {
		switch key {
		case "bio":
			profile.Bio = value.(string)
		case "featured_badge_key":
			profile.FeaturedBadgeKey = value.(string)
		}
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.Assignments(updates),
	}).Create(&profile).Error; err != nil {
		return nil, internalError("保存社区公开资料失败", err)
	}
	return s.GetCommunityMemberProfile(ctx, actor, actor.ID, CommunityMemberTabOverview, 1)
}

func (s *Service) communityPublicLevel(ctx context.Context, db *gorm.DB, memberID uint64) (CommunityMemberLevel, error) {
	var totalXP int64
	if err := db.Model(&model.CommunityExperienceEvent{}).Where("user_id = ? AND revoked_at IS NULL", memberID).
		Select("COALESCE(SUM(points), 0)").Scan(&totalXP).Error; err != nil {
		return CommunityMemberLevel{}, err
	}
	level := CommunityLevelForXP(totalXP)
	startXP, nextXP := communityLevelThreshold(level), communityLevelThreshold(level+1)
	progress := 0.0
	if nextXP > startXP {
		progress = float64(totalXP-startXP) / float64(nextXP-startXP)
	}
	if progress < 0 {
		progress = 0
	} else if progress > 1 {
		progress = 1
	}
	return CommunityMemberLevel{
		Level: level, TotalXP: totalXP, LevelStartXP: startXP, NextLevelXP: nextXP,
		XPToNextLevel: nextXP - totalXP, Progress: progress,
	}, nil
}

func (s *Service) communityMemberBadge(ctx context.Context, db *gorm.DB, memberID uint64) (*cobuilderbadge.PublicBadge, error) {
	var records []model.CoBuilderContribution
	if err := db.Where("user_id = ?", memberID).Order("created_at DESC, id DESC").Find(&records).Error; err != nil {
		return nil, err
	}
	return cobuilderbadge.PublicBadgeFromContributions(records), nil
}

func featuredBadgeView(badge *cobuilderbadge.PublicBadge) *CommunityFeaturedBadge {
	if badge == nil || !badge.IsEarned {
		return nil
	}
	return &CommunityFeaturedBadge{Key: badge.Key, Name: badge.Name, Description: badge.Description, LevelCode: badge.LevelCode, LevelLabel: badge.LevelLabel, EarnedAt: badge.EarnedAt}
}

func resolveCommunityFeaturedBadge(badge *cobuilderbadge.PublicBadge, selectedKey string) (*CommunityFeaturedBadge, string) {
	view := featuredBadgeView(badge)
	if view == nil {
		return nil, ""
	}
	if selectedKey == badge.Key {
		return view, selectedKey
	}
	return view, ""
}

func communityAuthorFeaturedBadges(ctx context.Context, db *gorm.DB, userIDs []uint64) (map[uint64]*CommunityFeaturedBadge, error) {
	result := make(map[uint64]*CommunityFeaturedBadge, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}
	uniqueIDs := make([]uint64, 0, len(userIDs))
	seen := make(map[uint64]struct{}, len(userIDs))
	for _, userID := range userIDs {
		if userID == 0 {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		uniqueIDs = append(uniqueIDs, userID)
	}
	if len(uniqueIDs) == 0 {
		return result, nil
	}
	type profileChoice struct {
		UserID           uint64 `gorm:"column:user_id"`
		FeaturedBadgeKey string `gorm:"column:featured_badge_key"`
	}
	var choices []profileChoice
	if err := db.WithContext(ctx).Table("community_member_profiles").Select("user_id, featured_badge_key").
		Where("user_id IN ?", uniqueIDs).Find(&choices).Error; err != nil {
		return nil, err
	}
	selected := make(map[uint64]string, len(choices))
	for _, choice := range choices {
		selected[choice.UserID] = choice.FeaturedBadgeKey
	}
	var records []model.CoBuilderContribution
	if err := db.WithContext(ctx).Where("user_id IN ?", uniqueIDs).Order("user_id ASC, created_at DESC, id DESC").Find(&records).Error; err != nil {
		return nil, err
	}
	byUser := make(map[uint64][]model.CoBuilderContribution, len(uniqueIDs))
	for _, record := range records {
		byUser[record.UserID] = append(byUser[record.UserID], record)
	}
	for _, userID := range uniqueIDs {
		badge := cobuilderbadge.PublicBadgeFromContributions(byUser[userID])
		result[userID], _ = resolveCommunityFeaturedBadge(badge, selected[userID])
	}
	return result, nil
}

func firstCommunityName(values ...any) string {
	for _, value := range values {
		var text string
		switch typed := value.(type) {
		case string:
			text = typed
		case *string:
			if typed != nil {
				text = *typed
			}
		}
		if text = strings.TrimSpace(text); text != "" {
			return text
		}
	}
	return ""
}

func formatCommunityID(id uint64) string {
	return strconv.FormatUint(id, 10)
}

func (s *Service) communityMemberRepliesQuery(ctx context.Context, actor Actor, memberID uint64) (*gorm.DB, error) {
	visiblePosts, err := s.communityPostQuery(ctx, actor)
	if err != nil {
		return nil, err
	}
	return s.db.WithContext(ctx).Table("training_question_posts AS cp").
		Select(`cp.id AS id, cp.question_id AS post_id, parent_q.title AS post_title, cp.body AS body,
			cp.created_at AS created_at, cp.edited_at AS edited_at,
			(SELECT COUNT(*) FROM community_comment_reactions cr WHERE cr.comment_id = cp.id) AS like_count`).
		Joins("JOIN (?) AS visible_q ON visible_q.id = cp.question_id", visiblePosts.Select("q.id")).
		Joins("JOIN training_questions AS parent_q ON parent_q.id = cp.question_id").
		Where("cp.author_id = ? AND cp.deleted_at IS NULL", memberID), nil
}

func (s *Service) communityMemberReplyPage(ctx context.Context, actor Actor, memberID uint64, page, pageSize int) ([]CommunityMemberReply, bool, error) {
	query, err := s.communityMemberRepliesQuery(ctx, actor, memberID)
	if err != nil {
		return nil, false, err
	}
	rows := make([]communityMemberReplyRow, 0, pageSize+1)
	if err := query.
		Order("cp.created_at DESC, cp.id DESC").Offset((page - 1) * pageSize).Limit(pageSize + 1).Find(&rows).Error; err != nil {
		return nil, false, internalError("读取成员回复失败", err)
	}
	hasMore := len(rows) > pageSize
	if hasMore {
		rows = rows[:pageSize]
	}
	items := make([]CommunityMemberReply, 0, len(rows))
	for _, row := range rows {
		items = append(items, communityMemberReplyView(row))
	}
	return items, hasMore, nil
}

func communityMemberReplyView(row communityMemberReplyRow) CommunityMemberReply {
	return CommunityMemberReply{
		ID: row.ID, PostID: row.PostID, PostTitle: row.PostTitle, Body: communityTextPreview(row.Body, 360),
		CreatedAt: row.CreatedAt, EditedAt: row.EditedAt, LikeCount: row.LikeCount,
		Href: "/dashboard/community/" + formatCommunityID(row.PostID) + "#community-comment-" + formatCommunityID(row.ID),
	}
}

func (s *Service) communityMemberRecentActivities(ctx context.Context, actor Actor, memberID uint64) ([]CommunityMemberActivity, error) {
	postRows := make([]communityPostRow, 0, 6)
	postQuery, err := s.communityPostQuery(ctx, actor)
	if err != nil {
		return nil, err
	}
	if err := postQuery.Where("q.asker_id = ?", memberID).Order("q.created_at DESC, q.id DESC").Limit(6).Find(&postRows).Error; err != nil {
		return nil, internalError("读取成员近期帖子失败", err)
	}
	posts, err := s.communityPostViews(ctx, actor, postRows)
	if err != nil {
		return nil, err
	}
	replies := make([]communityMemberReplyRow, 0, 6)
	replyQuery, err := s.communityMemberRepliesQuery(ctx, actor, memberID)
	if err != nil {
		return nil, err
	}
	if err := replyQuery.Order("cp.created_at DESC, cp.id DESC").Limit(6).Find(&replies).Error; err != nil {
		return nil, internalError("读取成员近期回复失败", err)
	}
	activities := make([]CommunityMemberActivity, 0, len(posts)+len(replies))
	for _, post := range posts {
		activities = append(activities, CommunityMemberActivity{
			Kind: "post", ID: post.ID, PostID: post.ID, Title: post.Title,
			Body: communityTextPreview(post.Body, 260), CreatedAt: post.CreatedAt,
			Href: "/dashboard/community/" + formatCommunityID(post.ID),
		})
	}
	for _, reply := range replies {
		view := communityMemberReplyView(reply)
		activities = append(activities, CommunityMemberActivity{
			Kind: "reply", ID: view.ID, PostID: view.PostID, Title: view.PostTitle,
			Body: view.Body, CreatedAt: view.CreatedAt, Href: view.Href,
		})
	}
	sort.SliceStable(activities, func(i, j int) bool {
		if activities[i].CreatedAt.Equal(activities[j].CreatedAt) {
			return activities[i].ID > activities[j].ID
		}
		return activities[i].CreatedAt.After(activities[j].CreatedAt)
	})
	if len(activities) > 8 {
		activities = activities[:8]
	}
	return activities, nil
}

func communityTextPreview(value string, maxRunes int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	return string(runes[:maxRunes]) + "…"
}
