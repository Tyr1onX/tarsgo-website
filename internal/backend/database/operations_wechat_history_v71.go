package database

import (
	_ "embed"
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

//go:embed operations_wechat_publications_20261118.csv
var weChatPublicationsV71 string

//go:embed operations_wechat_followers_20261118.csv
var weChatFollowersV71 string

// Imported from the account's publisher history and user-analysis export on
// 2026-11-18. Older articles have only a known publication day, not a clock
// time. Expiring temporary share links are deliberately not persisted.
func parseWeChatHistoryV71() ([]model.OperationsPlatformPost, []model.OperationsAccountSnapshot, error) {
	location := time.FixedZone("Beijing", 8*3600)
	observedAt, _ := time.ParseInLocation("2006-01-02", "2026-11-18", location)
	postRows, err := csv.NewReader(strings.NewReader(weChatPublicationsV71)).ReadAll()
	if err != nil {
		return nil, nil, fmt.Errorf("read WeChat publications: %w", err)
	}
	followerRows, err := csv.NewReader(strings.NewReader(weChatFollowersV71)).ReadAll()
	if err != nil {
		return nil, nil, fmt.Errorf("read WeChat follower history: %w", err)
	}
	if len(postRows) < 2 || len(followerRows) < 2 {
		return nil, nil, fmt.Errorf("empty WeChat history")
	}

	posts := make([]model.OperationsPlatformPost, 0, len(postRows)-1)
	for i, row := range postRows[1:] {
		if len(row) != 8 || row[1] == "" || row[2] == "" {
			return nil, nil, fmt.Errorf("invalid WeChat publication row %d", i+2)
		}
		publishedAt, err := time.ParseInLocation("2006-01-02", row[0], location)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid WeChat publication date at row %d: %w", i+2, err)
		}
		counts := [4]int64{}
		for j := range counts {
			counts[j], err = strconv.ParseInt(row[j+4], 10, 64)
			if err != nil || counts[j] < 0 {
				return nil, nil, fmt.Errorf("invalid WeChat publication metric at row %d", i+2)
			}
		}
		posts = append(posts, model.OperationsPlatformPost{
			Platform: "wechat", ExternalID: row[1], Title: row[2], URL: row[3],
			PublishedAt: publishedAt.UTC(), ViewCount: counts[0], LikeCount: counts[1],
			ShareCount: counts[2], RecommendCount: counts[3], SyncedAt: observedAt.UTC(),
		})
	}

	snapshots := make([]model.OperationsAccountSnapshot, 0, len(followerRows)-1)
	for i, row := range followerRows[1:] {
		if len(row) != 5 {
			return nil, nil, fmt.Errorf("invalid WeChat follower row %d", i+2)
		}
		if _, err := time.Parse("2006-01-02", row[0]); err != nil {
			return nil, nil, fmt.Errorf("invalid WeChat follower date at row %d: %w", i+2, err)
		}
		values := [4]int64{}
		for j := range values {
			values[j], err = strconv.ParseInt(row[j+1], 10, 64)
			if err != nil || (j != 2 && values[j] < 0) {
				return nil, nil, fmt.Errorf("invalid WeChat follower metric at row %d", i+2)
			}
		}
		if values[0]-values[1] != values[2] {
			return nil, nil, fmt.Errorf("inconsistent WeChat follower changes at row %d", i+2)
		}
		added, unfollowed := values[0], values[1]
		snapshots = append(snapshots, model.OperationsAccountSnapshot{
			Platform: "wechat", ObservedOn: row[0], Followers: values[3],
			NewFollowers: &added, Unfollows: &unfollowed, Source: "admin_export",
		})
	}
	return posts, snapshots, nil
}

func migrateWeChatHistoryV71(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.OperationsPlatformPost{}, &model.OperationsAccountSnapshot{}); err != nil {
		return err
	}
	posts, snapshots, err := parseWeChatHistoryV71()
	if err != nil {
		return err
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(snapshots, 50).Error; err != nil {
		return err
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(posts, 50).Error; err != nil {
		return err
	}
	// Refresh only the ten unchanged entries imported by v68. Manually edited
	// or subsequently synchronized records keep their existing values.
	oldObservation := time.Date(2026, 11, 18, 15, 24, 0, 0, time.FixedZone("Beijing", 8*3600)).UTC()
	for _, post := range posts[:10] {
		if err := db.Model(&model.OperationsPlatformPost{}).
			Where("platform = ? AND external_id = ? AND synced_at = ?", "wechat", post.ExternalID, oldObservation).
			Updates(map[string]any{
				"view_count": post.ViewCount, "like_count": post.LikeCount,
				"share_count": post.ShareCount, "recommend_count": post.RecommendCount,
				"synced_at": post.SyncedAt,
			}).Error; err != nil {
			return err
		}
	}
	return nil
}
