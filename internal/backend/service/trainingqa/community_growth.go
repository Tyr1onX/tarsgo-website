package trainingqa

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"
	_ "time/tzdata"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const (
	communityXPCheckIn                = "check_in"
	communityXPPost                   = "post"
	communityXPComment                = "comment"
	communityXPAvatar                 = "avatar"
	communityXPPostLike               = "post_like"
	communityXPCommentLike            = "comment_like"
	communityXPReply                  = "reply"
	communityXPSolution               = "accepted_solution"
	communityCheckInLocation          = "Asia/Shanghai"
	communityPostDailyLimit           = 2
	communityCommentDailyLimit        = 5
	communityContributionDailyXPLimit = 30
)

type CommunityGrowthProfile struct {
	Level               int                        `json:"level"`
	TotalXP             int64                      `json:"totalXp"`
	LevelStartXP        int64                      `json:"levelStartXp"`
	NextLevelXP         int64                      `json:"nextLevelXp"`
	XPToNextLevel       int64                      `json:"xpToNextLevel"`
	Progress            float64                    `json:"progress"`
	StreakDays          int                        `json:"streakDays"`
	CheckedInToday      bool                       `json:"checkedInToday"`
	LastCheckInDay      string                     `json:"lastCheckInDay,omitempty"`
	DailyPostsUsed      int                        `json:"dailyPostsUsed"`
	DailyRepliesUsed    int                        `json:"dailyRepliesUsed"`
	DailyContributionXP int64                      `json:"dailyContributionXp"`
	UpcomingCheckIns    []CommunityCheckInPreview  `json:"upcomingCheckIns"`
	RecentEvents        []CommunityExperienceEntry `json:"recentEvents"`
}

type CommunityCheckInPreview struct {
	Day       string `json:"day"`
	StreakDay int    `json:"streakDay"`
	RewardXP  int    `json:"rewardXp"`
	IsToday   bool   `json:"isToday"`
	Completed bool   `json:"completed"`
}

type CommunityExperienceEntry struct {
	ID        uint64    `json:"id"`
	Type      string    `json:"type"`
	Label     string    `json:"label"`
	Points    int       `json:"points"`
	Revoked   bool      `json:"revoked"`
	CreatedAt time.Time `json:"createdAt"`
}

type CommunityCheckInResult struct {
	Profile   *CommunityGrowthProfile `json:"profile"`
	EarnedXP  int                     `json:"earnedXp"`
	StreakDay int                     `json:"streakDay"`
	Already   bool                    `json:"alreadyCheckedIn"`
}

func CommunityLevelForXP(totalXP int64) int {
	if totalXP < 0 {
		totalXP = 0
	}
	level := int(math.Sqrt(float64(totalXP)/100)) + 1
	for level > 1 && communityLevelThreshold(level) > totalXP {
		level--
	}
	for communityLevelThreshold(level+1) <= totalXP {
		level++
	}
	return level
}

func communityLevelThreshold(level int) int64 {
	if level < 1 {
		return 0
	}
	n := int64(level - 1)
	return 100 * n * n
}

func communityCheckInXP(streakDay int) int {
	switch {
	case streakDay >= 7:
		return 15
	case streakDay >= 3:
		return 12
	default:
		return 10
	}
}

func communityGrowthLocation() (*time.Location, error) {
	location, err := time.LoadLocation(communityCheckInLocation)
	if err != nil {
		return nil, fmt.Errorf("load community check-in timezone: %w", err)
	}
	return location, nil
}

func lockCommunityXPAwardUser(tx *gorm.DB, userID uint64) error {
	var member struct{ ID uint64 }
	return tx.Table("users").Select("id").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", userID).Take(&member).Error
}

// grantCommunityContributionXP counts every ledger row, including revoked rows,
// so deleting and recreating content cannot restore a spent daily reward slot.
// Callers must lock the contributor row before any consistent reads in the tx.
func grantCommunityContributionXP(tx *gorm.DB, userID uint64, sourceType string, sourceID, relatedID uint64, sourceKey string, now time.Time) error {
	location, err := communityGrowthLocation()
	if err != nil {
		return err
	}
	localNow := now.In(location)
	dayStart := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, location).UTC()
	dayEnd := dayStart.AddDate(0, 0, 1)
	var usage struct {
		Posts   int64 `gorm:"column:posts"`
		Replies int64 `gorm:"column:replies"`
		Points  int64 `gorm:"column:points"`
	}
	if err := tx.Model(&model.CommunityExperienceEvent{}).
		Select("COALESCE(SUM(CASE WHEN source_type = ? THEN 1 ELSE 0 END), 0) AS posts, COALESCE(SUM(CASE WHEN source_type = ? THEN 1 ELSE 0 END), 0) AS replies, COALESCE(SUM(points), 0) AS points", communityXPPost, communityXPComment).
		Where("user_id = ? AND source_type IN ? AND created_at >= ? AND created_at < ?", userID, []string{communityXPPost, communityXPComment}, dayStart, dayEnd).
		Scan(&usage).Error; err != nil {
		return err
	}
	points := 0
	switch sourceType {
	case communityXPPost:
		if usage.Posts >= communityPostDailyLimit {
			return nil
		}
		points = 10
	case communityXPComment:
		if usage.Replies >= communityCommentDailyLimit {
			return nil
		}
		points = 2
	default:
		return fmt.Errorf("unsupported daily community XP source %q", sourceType)
	}
	if usage.Points+int64(points) > communityContributionDailyXPLimit {
		return nil
	}
	return recordCommunityXP(tx, userID, nil, sourceType, sourceID, relatedID, sourceKey, points, now)
}

func (s *Service) GetCommunityGrowth(ctx context.Context, actor Actor) (*CommunityGrowthProfile, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后查看社区成长")
	}
	profile, err := s.communityGrowthProfile(ctx, s.db.WithContext(ctx), actor.ID, s.now())
	if err != nil {
		return nil, internalError("读取社区成长档案失败", err)
	}
	return profile, nil
}

func (s *Service) CheckInCommunity(ctx context.Context, actor Actor) (*CommunityCheckInResult, error) {
	if actor.ID == 0 {
		return nil, forbidden("请先登录后签到")
	}
	location, err := communityGrowthLocation()
	if err != nil {
		return nil, internalError("读取社区签到时区失败", err)
	}
	now := s.now().UTC()
	today := now.In(location).Format("2006-01-02")
	earnedXP, streakDay, already := 0, 0, false
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Locking the member row serializes concurrent check-ins even when no
		// check-in row exists yet; the unique user/day index is the final guard.
		var member struct{ ID uint64 }
		if err := tx.Table("users").Select("id").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", actor.ID).Take(&member).Error; err != nil {
			return err
		}
		var current model.CommunityCheckIn
		err := tx.Where("user_id = ? AND day = ?", actor.ID, today).Take(&current).Error
		if err == nil {
			streakDay, already = current.StreakDays, true
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var latest model.CommunityCheckIn
		latestErr := tx.Where("user_id = ? AND day < ?", actor.ID, today).Order("day DESC").Take(&latest).Error
		if latestErr != nil && !errors.Is(latestErr, gorm.ErrRecordNotFound) {
			return latestErr
		}
		streakDay = 1
		if latestErr == nil {
			previousDay := now.In(location).AddDate(0, 0, -1).Format("2006-01-02")
			if latest.Day == previousDay {
				streakDay = latest.StreakDays + 1
			}
		}
		earnedXP = communityCheckInXP(streakDay)
		checkIn := model.CommunityCheckIn{UserID: actor.ID, Day: today, StreakDays: streakDay, AwardedXP: earnedXP, CreatedAt: now}
		if err := tx.Create(&checkIn).Error; err != nil {
			return err
		}
		return recordCommunityXP(tx, actor.ID, nil, communityXPCheckIn, 0, 0,
			fmt.Sprintf("check_in:%d:%s", actor.ID, today), earnedXP, now)
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("账号不存在")
		}
		return nil, internalError("每日签到失败", err)
	}
	profile, err := s.communityGrowthProfile(ctx, s.db.WithContext(ctx), actor.ID, now)
	if err != nil {
		return nil, internalError("签到成功，但读取成长信息失败", err)
	}
	return &CommunityCheckInResult{Profile: profile, EarnedXP: earnedXP, StreakDay: streakDay, Already: already}, nil
}

func (s *Service) communityGrowthProfile(ctx context.Context, db *gorm.DB, userID uint64, now time.Time) (*CommunityGrowthProfile, error) {
	location, err := communityGrowthLocation()
	if err != nil {
		return nil, err
	}
	todayDate := now.In(location)
	today := todayDate.Format("2006-01-02")
	var totalXP int64
	if err := db.Model(&model.CommunityExperienceEvent{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Select("COALESCE(SUM(points), 0)").Scan(&totalXP).Error; err != nil {
		return nil, err
	}
	var latest model.CommunityCheckIn
	latestErr := db.Where("user_id = ? AND day <= ?", userID, today).Order("day DESC").Take(&latest).Error
	if latestErr != nil && !errors.Is(latestErr, gorm.ErrRecordNotFound) {
		return nil, latestErr
	}
	var todayCheckIn model.CommunityCheckIn
	todayErr := db.Where("user_id = ? AND day = ?", userID, today).Take(&todayCheckIn).Error
	if todayErr != nil && !errors.Is(todayErr, gorm.ErrRecordNotFound) {
		return nil, todayErr
	}
	checkedIn := todayErr == nil
	streakDays := 0
	if latestErr == nil {
		yesterday := todayDate.AddDate(0, 0, -1).Format("2006-01-02")
		if latest.Day == today || latest.Day == yesterday {
			streakDays = latest.StreakDays
		}
	}
	level := CommunityLevelForXP(totalXP)
	levelStart, nextLevel := communityLevelThreshold(level), communityLevelThreshold(level+1)
	progress := 0.0
	if nextLevel > levelStart {
		progress = float64(totalXP-levelStart) / float64(nextLevel-levelStart)
	}
	if progress < 0 {
		progress = 0
	}
	if progress > 1 {
		progress = 1
	}
	profile := &CommunityGrowthProfile{
		Level: level, TotalXP: totalXP, LevelStartXP: levelStart, NextLevelXP: nextLevel,
		XPToNextLevel: nextLevel - totalXP, Progress: progress,
		StreakDays: streakDays, CheckedInToday: checkedIn,
		UpcomingCheckIns: make([]CommunityCheckInPreview, 0, 7), RecentEvents: []CommunityExperienceEntry{},
	}
	dayStart := time.Date(todayDate.Year(), todayDate.Month(), todayDate.Day(), 0, 0, 0, 0, location).UTC()
	dayEnd := dayStart.AddDate(0, 0, 1)
	var dailyRewards struct {
		Posts   int64 `gorm:"column:posts"`
		Replies int64 `gorm:"column:replies"`
		XP      int64 `gorm:"column:xp"`
	}
	if err := db.Model(&model.CommunityExperienceEvent{}).
		Select("COALESCE(SUM(CASE WHEN source_type = ? THEN 1 ELSE 0 END), 0) AS posts, COALESCE(SUM(CASE WHEN source_type = ? THEN 1 ELSE 0 END), 0) AS replies, COALESCE(SUM(CASE WHEN revoked_at IS NULL THEN points ELSE 0 END), 0) AS xp", communityXPPost, communityXPComment).
		Where("user_id = ? AND source_type IN ? AND created_at >= ? AND created_at < ?", userID, []string{communityXPPost, communityXPComment}, dayStart, dayEnd).
		Scan(&dailyRewards).Error; err != nil {
		return nil, err
	}
	profile.DailyPostsUsed = int(dailyRewards.Posts)
	profile.DailyRepliesUsed = int(dailyRewards.Replies)
	profile.DailyContributionXP = dailyRewards.XP
	if latestErr == nil {
		profile.LastCheckInDay = latest.Day
	}
	var recentCheckIns []model.CommunityCheckIn
	startDay, endDay := today, todayDate.AddDate(0, 0, 6).Format("2006-01-02")
	if err := db.Where("user_id = ? AND day >= ? AND day <= ?", userID, startDay, endDay).Find(&recentCheckIns).Error; err != nil {
		return nil, err
	}
	checkInsByDay := make(map[string]model.CommunityCheckIn, len(recentCheckIns))
	for _, checkIn := range recentCheckIns {
		checkInsByDay[checkIn.Day] = checkIn
	}
	nextStreakDay := 1
	if checkedIn {
		nextStreakDay = todayCheckIn.StreakDays + 1
	} else if streakDays > 0 {
		nextStreakDay = streakDays + 1
	}
	for offset := 0; offset < 7; offset++ {
		day := todayDate.AddDate(0, 0, offset).Format("2006-01-02")
		streakDay := nextStreakDay + offset
		if checkedIn {
			streakDay = todayCheckIn.StreakDays + offset
		}
		preview := CommunityCheckInPreview{Day: day, StreakDay: streakDay, RewardXP: communityCheckInXP(streakDay), IsToday: offset == 0}
		if checkIn, ok := checkInsByDay[day]; ok {
			preview.Completed = true
			preview.StreakDay = checkIn.StreakDays
			preview.RewardXP = checkIn.AwardedXP
		}
		profile.UpcomingCheckIns = append(profile.UpcomingCheckIns, preview)
	}
	var events []model.CommunityExperienceEvent
	if err := db.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Limit(16).Find(&events).Error; err != nil {
		return nil, err
	}
	for _, event := range events {
		label := communityXPLabel(event.SourceType)
		points, revoked := event.Points, event.RevokedAt != nil
		if revoked {
			points = -points
			label += " · 已撤回"
		}
		profile.RecentEvents = append(profile.RecentEvents, CommunityExperienceEntry{
			ID: event.ID, Type: event.SourceType, Label: label, Points: points,
			Revoked: revoked, CreatedAt: event.CreatedAt,
		})
	}
	return profile, nil
}

func communityXPLabel(sourceType string) string {
	switch sourceType {
	case communityXPCheckIn:
		return "每日签到"
	case communityXPPost:
		return "发布帖子"
	case communityXPComment:
		return "发表评论"
	case communityXPAvatar:
		return "首次设置头像"
	case communityXPPostLike:
		return "帖子获得点赞"
	case communityXPCommentLike:
		return "回复获得点赞"
	case communityXPReply:
		return "帖子收到回复"
	case communityXPSolution:
		return "回答被采纳为解决方案"
	default:
		return "社区参与"
	}
}

func recordCommunityXP(tx *gorm.DB, userID uint64, actorID *uint64, sourceType string, sourceID, relatedID uint64, sourceKey string, points int, now time.Time) error {
	event := model.CommunityExperienceEvent{
		UserID: userID, ActorID: actorID, SourceType: sourceType, SourceID: sourceID,
		RelatedID: relatedID, SourceKey: sourceKey, Points: points, CreatedAt: now.UTC(),
	}
	return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "source_key"}}, DoNothing: true}).Create(&event).Error
}

func revokeCommunityXP(tx *gorm.DB, sourceKey string, now time.Time) error {
	return tx.Model(&model.CommunityExperienceEvent{}).
		Where("source_key = ? AND revoked_at IS NULL", sourceKey).
		Update("revoked_at", now.UTC()).Error
}

func revokeCommunityQuestionXP(tx *gorm.DB, questionID uint64, now time.Time) error {
	return tx.Model(&model.CommunityExperienceEvent{}).
		Where("related_id = ? AND revoked_at IS NULL", questionID).
		Update("revoked_at", now.UTC()).Error
}

func revokeCommunityCommentXP(tx *gorm.DB, questionID, commentID uint64, now time.Time) error {
	return tx.Model(&model.CommunityExperienceEvent{}).
		Where("related_id = ? AND source_id = ? AND source_type IN ? AND revoked_at IS NULL", questionID, commentID,
			[]string{communityXPComment, communityXPCommentLike, communityXPReply, communityXPSolution}).
		Update("revoked_at", now.UTC()).Error
}

func communityAuthorLevels(ctx context.Context, db *gorm.DB, userIDs []uint64) (map[uint64]int, error) {
	levels := make(map[uint64]int, len(userIDs))
	if len(userIDs) == 0 {
		return levels, nil
	}
	totals := make([]struct {
		UserID uint64 `gorm:"column:user_id"`
		XP     int64  `gorm:"column:total_xp"`
	}, 0, len(userIDs))
	if err := db.WithContext(ctx).Model(&model.CommunityExperienceEvent{}).
		Select("user_id, COALESCE(SUM(points), 0) AS total_xp").
		Where("user_id IN ? AND revoked_at IS NULL", userIDs).
		Group("user_id").Scan(&totals).Error; err != nil {
		return nil, err
	}
	for _, total := range totals {
		levels[total.UserID] = CommunityLevelForXP(total.XP)
	}
	for _, userID := range userIDs {
		if _, ok := levels[userID]; !ok {
			levels[userID] = 1
		}
	}
	return levels, nil
}
