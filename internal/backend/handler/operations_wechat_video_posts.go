package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// This is the per-post export from 视频数据 → 单篇视频, not the daily
// aggregate "视频号视频详情数据.csv" from 视频数据 → 全部视频.
func parseWeChatVideoPostExport(data []byte, now time.Time) ([]model.OperationsPlatformPost, error) {
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	rows, err := csv.NewReader(bytes.NewReader(data)).ReadAll()
	if err != nil || len(rows) < 2 || len(rows) > 2001 {
		return nil, errors.New("视频号作品表格无有效记录或超过 2000 条")
	}
	columns := make(map[string]int, len(rows[0]))
	for index, name := range rows[0] {
		name = strings.TrimSpace(name)
		if _, exists := columns[name]; exists {
			return nil, errors.New("视频号作品表格存在重复列名")
		}
		columns[name] = index
	}
	for _, field := range []string{"视频描述", "视频ID", "发布时间", "播放量", "推荐", "喜欢", "评论量", "分享量", "关注量"} {
		if _, ok := columns[field]; !ok {
			return nil, errors.New("请选择视频号「视频数据 → 单篇视频」下载的动态数据明细 CSV")
		}
	}

	beijing := time.FixedZone("Beijing", 8*3600)
	today := now.In(beijing).Format("2006/01/02")
	seen := make(map[string]bool, len(rows)-1)
	posts := make([]model.OperationsPlatformPost, 0, len(rows)-1)
	for _, row := range rows[1:] {
		if len(row) != len(rows[0]) {
			return nil, errors.New("视频号作品表格列数不正确")
		}
		value := func(name string) string { return strings.TrimSpace(row[columns[name]]) }
		rawID := value("视频ID")
		if rawID == "" || len(rawID) > 4096 || strings.ContainsAny(rawID, " \t\r\n") || seen[rawID] {
			return nil, errors.New("视频号视频ID无效或重复")
		}
		seen[rawID] = true
		// Some official IDs exceed the existing 80-byte external_id column.
		// A deterministic hash keeps imports idempotent without a schema change.
		externalID := fmt.Sprintf("wxv:%x", sha256.Sum256([]byte(rawID)))

		date := value("发布时间")
		published, err := time.ParseInLocation("2006/01/02", date, beijing)
		if err != nil || date > today {
			return nil, fmt.Errorf("视频号发布时间无效：%s", date)
		}
		title := strings.Join(strings.Fields(value("视频描述")), " ")
		if title == "" {
			title = "未显示标题（" + published.Format("2006-01-02") + "）"
		}
		if runes := []rune(title); len(runes) > 250 {
			title = string(runes[:250])
		}
		post := model.OperationsPlatformPost{
			Platform: "wechat_video", ExternalID: externalID, Title: title, MediaType: "video",
			PublishedAt: published.UTC(), SyncedAt: now.UTC(),
		}
		for _, field := range []struct {
			name   string
			target *int64
		}{
			{"播放量", &post.ViewCount},
			{"推荐", &post.RecommendCount},
			{"喜欢", &post.LikeCount},
			{"评论量", &post.CommentCount},
			{"分享量", &post.ShareCount},
		} {
			number, err := strconv.ParseInt(strings.ReplaceAll(value(field.name), ",", ""), 10, 64)
			if err != nil || number < 0 {
				return nil, fmt.Errorf("%s 的%s不正确", date, field.name)
			}
			*field.target = number
		}
		if raw := value("关注量"); raw != "" && raw != "-" {
			gain, err := strconv.ParseInt(strings.ReplaceAll(raw, ",", ""), 10, 64)
			if err != nil || gain < 0 {
				return nil, fmt.Errorf("%s 的关注量不正确", date)
			}
			post.FollowerGain = &gain
		}
		posts = append(posts, post)
	}
	return posts, nil
}

// The one-time dashboard seed used publication-minute IDs. On the first CSV
// upload, replace a uniquely matched seed key with the exported stable video ID.
// Keep its original publication time, link, and hidden status.
func upsertWeChatVideoPosts(db *gorm.DB, posts []model.OperationsPlatformPost) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, post := range posts {
			var existing model.OperationsPlatformPost
			if err := tx.Where("platform = ? AND external_id = ?", post.Platform, post.ExternalID).
				Limit(1).Find(&existing).Error; err != nil {
				return err
			}
			if existing.ID == 0 {
				var seeded []model.OperationsPlatformPost
				if err := tx.Where("platform = ? AND external_id LIKE ? AND title = ? AND published_at >= ? AND published_at < ?",
					"wechat_video", "dashboard:%", post.Title, post.PublishedAt, post.PublishedAt.Add(24*time.Hour)).
					Limit(2).Find(&seeded).Error; err != nil {
					return err
				}
				if len(seeded) > 1 {
					return fmt.Errorf("同日同名的旧视频记录无法唯一匹配：%s", post.Title)
				}
				if len(seeded) == 1 {
					existing = seeded[0]
				}
			}
			if existing.ID == 0 {
				if err := tx.Create(&post).Error; err != nil {
					return err
				}
				continue
			}
			changes := map[string]any{
				"external_id": post.ExternalID, "title": post.Title, "media_type": post.MediaType,
				"view_count": post.ViewCount, "recommend_count": post.RecommendCount,
				"like_count": post.LikeCount, "comment_count": post.CommentCount,
				"share_count": post.ShareCount, "follower_gain": post.FollowerGain,
				"synced_at": post.SyncedAt,
			}
			if err := tx.Model(&existing).Updates(changes).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (h *OperationsProgressHandler) ImportWeChatVideoPosts(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	data := readOperationsImportFile(c, "视频号动态数据明细")
	if data == nil {
		return
	}
	posts, err := parseWeChatVideoPostExport(data, time.Now())
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := upsertWeChatVideoPosts(h.db.WithContext(c.Request.Context()), posts); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "视频号作品数据保存失败")
		return
	}
	writeAPI(c, http.StatusOK, "视频号作品数据已更新", gin.H{"count": len(posts)})
}
