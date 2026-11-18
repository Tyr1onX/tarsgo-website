package handler

import (
	"archive/zip"
	"encoding/xml"
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

const douyinImportLimit = 2 << 20

type douyinCell struct {
	Ref    string `xml:"r,attr"`
	Type   string `xml:"t,attr"`
	Value  string `xml:"v"`
	Inline string `xml:"is>t"`
}

type douyinSheet struct {
	Rows []struct {
		Cells []douyinCell `xml:"c"`
	} `xml:"sheetData>row"`
}

func parseDouyinExport(file io.ReaderAt, size int64, now time.Time) ([]model.OperationsPlatformPost, error) {
	archive, err := zip.NewReader(file, size)
	if err != nil {
		return nil, err
	}
	var shared struct {
		Entries []struct {
			Text string `xml:"t"`
			Runs []struct {
				Text string `xml:"t"`
			} `xml:"r"`
		} `xml:"si"`
	}
	var sheet douyinSheet
	foundSheet := false
	for _, entry := range archive.File {
		if entry.Name != "xl/sharedStrings.xml" && entry.Name != "xl/worksheets/sheet1.xml" {
			continue
		}
		if entry.UncompressedSize64 > 8<<20 {
			return nil, errors.New("作品表数据过大")
		}
		reader, err := entry.Open()
		if err != nil {
			return nil, err
		}
		if entry.Name == "xl/sharedStrings.xml" {
			err = xml.NewDecoder(io.LimitReader(reader, 8<<20)).Decode(&shared)
		} else {
			err = xml.NewDecoder(io.LimitReader(reader, 8<<20)).Decode(&sheet)
			foundSheet = true
		}
		reader.Close()
		if err != nil {
			return nil, err
		}
	}
	if !foundSheet || len(sheet.Rows) < 2 || len(sheet.Rows) > 2001 {
		return nil, errors.New("作品表缺少有效数据")
	}
	value := func(cell douyinCell) (string, error) {
		if cell.Type != "s" {
			if cell.Type == "inlineStr" {
				return cell.Inline, nil
			}
			return cell.Value, nil
		}
		index, err := strconv.Atoi(cell.Value)
		if err != nil || index < 0 || index >= len(shared.Entries) {
			return "", errors.New("作品表文本索引无效")
		}
		item := shared.Entries[index]
		text := item.Text
		for _, run := range item.Runs {
			text += run.Text
		}
		return text, nil
	}
	readRow := func(cells []douyinCell) (map[string]string, error) {
		row := make(map[string]string, len(cells))
		for _, cell := range cells {
			column := strings.TrimRight(cell.Ref, "0123456789")
			if column == "" {
				return nil, errors.New("作品表列格式无效")
			}
			text, err := value(cell)
			if err != nil {
				return nil, err
			}
			row[column] = text
		}
		return row, nil
	}
	header, err := readRow(sheet.Rows[0].Cells)
	if err != nil {
		return nil, err
	}
	columns := map[string]string{}
	for column, name := range header {
		columns[name] = column
	}
	for _, name := range []string{"作品名称", "发布时间", "体裁", "审核状态", "播放量", "点赞量", "评论量", "分享量", "收藏量", "主页访问量", "粉丝增量"} {
		if columns[name] == "" {
			return nil, errors.New("请选择抖音创作者中心导出的作品列表")
		}
	}
	beijing := time.FixedZone("Beijing", 8*3600)
	posts := make([]model.OperationsPlatformPost, 0, len(sheet.Rows)-1)
	seen := make(map[string]bool)
	for _, entry := range sheet.Rows[1:] {
		row, err := readRow(entry.Cells)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(row[columns["审核状态"]]) != "公开" {
			continue
		}
		title := strings.TrimSpace(strings.Split(row[columns["作品名称"]], "\n")[0])
		if title == "" {
			return nil, errors.New("作品名称不能为空")
		}
		if runes := []rune(title); len(runes) > 120 {
			title = string(runes[:120])
		}
		published, err := time.ParseInLocation("2006-01-02 15:04:05", row[columns["发布时间"]], beijing)
		if err != nil || published.After(now.Add(time.Minute)) {
			return nil, errors.New("作品发布日期格式不正确")
		}
		views, err := strconv.ParseInt(row[columns["播放量"]], 10, 64)
		if err != nil || views < 0 {
			return nil, errors.New("作品播放量格式不正确")
		}
		externalID := strconv.FormatInt(published.Unix(), 10)
		if seen[externalID] {
			return nil, errors.New("作品发布日期重复，无法区分作品")
		}
		seen[externalID] = true
		mediaType := "video"
		if strings.TrimSpace(row[columns["体裁"]]) == "图文" {
			mediaType = "image"
		}
		post := model.OperationsPlatformPost{
			Platform: "douyin", ExternalID: externalID, Title: title,
			PublishedAt: published.UTC(), ViewCount: views, MediaType: mediaType, SyncedAt: now.UTC(),
		}
		for _, metric := range []struct {
			name   string
			target *int64
		}{
			{"点赞量", &post.LikeCount}, {"评论量", &post.CommentCount},
			{"分享量", &post.ShareCount}, {"收藏量", &post.FavoriteCount},
		} {
			n, err := strconv.ParseInt(strings.TrimSpace(row[columns[metric.name]]), 10, 64)
			if err != nil || n < 0 {
				return nil, fmt.Errorf("%s格式不正确", metric.name)
			}
			*metric.target = n
		}
		for _, metric := range []struct {
			name   string
			target **int64
		}{
			{"主页访问量", &post.ProfileVisits}, {"粉丝增量", &post.FollowerGain},
		} {
			raw := strings.TrimSpace(row[columns[metric.name]])
			if raw == "-" || raw == "" {
				continue
			}
			n, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || n < 0 {
				return nil, fmt.Errorf("%s格式不正确", metric.name)
			}
			*metric.target = &n
		}
		posts = append(posts, post)
	}
	if len(posts) == 0 {
		return nil, errors.New("作品表没有公开作品")
	}
	return posts, nil
}

func (h *OperationsProgressHandler) ImportDouyin(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, douyinImportLimit)
	upload, err := c.FormFile("file")
	if err != nil || upload.Size > douyinImportLimit {
		writeAPIError(c, http.StatusBadRequest, "请选择不超过 2MB 的抖音作品列表")
		return
	}
	file, err := upload.Open()
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "作品表读取失败")
		return
	}
	defer file.Close()
	posts, err := parseDouyinExport(file, upload.Size, time.Now())
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, fmt.Sprintf("导入失败：%v", err))
		return
	}
	if err := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "platform"}, {Name: "external_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"title", "view_count", "media_type", "like_count", "comment_count", "share_count", "favorite_count", "profile_visits", "follower_gain", "synced_at"}),
	}).CreateInBatches(posts, 100).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "作品数据保存失败")
		return
	}
	writeAPI(c, http.StatusOK, "作品数据已更新", gin.H{"count": len(posts)})
}

