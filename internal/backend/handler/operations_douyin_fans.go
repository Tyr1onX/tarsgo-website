package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

// parseDouyinFansExport reads the daily series exported by Creator Center > Data Center > Fan Analysis.
func parseDouyinFansExport(file io.ReaderAt, size int64, now time.Time) ([]model.OperationsAccountSnapshot, error) {
	rows, columns, err := readDouyinWorkbook(file, size)
	if err != nil {
		return nil, err
	}
	names := []string{"日期", "总粉丝量", "粉丝净增", "吸粉量", "脱粉量", "回访粉丝量"}
	for _, name := range names {
		if columns[name] == "" {
			return nil, errors.New("请选择抖音数据中心导出的粉丝全量指标 Excel")
		}
	}
	seen := make(map[string]bool, len(rows))
	snapshots := make([]model.OperationsAccountSnapshot, 0, len(rows))
	today := now.In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02")
	for _, row := range rows {
		date := strings.TrimSpace(row[columns["日期"]])
		parsed, err := time.Parse("2006-01-02", date)
		if err != nil || parsed.Format("2006-01-02") != date || date > today || seen[date] {
			return nil, errors.New("粉丝数据日期无效或重复")
		}
		seen[date] = true
		values := make(map[string]int64, len(names)-1)
		for _, name := range names[1:] {
			number, err := strconv.ParseInt(strings.TrimSpace(row[columns[name]]), 10, 64)
			if err != nil || (name != "粉丝净增" && number < 0) {
				return nil, fmt.Errorf("%s格式不正确", name)
			}
			values[name] = number
		}
		if values["粉丝净增"] != values["吸粉量"]-values["脱粉量"] {
			return nil, fmt.Errorf("%s 的粉丝净增与吸粉、脱粉量不一致", date)
		}
		added, unfollows, returning := values["吸粉量"], values["脱粉量"], values["回访粉丝量"]
		snapshots = append(snapshots, model.OperationsAccountSnapshot{
			Platform: "douyin", ObservedOn: date, Followers: values["总粉丝量"],
			NewFollowers: &added, Unfollows: &unfollows, ReturningFans: &returning,
			Source: "creator_export",
		})
	}
	return snapshots, nil
}

func (h *OperationsProgressHandler) ImportDouyinFans(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, douyinImportLimit)
	upload, err := c.FormFile("file")
	if err != nil || upload.Size > douyinImportLimit {
		writeAPIError(c, http.StatusBadRequest, "请选择不超过 2MB 的抖音粉丝数据 Excel")
		return
	}
	file, err := upload.Open()
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "粉丝数据读取失败")
		return
	}
	defer file.Close()
	snapshots, err := parseDouyinFansExport(file, upload.Size, time.Now())
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, fmt.Sprintf("导入失败：%v", err))
		return
	}
	if err := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "platform"}, {Name: "observed_on"}},
		DoUpdates: clause.AssignmentColumns([]string{"followers", "new_followers", "unfollows", "returning_fans", "source"}),
	}).CreateInBatches(snapshots, 100).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "粉丝数据保存失败")
		return
	}
	writeAPI(c, http.StatusOK, "粉丝数据已更新", gin.H{"count": len(snapshots)})
}
