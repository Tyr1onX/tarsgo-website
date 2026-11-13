package operationssync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const (
	bilibiliMID = 488284486
	pageSize    = 30
)

var beijing = time.FixedZone("Beijing", 8*60*60)

type Collector struct {
	db     *gorm.DB
	client *http.Client
	apiURL string
	now    func() time.Time
}

func New(db *gorm.DB) *Collector {
	return &Collector{db: db, client: &http.Client{Timeout: 15 * time.Second},
		apiURL: "https://api.bilibili.com", now: time.Now}
}

// Start checks public posts on startup and every six hours; followers are
// captured only once per Beijing calendar day.
func Start(ctx context.Context, db *gorm.DB) {
	collector := New(db)
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for {
			if err := collector.Sync(ctx); err != nil && ctx.Err() == nil {
				log.Printf("operations public sync: %v", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (c *Collector) request(ctx context.Context, path string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; JijiMaster-Operations/1.0)")
	req.Header.Set("Referer", "https://space.bilibili.com/488284486")
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Bilibili HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(output); err != nil {
		return fmt.Errorf("decode Bilibili response: %w", err)
	}
	return nil
}

func (c *Collector) fetchFollowers(ctx context.Context) (int64, error) {
	var reply struct {
		Code int `json:"code"`
		Data struct {
			MID      int64 `json:"mid"`
			Follower int64 `json:"follower"`
		} `json:"data"`
	}
	if err := c.request(ctx, fmt.Sprintf("/x/relation/stat?vmid=%d", bilibiliMID), &reply); err != nil {
		return 0, err
	}
	if reply.Code != 0 || reply.Data.MID != bilibiliMID || reply.Data.Follower < 0 {
		return 0, fmt.Errorf("unexpected Bilibili follower response code %d", reply.Code)
	}
	return reply.Data.Follower, nil
}

func (c *Collector) fetchPosts(ctx context.Context) ([]model.OperationsPlatformPost, error) {
	posts := make([]model.OperationsPlatformPost, 0)
	for page := 1; page <= 20; page++ {
		var reply struct {
			Code int `json:"code"`
			Data struct {
				Page struct {
					Total int `json:"total"`
				} `json:"page"`
				Archives []struct {
					BVID    string `json:"bvid"`
					Title   string `json:"title"`
					UpMID   int64  `json:"upMid"`
					Pubdate int64  `json:"pubdate"`
					Stat    struct {
						View int64 `json:"view"`
					} `json:"stat"`
				} `json:"archives"`
			} `json:"data"`
		}
		path := fmt.Sprintf("/x/series/recArchivesByKeywords?mid=%d&keywords=&ps=%d&pn=%d", bilibiliMID, pageSize, page)
		if err := c.request(ctx, path, &reply); err != nil {
			return posts, err
		}
		if reply.Code != 0 {
			return posts, fmt.Errorf("Bilibili archive code %d", reply.Code)
		}
		if reply.Data.Page.Total < 0 {
			return posts, errors.New("invalid Bilibili archive total")
		}
		for _, entry := range reply.Data.Archives {
			if entry.UpMID != bilibiliMID || !validBVID(entry.BVID) ||
				entry.Pubdate <= 0 || entry.Pubdate > c.now().Unix()+3600 {
				continue
			}
			title := strings.TrimSpace(entry.Title)
			if title == "" {
				continue
			}
			if runes := []rune(title); len(runes) > 250 {
				title = string(runes[:250])
			}
			posts = append(posts, model.OperationsPlatformPost{
				Platform: "bilibili", ExternalID: entry.BVID, Title: title,
				URL:         "https://www.bilibili.com/video/" + entry.BVID,
				PublishedAt: time.Unix(entry.Pubdate, 0).UTC(),
				ViewCount:   max(0, entry.Stat.View), SyncedAt: c.now().UTC(),
			})
		}
		if len(reply.Data.Archives) == 0 || page*pageSize >= reply.Data.Page.Total {
			return posts, nil
		}
	}
	return posts, errors.New("Bilibili archive list exceeds safe page limit")
}

func validBVID(value string) bool {
	if len(value) != 12 || !strings.HasPrefix(value, "BV") {
		return false
	}
	for _, char := range value[2:] {
		if !(char >= '0' && char <= '9' || char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z') {
			return false
		}
	}
	return true
}

func (c *Collector) Sync(ctx context.Context) error {
	today := c.now().In(beijing).Format("2006-01-02")
	var count int64
	if err := c.db.WithContext(ctx).Model(&model.OperationsAccountSnapshot{}).
		Where("platform = ? AND observed_on = ?", "bilibili", today).Count(&count).Error; err != nil {
		return err
	}
	var failures []error
	if count == 0 {
		followers, err := c.fetchFollowers(ctx)
		if err != nil {
			failures = append(failures, fmt.Errorf("followers: %w", err))
		} else {
			snapshot := model.OperationsAccountSnapshot{
				Platform: "bilibili", ObservedOn: today, Followers: followers, Source: "public_page",
			}
			if err := c.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&snapshot).Error; err != nil {
				failures = append(failures, fmt.Errorf("save followers: %w", err))
			}
		}
	}
	posts, err := c.fetchPosts(ctx)
	if err != nil {
		failures = append(failures, fmt.Errorf("posts: %w", err))
	}
	if len(posts) > 0 {
		err = c.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "platform"}, {Name: "external_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"title", "view_count", "synced_at"}),
		}).CreateInBatches(posts, 30).Error
		if err != nil {
			failures = append(failures, fmt.Errorf("save posts: %w", err))
		}
	}
	return errors.Join(failures...)
}
