package handler

import (
	"errors"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/privatefile"
)

func validOperationsEvidenceURL(raw string) bool {
	if raw == "" {
		return true
	}
	if len(raw) > 500 {
		return false
	}
	link, err := url.Parse(raw)
	return err == nil && (link.Scheme == "http" || link.Scheme == "https") &&
		link.Host != "" && link.User == nil
}

func (h *OperationsProgressHandler) StepActivity(c *gin.Context) {
	itemID, stepID, ok := operationsStepID(c)
	if !ok {
		return
	}
	var step model.OperationsProgressStep
	if err := h.db.WithContext(c.Request.Context()).Where("id = ? AND item_id = ?", stepID, itemID).Take(&step).Error; err != nil {
		writeAPIError(c, http.StatusNotFound, "环节不存在")
		return
	}
	updates := make([]model.OperationsProgressUpdate, 0)
	if err := h.db.WithContext(c.Request.Context()).
		Where("item_id = ? AND step_id = ?", itemID, stepID).Order("id DESC").Limit(50).Find(&updates).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取进展记录失败")
		return
	}
	files := make([]model.OperationsStepAttachment, 0)
	if err := h.db.WithContext(c.Request.Context()).Where("item_id = ? AND step_id = ?", itemID, stepID).
		Order("id DESC").Limit(50).Find(&files).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取成果附件失败")
		return
	}
	members, err := h.members(c.Request.Context())
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取成员失败")
		return
	}
	names := make(map[uint64]string, len(members))
	for _, member := range members {
		names[member.ID] = member.Name
	}
	type entry struct {
		model.OperationsProgressUpdate
		AuthorName string `json:"authorName"`
	}
	result := make([]entry, len(updates))
	for i, update := range updates {
		name := names[update.AuthorID]
		if name == "" {
			name = "成员 #" + strconv.FormatUint(update.AuthorID, 10)
		}
		result[i] = entry{OperationsProgressUpdate: update, AuthorName: name}
	}
	writeAPI(c, http.StatusOK, "环节记录", gin.H{"updates": result, "attachments": files})
}

func (h *OperationsProgressHandler) UploadStepAttachment(c *gin.Context) {
	if h.files == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "成果文件存储暂不可用")
		return
	}
	itemID, stepID, ok := operationsStepID(c)
	if !ok {
		return
	}
	canManage, err := h.canManage(c)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "权限检查失败")
		return
	}
	actor, ok := middleware.CurrentSessionUser(c)
	if !ok || actor == nil {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	var step model.OperationsProgressStep
	if err := h.db.WithContext(c.Request.Context()).Where("id = ? AND item_id = ?", stepID, itemID).Take(&step).Error; err != nil {
		writeAPIError(c, http.StatusNotFound, "环节不存在")
		return
	}
	if !canManage && (step.AssigneeID == nil || *step.AssigneeID != actor.ID) {
		writeAPIError(c, http.StatusForbidden, "只能提交自己负责环节的成果")
		return
	}
	var count int64
	if err := h.db.WithContext(c.Request.Context()).Model(&model.OperationsStepAttachment{}).
		Where("step_id = ?", stepID).Count(&count).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取附件数量失败")
		return
	}
	if count >= 10 {
		writeAPIError(c, http.StatusConflict, "此环节最多保留10份成果文件")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 21<<20)
	header, err := c.FormFile("file")
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "请选择不超过20 MB的文件")
		return
	}
	validated, err := privatefile.ValidateUploads([]*multipart.FileHeader{header}, false)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	stored, err := h.files.Save(c.Request.Context(), itemID, actor.ID, validated[0])
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "保存成果文件失败")
		return
	}
	file := model.OperationsStepAttachment{
		ItemID: itemID, StepID: stepID, AuthorID: actor.ID,
		FileName: stored.FileName, StoragePath: stored.StoragePath, Size: stored.Size,
	}
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&file).Error; err != nil {
			return err
		}
		ref := stepID
		return tx.Create(&model.OperationsProgressUpdate{
			ItemID: itemID, StepID: &ref, AuthorID: actor.ID, Kind: "progress",
			Content: step.Title + " · 上传成果：" + file.FileName,
		}).Error
	})
	if err != nil {
		_ = h.files.Remove(stored.StoragePath)
		writeAPIError(c, http.StatusInternalServerError, "登记成果文件失败")
		return
	}
	writeAPI(c, http.StatusCreated, "成果已上传", file)
}

func (h *OperationsProgressHandler) OpenStepAttachment(c *gin.Context) {
	if h.files == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "成果文件暂不可用")
		return
	}
	fileID, err := strconv.ParseUint(c.Param("fileId"), 10, 64)
	if err != nil || fileID == 0 {
		writeAPIError(c, http.StatusBadRequest, "附件编号不正确")
		return
	}
	var file model.OperationsStepAttachment
	if err := h.db.WithContext(c.Request.Context()).First(&file, fileID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writeAPIError(c, http.StatusNotFound, "附件不存在")
		} else {
			writeAPIError(c, http.StatusInternalServerError, "读取附件失败")
		}
		return
	}
	path, err := h.files.ResolvePath(file.StoragePath)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "附件路径无效")
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": strings.TrimSpace(file.FileName)}))
	c.File(path)
}