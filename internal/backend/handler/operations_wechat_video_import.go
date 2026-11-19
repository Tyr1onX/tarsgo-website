package handler

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"tarsgo-backend/model"
)

// parseWeChatVideoFollowerExport reads the CSV exported from
// 视频号助手 → 数据中心 → 关注者数据 → 关注者增长 → 增长详情.
func parseWeChatVideoFollowerExport(data []byte, now time.Time) ([]model.OperationsAccountSnapshot, error) {
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	reader := csv.NewReader(bytes.NewReader(data))
	reader.FieldsPerRecord = -1 // The export has two introductory rows before its table.
	rows, err := reader.ReadAll()
	if err != nil || len(rows) < 4 || strings.TrimSpace(rows[0][0]) != "视频号关注者增长详情数据" {
		return nil, errors.New("请选择视频号「关注者增长 → 增长详情」下载的 CSV 表格")
	}

	header := -1
	for i, row := range rows {
		if len(row) == 5 &&
			strings.TrimSpace(row[0]) == "时间" &&
			strings.TrimSpace(row[1]) == "净增关注" &&
			strings.TrimSpace(row[2]) == "新增关注" &&
			strings.TrimSpace(row[3]) == "取消关注" &&
			strings.TrimSpace(row[4]) == "关注者总数" {
			header = i
			break
		}
	}
	if header < 0 {
		return nil, errors.New("视频号关注数据表格列名不正确")
	}

	today := now.In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02")
	snapshots := make([]model.OperationsAccountSnapshot, 0, len(rows)-header-1)
	previous := "" // WeChat Channels exports newest dates first.
	for _, row := range rows[header+1:] {
		if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
			continue
		}
		if len(row) != 5 {
			return nil, errors.New("视频号关注数据表格列数不正确")
		}
		day, err := time.Parse("2006/01/02", strings.TrimSpace(row[0]))
		date := day.Format("2006-01-02")
		if err != nil || date >= today || (previous != "" && date >= previous) {
			return nil, fmt.Errorf("视频号统计日期无效或重复：%s", row[0])
		}
		previous = date
		missing := true
		for _, cell := range row[1:] {
			if strings.TrimSpace(cell) != "-" {
				missing = false
			}
		}
		if missing {
			continue
		}
		var values [4]int64
		for i := range values {
			values[i], err = strconv.ParseInt(strings.ReplaceAll(strings.TrimSpace(row[i+1]), ",", ""), 10, 64)
			if err != nil || (i != 0 && values[i] < 0) {
				return nil, fmt.Errorf("%s 的视频号关注数据无效", row[0])
			}
		}
		if values[1]-values[2] != values[0] {
			return nil, fmt.Errorf("%s 的视频号关注增减数据不一致", row[0])
		}
		newFollowers, unfollows := values[1], values[2]
		snapshots = append(snapshots, model.OperationsAccountSnapshot{
			Platform: "wechat_video", ObservedOn: date, Followers: values[3],
			NewFollowers: &newFollowers, Unfollows: &unfollows, Source: "admin_export",
		})
		if len(snapshots) > 2000 {
			return nil, errors.New("视频号关注数据超出 2000 天限制")
		}
	}
	if len(snapshots) == 0 {
		return nil, errors.New("视频号关注数据表格没有有效记录")
	}
	for i, j := 0, len(snapshots)-1; i < j; i, j = i+1, j-1 {
		snapshots[i], snapshots[j] = snapshots[j], snapshots[i]
	}
	return snapshots, nil
}
