package weeklyreport

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"tarsgo-backend/model"
	"time"
)

const historyPageSize = 20

type HistoryQuery struct{ Cursor, WeekStart string }
type historyRepository interface {
	ListMinePage(context.Context, uint64, string, uint64, int) ([]model.WeeklyReport, error)
}

func (s *Service) GetDashboardPage(ctx context.Context, userID uint64, role string, q HistoryQuery) (*Dashboard, error) {
	return s.dashboard(ctx, userID, role, &q)
}

func parseHistoryCursor(cursor string) (string, uint64, error) {
	if cursor == "" {
		return "", 0, nil
	}
	parts := strings.Split(cursor, "/")
	if len(parts) != 2 {
		return "", 0, fmt.Errorf("invalid cursor")
	}
	date, err := time.Parse(time.DateOnly, parts[0])
	if err != nil || date.Format(time.DateOnly) != parts[0] {
		return "", 0, fmt.Errorf("invalid cursor date")
	}
	id, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil || id == 0 {
		return "", 0, fmt.Errorf("invalid cursor id")
	}
	return parts[0], id, nil
}

func (s *Service) historyPage(ctx context.Context, userID uint64, q HistoryQuery) ([]model.WeeklyReport, string, error) {
	week, id, err := parseHistoryCursor(q.Cursor)
	if err != nil {
		return nil, "", serviceError(http.StatusBadRequest, "周报分页参数无效", nil)
	}
	if q.WeekStart != "" {
		date, err := time.Parse(time.DateOnly, q.WeekStart)
		if err != nil || date.Format(time.DateOnly) != q.WeekStart {
			return nil, "", serviceError(http.StatusBadRequest, "周报日期无效", nil)
		}
	}
	repo, ok := s.repo.(historyRepository)
	if !ok {
		return nil, "", fmt.Errorf("weekly history repository unavailable")
	}
	rows, err := repo.ListMinePage(ctx, userID, week, id, historyPageSize+1)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > historyPageSize {
		rows = rows[:historyPageSize]
		last := rows[len(rows)-1]
		next = fmt.Sprintf("%s/%d", last.WeekStart, last.ID)
	}
	// Preserve deep links without loading every intervening page. Subsequent
	// pages deduplicate by ID in the client; the cursor is based on the page only.
	if q.Cursor == "" && q.WeekStart != "" {
		found := false
		for _, row := range rows {
			if string(row.WeekStart) == q.WeekStart {
				found = true
				break
			}
		}
		if !found {
			row, err := s.repo.FindByWeek(ctx, userID, q.WeekStart)
			if err != nil {
				return nil, "", err
			}
			if row != nil {
				rows = append(rows, *row)
			}
		}
	}
	return rows, next, nil
}

func (r *GormRepository) ListMinePage(ctx context.Context, userID uint64, week string, id uint64, limit int) ([]model.WeeklyReport, error) {
	query := r.db.WithContext(ctx).Where("user_id = ?", userID)
	if week != "" {
		query = query.Where("week_start < ? OR (week_start = ? AND id < ?)", week, week, id)
	}
	var rows []model.WeeklyReport
	err := query.Preload("Group").Order("week_start DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
