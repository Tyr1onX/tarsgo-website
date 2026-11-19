package database

import (
	_ "embed"
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

//go:embed operations_wechat_video_posts_20261119.csv
var weChatVideoPostsV85 string

// V85 imports the video account's 2026-11-19 publisher-dashboard observation.
// The dashboard does not expose stable post IDs or share URLs in its list view,
// so the unique publication minute is used as a local seed key, not a public ID.
func migrateWeChatVideoMetricsV85(db *gorm.DB) error {
	snapshot := model.OperationsAccountSnapshot{
		Platform: "wechat_video", ObservedOn: "2026-11-19",
		Followers: 441, Source: "admin_page",
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&snapshot).Error; err != nil {
		return err
	}
	posts, err := parseWeChatVideoPostsV85(weChatVideoPostsV85, time.Now().UTC())
	if err != nil {
		return err
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(posts, 50).Error
}

func parseWeChatVideoPostsV85(source string, syncedAt time.Time) ([]model.OperationsPlatformPost, error) {
	rows, err := csv.NewReader(strings.NewReader(source)).ReadAll()
	if err != nil || len(rows) < 2 {
		return nil, errors.New("视频号发布记录无法读取")
	}
	if strings.Join(rows[0], ",") != "published_at,title,view_count,like_count,comment_count,share_count,recommend_count" {
		return nil, errors.New("视频号发布记录表头无效")
	}
	beijing := time.FixedZone("Beijing", 8*3600)
	seen := make(map[string]bool, len(rows)-1)
	posts := make([]model.OperationsPlatformPost, 0, len(rows)-1)
	for _, row := range rows[1:] {
		if len(row) != 7 {
			return nil, errors.New("视频号发布记录列数不正确")
		}
		publishedAt, err := time.ParseInLocation("2006年01月02日 15:04", row[0], beijing)
		if err != nil || publishedAt.After(syncedAt) {
			return nil, fmt.Errorf("视频号发布日期无效：%s", row[0])
		}
		externalID := "dashboard:" + publishedAt.Format("200601021504")
		if seen[externalID] {
			return nil, fmt.Errorf("视频号发布时间重复：%s", row[0])
		}
		seen[externalID] = true
		title := strings.Join(strings.Fields(row[1]), " ")
		if title == "" {
			title = "未显示标题（" + publishedAt.Format("2006-01-02 15:04") + "）"
		}
		if runes := []rune(title); len(runes) > 250 {
			title = string(runes[:250])
		}
		var counts [5]int64
		for i := range counts {
			counts[i], err = strconv.ParseInt(row[i+2], 10, 64)
			if err != nil || counts[i] < 0 {
				return nil, fmt.Errorf("视频号作品数据无效：%s", row[0])
			}
		}
		posts = append(posts, model.OperationsPlatformPost{
			Platform: "wechat_video", ExternalID: externalID, Title: title, MediaType: "video",
			PublishedAt: publishedAt.UTC(), ViewCount: counts[0], LikeCount: counts[1],
			CommentCount: counts[2], ShareCount: counts[3], RecommendCount: counts[4],
			SyncedAt: syncedAt,
		})
	}
	return posts, nil
}
