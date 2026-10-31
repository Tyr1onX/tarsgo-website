package handler

import (
	"errors"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/trainingqa"
)

type CommunityHandler struct{ service *trainingqa.Service }

func NewCommunityHandler(service *trainingqa.Service) *CommunityHandler {
	return &CommunityHandler{service: service}
}

func (h *CommunityHandler) List(c *gin.Context) {
	filter, ok := communityFilter(c)
	if !ok {
		return
	}
	result, err := h.service.ListCommunity(c.Request.Context(), currentTrainingQuestionActor(c), filter)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取社区帖子成功", result)
}

func (h *CommunityHandler) Hot(c *gin.Context) {
	limit := 5
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 10 {
			writeAPIError(c, http.StatusBadRequest, "热门话题数量不合法")
			return
		}
		limit = parsed
	}
	items, err := h.service.HotCommunityPosts(c.Request.Context(), currentTrainingQuestionActor(c), limit)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取热门话题成功", items)
}

func (h *CommunityHandler) Get(c *gin.Context) {
	postID, ok := parseCommunityID(c, "id", "帖子编号")
	if !ok {
		return
	}
	item, err := h.service.GetCommunityPost(c.Request.Context(), currentTrainingQuestionActor(c), postID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取社区讨论成功", item)
}

func (h *CommunityHandler) Create(c *gin.Context) {
	if !parseQuestionMultipart(c) {
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	files := communityMultipartFiles(c)
	item, err := h.service.CreateCommunityPost(c.Request.Context(), currentTrainingQuestionActor(c), trainingqa.CommunityPostInput{
		Category: c.PostForm("category"), Title: c.PostForm("title"), Body: c.PostForm("body"), Files: files,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "帖子已发布", item)
}

func (h *CommunityHandler) Update(c *gin.Context) {
	postID, ok := parseCommunityID(c, "id", "帖子编号")
	if !ok {
		return
	}
	var request trainingqa.CommunityPostUpdate
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "帖子信息不合法")
		return
	}
	item, err := h.service.UpdateCommunityPost(c.Request.Context(), currentTrainingQuestionActor(c), postID, request)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "帖子已更新", item)
}

func (h *CommunityHandler) Delete(c *gin.Context) {
	postID, ok := parseCommunityID(c, "id", "帖子编号")
	if !ok {
		return
	}
	if err := h.service.DeleteCommunityPost(c.Request.Context(), currentTrainingQuestionActor(c), postID); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "帖子已删除", gin.H{"id": postID})
}

func (h *CommunityHandler) AddComment(c *gin.Context) {
	postID, ok := parseCommunityID(c, "id", "帖子编号")
	if !ok {
		return
	}
	if !parseQuestionMultipart(c) {
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	var parentPostID *uint64
	if raw := strings.TrimSpace(c.PostForm("parentPostId")); raw != "" {
		value, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || value == 0 {
			writeAPIError(c, http.StatusBadRequest, "回复目标不合法")
			return
		}
		parentPostID = &value
	}
	item, err := h.service.AddCommunityComment(c.Request.Context(), currentTrainingQuestionActor(c), postID, trainingqa.CommunityCommentInput{
		Body: c.PostForm("body"), ParentPostID: parentPostID, Files: communityMultipartFiles(c),
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "回复已发布", item)
}

func (h *CommunityHandler) UpdateComment(c *gin.Context) {
	commentID, ok := parseCommunityID(c, "id", "回复编号")
	if !ok {
		return
	}
	var request struct {
		Body string `json:"body"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "回复内容不合法")
		return
	}
	item, err := h.service.UpdateCommunityComment(c.Request.Context(), currentTrainingQuestionActor(c), commentID, request.Body)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "回复已更新", item)
}

func (h *CommunityHandler) DeleteComment(c *gin.Context) {
	commentID, ok := parseCommunityID(c, "id", "回复编号")
	if !ok {
		return
	}
	item, err := h.service.DeleteCommunityComment(c.Request.Context(), currentTrainingQuestionActor(c), commentID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "回复已删除", item)
}

func (h *CommunityHandler) SetLike(c *gin.Context)     { h.setReaction(c, "like") }
func (h *CommunityHandler) SetBookmark(c *gin.Context) { h.setReaction(c, "bookmark") }

func (h *CommunityHandler) setReaction(c *gin.Context, kind string) {
	postID, ok := parseCommunityID(c, "id", "帖子编号")
	if !ok {
		return
	}
	state, err := h.service.SetCommunityReaction(c.Request.Context(), currentTrainingQuestionActor(c), postID, kind, c.Request.Method != http.MethodDelete)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "社区互动状态已更新", state)
}

func (h *CommunityHandler) Moderate(c *gin.Context) {
	postID, ok := parseCommunityID(c, "id", "帖子编号")
	if !ok {
		return
	}
	var request trainingqa.CommunityModerationUpdate
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "管理状态不合法")
		return
	}
	item, err := h.service.ModerateCommunityPost(c.Request.Context(), currentTrainingQuestionActor(c), postID, request)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "帖子管理状态已更新", item)
}

func (h *CommunityHandler) OpenFile(c *gin.Context) {
	fileID, ok := parseCommunityID(c, "id", "附件编号")
	if !ok {
		return
	}
	file, err := h.service.OpenFile(c.Request.Context(), currentTrainingQuestionActor(c), fileID)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Disposition", "inline; filename*=UTF-8''"+url.PathEscape(file.FileName))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, no-store")
	c.Data(http.StatusOK, file.ContentType, file.Content)
}

func communityFilter(c *gin.Context) (trainingqa.CommunityListFilter, bool) {
	filter := trainingqa.CommunityListFilter{
		Sort: strings.TrimSpace(c.DefaultQuery("sort", "latest")), Category: strings.TrimSpace(c.Query("category")),
		Keyword: strings.TrimSpace(c.Query("q")), Saved: c.Query("saved") == "true",
		MineOnly: c.Query("mineOnly") == "true", FAQOnly: c.Query("faqOnly") == "true",
		Status: strings.TrimSpace(c.Query("status")), Page: 1, PageSize: trainingqa.CommunityDefaultPageSize,
	}
	for key, target := range map[string]*int{"page": &filter.Page, "pageSize": &filter.PageSize} {
		if raw := strings.TrimSpace(c.Query(key)); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil {
				writeAPIError(c, http.StatusBadRequest, "分页参数不合法")
				return trainingqa.CommunityListFilter{}, false
			}
			*target = value
		}
	}
	if raw := strings.TrimSpace(c.Query("groupId")); raw != "" {
		value, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || value == 0 {
			writeAPIError(c, http.StatusBadRequest, "技术组参数不合法")
			return trainingqa.CommunityListFilter{}, false
		}
		filter.GroupID = value
	}
	return filter, true
}

func communityMultipartFiles(c *gin.Context) []*multipart.FileHeader {
	if c.Request.MultipartForm == nil {
		return nil
	}
	return c.Request.MultipartForm.File["files"]
}

func parseCommunityID(c *gin.Context, parameter, label string) (uint64, bool) {
	value, err := strconv.ParseUint(strings.TrimSpace(c.Param(parameter)), 10, 64)
	if err != nil || value == 0 {
		writeAPIError(c, http.StatusBadRequest, label+"不合法")
		return 0, false
	}
	return value, true
}

func (h *CommunityHandler) fail(c *gin.Context, err error) {
	var serviceErr *trainingqa.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= http.StatusInternalServerError {
			middleware.LogInternalError(c, "community", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "community", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
