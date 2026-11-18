package database

import (
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

// v68 records WeChat account figures and public articles verified in the
// publisher dashboard on 2026-11-18. This is a dated observation, not a live sync.
func migrateWeChatOperationsV68(db *gorm.DB) error {
	observedAt := time.Date(2026, 11, 18, 15, 24, 0, 0, time.FixedZone("Beijing", 8*3600)).UTC()
	snapshot := model.OperationsAccountSnapshot{
		Platform: "wechat", ObservedOn: "2026-11-18", Followers: 3427, Source: "admin_page",
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&snapshot).Error; err != nil {
		return err
	}

	// Publisher statistics are reader counts at inspection time. Older entries
	// have day precision only, so the UI intentionally displays dates, not times.
	entries := []struct {
		day, title, url string
		readers         int64
	}{
		{"2026-11-17", "吉甲大师 2026 秋季纳新回顾", "https://mp.weixin.qq.com/s/jamVxvx2V6RLw72oHCUmBQ", 293},
		{"2026-11-09", "逐梦低空新起点 实践笃行启新程", "https://mp.weixin.qq.com/s/cLWfGvw-jw4zPL_ILRY14Q", 227},
		{"2026-09-09", "吉甲大师2027赛季纳新", "https://mp.weixin.qq.com/s/ehEbaB-8GAx_CAcZUrQTfQ", 853},
		{"2026-07-15", "科创美育启润童心，吉甲相伴少年逐梦 | 吉林大学通信工程学院“三下乡”研学活动圆满落幕", "https://mp.weixin.qq.com/s/OcRae8CiynDyYd4tvgtfNw", 275},
		{"2026-07-14", "2026年吉甲大师夏令营培训", "https://mp.weixin.qq.com/s/qEEgH9KBqOdlBXuGPVgr7Q", 608},
		{"2026-07-09", "科技启智，筑梦未来|吉大附中九年十班走进吉甲大师双创基地开展研学活动", "https://mp.weixin.qq.com/s/56JEHx-UlfH5NkqEscuegg", 288},
		{"2026-06-26", "吉甲大师夏令营开营仪式预告！", "https://mp.weixin.qq.com/s/ybsDz4PusBq0u6n8UFu25Q", 352},
		{"2026-05-30", "赛程预告|TARS_Go战队将于5月31日上午10：15迎来小组赛第三个对手--香港科技大学", "https://mp.weixin.qq.com/s/mCWN3oYKnwQTZD68s9aoHg", 271},
		{"2026-05-29", "赛程速递|TARS_Go战队将于5月30日下午13：00迎来小组赛第二个对手--北京理工大学", "https://mp.weixin.qq.com/s/aOE0Xojr36-DHQ4z8vmEEQ", 226},
		{"2026-05-28", "赛程速递|吉林大学TARS_GO战队将于5.29下午17：50迎来区域赛第一个对手--复旦大学星云EGA战队", "https://mp.weixin.qq.com/s/-QZGSKXI6wcqlddDBcGItQ", 325},
	}
	posts := make([]model.OperationsPlatformPost, 0, len(entries))
	for _, entry := range entries {
		publishedAt, err := time.ParseInLocation("2006-01-02", entry.day, time.FixedZone("Beijing", 8*3600))
		if err != nil {
			return err
		}
		posts = append(posts, model.OperationsPlatformPost{
			Platform: "wechat", ExternalID: strings.TrimPrefix(entry.url, "https://mp.weixin.qq.com/s/"),
			Title: entry.title, URL: entry.url, PublishedAt: publishedAt.UTC(),
			ViewCount: entry.readers, SyncedAt: observedAt,
		})
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&posts).Error; err != nil {
		return err
	}
	// Seeded channel cards previously had no platform tag, so platform filtering
	// hid them. Only fill empty tags; preserve user-managed platform selections.
	for _, platform := range []string{"douyin", "bilibili", "wechat"} {
		if err := db.Model(&model.OperationsProgressItem{}).
			Where("seed_key = ? AND platforms = ?", "channel:"+platform, "").
			Update("platforms", platform).Error; err != nil {
			return err
		}
	}
	return nil
}
