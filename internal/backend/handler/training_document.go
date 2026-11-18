package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/privatefile"
)

type trainingDocumentStore interface {
	Get(context.Context, string) (string, error)
	Set(context.Context, string, string) error
}

type TrainingDocumentHandler struct {
	store trainingDocumentStore
	files *privatefile.Store
}

func NewTrainingDocumentHandler(store trainingDocumentStore, files *privatefile.Store) *TrainingDocumentHandler {
	return &TrainingDocumentHandler{store: store, files: files}
}

func trainingDocumentKey(slug string) (string, uint64, bool) {
	switch slug {
	case "start":
		return "training_document_start", 1, true
	case "git":
		return "training_document_git", 2, true
	default:
		return "", 0, false
	}
}

var trainingImageName = regexp.MustCompile(`^[a-f0-9]{32}\.(?:jpg|jpeg|png|gif|webp)$`)
var trainingUploadToken = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)

func (h *TrainingDocumentHandler) Get(c *gin.Context) {
	key, _, ok := trainingDocumentKey(c.Param("slug"))
	if !ok {
		writeAPIError(c, http.StatusNotFound, "文档不存在")
		return
	}
	body, err := h.store.Get(c.Request.Context(), key)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取文档失败")
		return
	}
	writeAPI(c, http.StatusOK, "文档已读取", gin.H{"body": body})
}

func (h *TrainingDocumentHandler) Save(c *gin.Context) {
	key, scopeID, ok := trainingDocumentKey(c.Param("slug"))
	if !ok {
		writeAPIError(c, http.StatusNotFound, "文档不存在")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 22<<20)
	if err := c.Request.ParseMultipartForm(22 << 20); err != nil {
		writeAPIError(c, http.StatusBadRequest, "文档或图片大小超出限制")
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	body := c.PostForm("body")
	if !utf8.ValidString(body) || strings.TrimSpace(body) == "" || utf8.RuneCountInString(body) > 20000 {
		writeAPIError(c, http.StatusBadRequest, "文档正文不能为空或超过 20000 字")
		return
	}
	files := c.Request.MultipartForm.File["files"]
	var tokens []string
	if err := json.Unmarshal([]byte(c.PostForm("uploadTokens")), &tokens); err != nil || len(files) != len(tokens) || len(files) > 5 {
		writeAPIError(c, http.StatusBadRequest, "图片上传参数不正确")
		return
	}
	if len(files) > 0 && h.files == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "图片存储暂不可用")
		return
	}
	if len(files) > 0 {
		if err := validateTrainingImages(files, tokens, body); err != nil {
			writeAPIError(c, http.StatusBadRequest, err.Error())
			return
		}
	}

	user, hasSession := middleware.CurrentSessionUser(c)
	if !hasSession || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}

	saved := make([]string, 0, len(files))
	committed := false
	defer func() {
		if !committed {
			for _, path := range saved {
				_ = h.files.Remove(path)
			}
		}
	}()
	for i, file := range files {
		stored, err := h.files.Save(c.Request.Context(), scopeID, user.ID, privatefile.Upload{
			Header: file, FileName: file.Filename,
		})
		if err != nil {
			writeAPIError(c, http.StatusInternalServerError, "保存文档图片失败")
			return
		}
		saved = append(saved, stored.StoragePath)
		body = strings.ReplaceAll(body, "community-upload://"+tokens[i], "/api/training-documents/images/"+stored.StoragePath)
	}
	if strings.Contains(body, "community-upload://") || strings.Contains(body, "blob:") || strings.Contains(body, "data:image/") {
		writeAPIError(c, http.StatusBadRequest, "文档中有未保存的图片")
		return
	}
	if err := h.store.Set(c.Request.Context(), key, body); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "保存文档失败")
		return
	}
	committed = true
	writeAPI(c, http.StatusOK, "文档已保存", gin.H{"body": body})
}

func validateTrainingImages(files []*multipart.FileHeader, tokens []string, body string) error {
	var total int64
	seen := make(map[string]bool, len(tokens))
	for i, file := range files {
		token := tokens[i]
		if !trainingUploadToken.MatchString(token) || seen[token] || !strings.Contains(body, "community-upload://"+token) {
			return errors.New("文档中的图片引用不正确")
		}
		seen[token] = true
		if file.Size <= 0 || file.Size > 10<<20 {
			return errors.New("单张图片不能超过 10 MB")
		}
		total += file.Size
		if total > 20<<20 {
			return errors.New("图片总大小不能超过 20 MB")
		}
		src, err := file.Open()
		if err != nil {
			return errors.New("无法读取上传图片")
		}
		var signature [512]byte
		size, readErr := io.ReadFull(src, signature[:])
		_ = src.Close()
		if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
			return errors.New("无法读取上传图片")
		}
		kind := http.DetectContentType(signature[:size])
		ext := strings.ToLower(filepath.Ext(file.Filename))
		mimeTypes := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
		if mimeTypes[ext] == "" || mimeTypes[ext] != kind {
			return fmt.Errorf("图片仅支持 JPG、PNG、GIF 或 WebP")
		}
	}
	return nil
}

func (h *TrainingDocumentHandler) Image(c *gin.Context) {
	scope, err := strconv.ParseUint(c.Param("scope"), 10, 64)
	if err != nil || (scope != 1 && scope != 2) {
		c.Status(http.StatusNotFound)
		return
	}
	owner, err := strconv.ParseUint(c.Param("owner"), 10, 64)
	if err != nil || owner == 0 || !trainingImageName.MatchString(c.Param("filename")) || h.files == nil {
		c.Status(http.StatusNotFound)
		return
	}
	relative := fmt.Sprintf("%d/%d/%s", scope, owner, c.Param("filename"))
	path, err := h.files.ResolvePath(relative)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Type", map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}[filepath.Ext(path)])
	c.File(path)
}
