package handler

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/html"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const weChatImportLimit = 2 << 20

// WeChat's user-growth ".xls" export is an HTML table, not a binary Excel workbook.
func parseWeChatFollowerExport(data []byte, now time.Time) ([]model.OperationsAccountSnapshot, error) {
	document, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("关注数据表读取失败")
	}
	var rows [][]string
	var collectText func(*html.Node) string
	collectText = func(node *html.Node) string {
		if node.Type == html.TextNode {
			return node.Data
		}
		var result strings.Builder
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			result.WriteString(collectText(child))
		}
		return result.String()
	}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "tr" {
			var row []string
			for cell := node.FirstChild; cell != nil; cell = cell.NextSibling {
				if cell.Type == html.ElementNode && (cell.Data == "td" || cell.Data == "th") {
					row = append(row, strings.TrimSpace(collectText(cell)))
				}
			}
			if len(row) > 0 {
				rows = append(rows, row)
			}
			return
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(document)

	header := -1
	for i, row := range rows {
		if len(row) >= 5 && row[0] == "时间" && row[1] == "新关注人数" &&
			row[2] == "取消关注人数" && row[3] == "净增关注人数" &&
			(row[4] == "累积关注人数" || row[4] == "累计关注人数") {
			header = i
			break
		}
	}
	if header == -1 {
		return nil, errors.New("请选择公众号「用户分析 → 用户增长」导出的表格")
	}

	latestCompleteDay := now.In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02")
	snapshots := make([]model.OperationsAccountSnapshot, 0, len(rows)-header-1)
	var previous *model.OperationsAccountSnapshot
	for _, row := range rows[header+1:] {
		if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
			continue
		}
		if len(row) != 5 {
			return nil, errors.New("关注数据表列数不正确")
		}
		day, err := time.Parse("2006-01-02", row[0])
		if err != nil || row[0] >= latestCompleteDay {
			return nil, fmt.Errorf("无效的统计日期：%s", row[0])
		}
		if row[4] == "-" {
			if row[1] != "-" || row[2] != "-" || row[3] != "-" {
				return nil, fmt.Errorf("%s 的关注数据不完整", row[0])
			}
			continue // WeChat uses '-' for days with no available data, not zero.
		}
		numbers := [4]int64{}
		for i := range numbers {
			numbers[i], err = strconv.ParseInt(strings.ReplaceAll(strings.TrimSpace(row[i+1]), ",", ""), 10, 64)
			if err != nil || (i != 2 && numbers[i] < 0) {
				return nil, fmt.Errorf("%s 的关注数据格式不正确", row[0])
			}
		}
		if numbers[0]-numbers[1] != numbers[2] {
			return nil, fmt.Errorf("%s 的关注增减人数不一致", row[0])
		}
		if previous != nil {
			prevDay, _ := time.Parse("2006-01-02", previous.ObservedOn)
			if !day.After(prevDay) {
				return nil, errors.New("统计日期重复或顺序错误")
			}
			if day.Equal(prevDay.AddDate(0, 0, 1)) && numbers[3]-previous.Followers != numbers[2] {
				return nil, fmt.Errorf("%s 的累计关注人数不一致", row[0])
			}
		}
		newFollowers, unfollows := numbers[0], numbers[1]
		snapshot := model.OperationsAccountSnapshot{
			Platform: "wechat", ObservedOn: row[0], Followers: numbers[3],
			NewFollowers: &newFollowers, Unfollows: &unfollows, Source: "admin_export",
		}
		snapshots = append(snapshots, snapshot)
		previous = &snapshots[len(snapshots)-1]
		if len(snapshots) > 2000 {
			return nil, errors.New("关注数据表超出 2000 天限制")
		}
	}
	if len(snapshots) == 0 {
		return nil, errors.New("关注数据表没有有效记录")
	}
	return snapshots, nil
}

func (h *OperationsProgressHandler) ImportWeChatFollowers(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, weChatImportLimit)
	upload, err := c.FormFile("file")
	if err != nil || upload.Size > weChatImportLimit {
		writeAPIError(c, http.StatusBadRequest, "请选择不超过 2MB 的公众号用户增长表格")
		return
	}
	file, err := upload.Open()
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "关注数据表读取失败")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, weChatImportLimit+1))
	if err != nil || len(data) > weChatImportLimit {
		writeAPIError(c, http.StatusBadRequest, "关注数据表读取失败")
		return
	}
	snapshots, err := parseWeChatFollowerExport(data, time.Now())
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "platform"}, {Name: "observed_on"}},
		DoUpdates: clause.AssignmentColumns([]string{"followers", "new_followers", "unfollows", "source"}),
	}).CreateInBatches(snapshots, 100).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "关注数据保存失败")
		return
	}
	writeAPI(c, http.StatusOK, "关注数据已更新", gin.H{
		"count": len(snapshots),
		"first": snapshots[0].ObservedOn,
		"last":  snapshots[len(snapshots)-1].ObservedOn,
	})
}
