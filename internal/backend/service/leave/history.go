package leave

import (
	"context"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"tarsgo-backend/model"
)

const dailyHistoryPageSize = 30

type DailyHistoryPage struct {
	Items      []DailyEntryView `json:"items"`
	NextCursor string           `json:"nextCursor,omitempty"`
}

// Encode database wall time, not a UTC conversion: DATETIME has no timezone.
func dailyHistoryCursor(row model.DailyLeaveEntry) string {
	return base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("%s/%d", row.SubmittedAt.Format("2006-01-02 15:04:05"), row.ID)))
}

func parseDailyHistoryCursor(cursor string) (string, uint64, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return "", 0, badRequest("请假历史分页参数无效")
	}
	parts := strings.Split(string(raw), "/")
	if len(parts) != 2 {
		return "", 0, badRequest("请假历史分页参数无效")
	}
	date, err := time.Parse("2006-01-02 15:04:05", parts[0])
	if err != nil || date.Format("2006-01-02 15:04:05") != parts[0] {
		return "", 0, badRequest("请假历史分页参数无效")
	}
	id, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil || id == 0 {
		return "", 0, badRequest("请假历史分页参数无效")
	}
	return parts[0], id, nil
}

func (s *Service) ListDailyRecordsPage(ctx context.Context, userID, adminID *uint64, cursor string, selfServiceOnly bool) (*DailyHistoryPage, error) {
	query := s.db.WithContext(ctx)
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	}
	if selfServiceOnly {
		query = query.Where("start_at IS NOT NULL AND end_at IS NOT NULL")
	}
	if cursor != "" {
		at, id, err := parseDailyHistoryCursor(cursor)
		if err != nil {
			return nil, err
		}
		query = query.Where("submitted_at < ? OR (submitted_at = ? AND id < ?)", at, at, id)
	}
	var rows []model.DailyLeaveEntry
	if err := query.Order("submitted_at DESC,id DESC").Limit(dailyHistoryPageSize + 1).Find(&rows).Error; err != nil {
		return nil, internalError("读取日常请假历史失败", err)
	}
	result := &DailyHistoryPage{}
	if len(rows) > dailyHistoryPageSize {
		rows = rows[:dailyHistoryPageSize]
		result.NextCursor = dailyHistoryCursor(rows[len(rows)-1])
	}
	var err error
	result.Items, err = s.dailyRecordViews(ctx, rows, adminID)
	return result, err
}
