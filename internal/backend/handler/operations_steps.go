package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/operationsworkflow"
)

type operationsStepView struct {
	model.OperationsProgressStep
	AssigneeName string `json:"assigneeName"`
}

type operationsMember struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

func (h *OperationsProgressHandler) members(ctx context.Context) ([]operationsMember, error) {
	var rows []struct {
		ID             uint64
		RealName       *string
		GitHubUsername *string
	}
	err := h.db.WithContext(ctx).Table("users AS u").
		Select("DISTINCT u.id, u.real_name, u.github_username").
		Joins("JOIN roles AS r ON r.id = u.role_id").
		Where(`u.status = ? AND (r.name = ? OR EXISTS (
			SELECT 1 FROM user_group_members AS m
			JOIN user_groups AS g ON g.id = m.group_id
			WHERE m.user_id = u.id AND g.status = ?
		))`, model.UserStatusEnabled, model.RoleNameSuperAdmin, model.UserGroupStatusActive).
		Order("u.id ASC").Find(&rows).Error
	if err != nil {
		return nil, err
	}
	members := make([]operationsMember, 0, len(rows))
	for _, row := range rows {
		name := ""
		if row.RealName != nil {
			name = strings.TrimSpace(*row.RealName)
		}
		if name == "" && row.GitHubUsername != nil {
			name = strings.TrimSpace(*row.GitHubUsername)
		}
		if name == "" {
			name = fmt.Sprintf("成员 #%d", row.ID)
		}
		members = append(members, operationsMember{ID: row.ID, Name: name})
	}
	return members, nil
}

func operationsStepState(steps []operationsStepView) (status, stage string) {
	if len(steps) == 0 {
		return "", ""
	}
	allDone, blocked := true, false
	current := -1
	for i, step := range steps {
		if step.Status != "done" {
			allDone = false
		}
		if step.Status == "blocked" {
			blocked = true
		}
		if current < 0 && (step.Status == "active" || step.Status == "blocked") {
			current = i
		}
	}
	if allDone {
		return "done", steps[len(steps)-1].Key
	}
	if current < 0 {
		for i, step := range steps {
			if step.Status != "done" {
				current = i
				break
			}
		}
	}
	if blocked {
		status = "blocked"
	} else {
		status = "active"
	}
	return status, steps[current].Key
}

func operationsStepID(c *gin.Context) (uint64, uint64, bool) {
	itemID, itemErr := strconv.ParseUint(c.Param("id"), 10, 64)
	stepID, stepErr := strconv.ParseUint(c.Param("stepId"), 10, 64)
	if itemErr != nil || stepErr != nil || itemID == 0 || stepID == 0 {
		writeAPIError(c, http.StatusBadRequest, "环节编号不正确")
		return 0, 0, false
	}
	return itemID, stepID, true
}

func (h *OperationsProgressHandler) AddStep(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	itemID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	var input struct {
		Title string `json:"title"`
	}
	if err != nil || itemID == 0 || c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, http.StatusBadRequest, "环节参数不正确")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len([]rune(input.Title)) > 80 {
		writeAPIError(c, http.StatusBadRequest, "请填写环节名称")
		return
	}
	user, _ := middleware.CurrentSessionUser(c)
	var created model.OperationsProgressStep
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var item model.OperationsProgressItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, itemID).Error; err != nil {
			return err
		}
		var position int
		if err := tx.Model(&model.OperationsProgressStep{}).Where("item_id = ?", itemID).
			Select("COALESCE(MAX(position), -1) + 1").Scan(&position).Error; err != nil {
			return err
		}
		created = model.OperationsProgressStep{
			ItemID: itemID, Title: input.Title, Position: position, Status: "pending",
		}
		if err := tx.Create(&created).Error; err != nil {
			return err
		}
		return tx.Create(&model.OperationsProgressUpdate{
			ItemID: itemID, AuthorID: user.ID, Kind: "progress", Content: "新增环节：" + input.Title,
		}).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "运营事项不存在")
	} else if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "新增环节失败")
	} else {
		writeAPI(c, http.StatusCreated, "环节已添加", created)
	}
}

func (h *OperationsProgressHandler) UpdateStep(c *gin.Context) {
	itemID, stepID, ok := operationsStepID(c)
	if !ok {
		return
	}
	var input struct {
		Title       *string `json:"title"`
		AssigneeID  *uint64 `json:"assigneeId"`
		Status      *string `json:"status"`
		BlockReason *string `json:"blockReason"`
		Note        string  `json:"note"`
		EvidenceURL string  `json:"evidenceUrl"`
	}
	if c.ShouldBindJSON(&input) != nil || (input.Title == nil && input.AssigneeID == nil && input.Status == nil && input.BlockReason == nil && input.Note == "" && input.EvidenceURL == "") {
		writeAPIError(c, http.StatusBadRequest, "环节修改参数不正确")
		return
	}
	canManage, err := h.canManage(c)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "权限检查失败")
		return
	}
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	if !canManage && (input.Title != nil || input.AssigneeID != nil) {
		writeAPIError(c, http.StatusForbidden, "只能更新自己负责环节的进度")
		return
	}
	if input.Title != nil {
		*input.Title = strings.TrimSpace(*input.Title)
		if *input.Title == "" || len([]rune(*input.Title)) > 80 {
			writeAPIError(c, http.StatusBadRequest, "环节名称不正确")
			return
		}
	}
	if input.Status != nil && *input.Status != "pending" && *input.Status != "active" && *input.Status != "blocked" && *input.Status != "done" {
		writeAPIError(c, http.StatusBadRequest, "环节状态不正确")
		return
	}
	if input.BlockReason != nil {
		*input.BlockReason = strings.TrimSpace(*input.BlockReason)
		if len([]rune(*input.BlockReason)) > 300 {
			writeAPIError(c, http.StatusBadRequest, "卡点原因过长")
			return
		}
	}
	input.Note = strings.TrimSpace(input.Note)
	input.EvidenceURL = strings.TrimSpace(input.EvidenceURL)
	if len([]rune(input.Note)) > 400 || !validOperationsEvidenceURL(input.EvidenceURL) {
		writeAPIError(c, http.StatusBadRequest, "备注或成果链接不正确")
		return
	}
	var assigneeName string
	if input.AssigneeID != nil && *input.AssigneeID != 0 {
		members, err := h.members(c.Request.Context())
		if err != nil {
			writeAPIError(c, http.StatusInternalServerError, "成员读取失败")
			return
		}
		for _, member := range members {
			if member.ID == *input.AssigneeID {
				assigneeName = member.Name
				break
			}
		}
		if assigneeName == "" {
			writeAPIError(c, http.StatusBadRequest, "只能分配给有效战队成员")
			return
		}
	}
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var item model.OperationsProgressItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, itemID).Error; err != nil {
			return err
		}
		var step model.OperationsProgressStep
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND item_id = ?", stepID, itemID).Take(&step).Error; err != nil {
			return err
		}
		if !canManage && (step.AssigneeID == nil || *step.AssigneeID != user.ID) {
			return errOperationsStepForbidden
		}
		changes := make(map[string]any)
		notes := make([]string, 0, 3)
		if input.Title != nil && *input.Title != step.Title {
			changes["title"] = *input.Title
			notes = append(notes, "重命名为"+*input.Title)
		}
		if input.AssigneeID != nil && (step.AssigneeID == nil && *input.AssigneeID != 0 ||
			step.AssigneeID != nil && *step.AssigneeID != *input.AssigneeID) {
			if *input.AssigneeID == 0 {
				changes["assignee_id"] = nil
				notes = append(notes, "负责人待分配")
			} else {
				changes["assignee_id"] = *input.AssigneeID
				notes = append(notes, "负责人："+assigneeName)
			}
		}
		if step.Key == "published" {
			var targetCount int64
			if err := tx.Model(&model.OperationsPublication{}).Where("item_id = ?", itemID).Count(&targetCount).Error; err != nil {
				return err
			}
			if targetCount > 0 {
				return errOperationsPublishTargets
			}
		}
		previousStatus := step.Status
		status := previousStatus
		if input.Status != nil {
			status = *input.Status
		}
		reason := step.BlockReason
		if input.BlockReason != nil {
			reason = *input.BlockReason
		}
		if status == "blocked" && reason == "" {
			return errOperationsStepReason
		}
		if status != "blocked" {
			reason = ""
		}
		if step.Key == "published" && status == "done" && previousStatus != "done" && item.ChannelID != nil {
			var remaining int64
			if err := tx.Model(&model.OperationsProgressStep{}).
				Where("item_id = ? AND id <> ? AND status <> ?", itemID, stepID, "done").
				Count(&remaining).Error; err != nil {
				return err
			}
			if remaining > 0 {
				return errOperationsPublishIncomplete
			}
		}
		if status != step.Status {
			changes["status"] = status
			if status == "done" {
				changes["completed_at"] = time.Now().UTC()
			} else {
				changes["completed_at"] = nil
			}
			names := map[string]string{"pending": "待处理", "active": "进行中", "blocked": "受阻", "done": "已完成"}
			notes = append(notes, names[status])
		}
		if reason != step.BlockReason {
			changes["block_reason"] = reason
			if reason != "" {
				notes = append(notes, "卡点："+reason)
			}
		}
		if input.Note != "" {
			notes = append(notes, input.Note)
		}
		if input.EvidenceURL != "" {
			notes = append(notes, "提交成果链接")
		}
		if len(changes) == 0 && input.Note == "" && input.EvidenceURL == "" {
			return nil
		}
		if len(changes) > 0 {
			if err := tx.Model(&step).Updates(changes).Error; err != nil {
				return err
			}
		}
		if input.EvidenceURL != "" && step.Key == "published" && status == "done" {
			if err := tx.Model(&item).Update("publication_url", input.EvidenceURL).Error; err != nil {
				return err
			}
		}
		stepRef := step.ID
		if err := tx.Create(&model.OperationsProgressUpdate{
			ItemID: itemID, StepID: &stepRef, AuthorID: user.ID, Kind: "progress",
			Content:   step.Title + " · " + strings.Join(notes, " · "),
			FromStage: previousStatus, ToStage: status, Link: input.EvidenceURL,
		}).Error; err != nil {
			return err
		}
		if step.Key == "published" && status == "done" && previousStatus != "done" && item.ChannelID != nil {
			_, err := operationsworkflow.EnsureUpcoming(tx, *item.ChannelID)
			return err
		}
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "环节不存在")
	} else if errors.Is(err, errOperationsStepForbidden) {
		writeAPIError(c, http.StatusForbidden, "只能更新自己负责环节的进度")
	} else if errors.Is(err, errOperationsPublishTargets) {
		writeAPIError(c, http.StatusConflict, "请在作品详情中登记各平台发布状态")
	} else if errors.Is(err, errOperationsPublishIncomplete) {
		writeAPIError(c, http.StatusConflict, "请先完成审核和此前环节，再确认发布")
	} else if errors.Is(err, errOperationsStepReason) {
		writeAPIError(c, http.StatusBadRequest, "请填写具体卡点原因")
	} else if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "环节更新失败")
	} else {
		writeAPI(c, http.StatusOK, "环节已更新", gin.H{"id": stepID})
	}
}

var (
	errOperationsStepForbidden     = errors.New("step permission denied")
	errOperationsStepReason        = errors.New("step block reason required")
	errOperationsStepCompleted     = errors.New("completed step cannot be deleted")
	errOperationsLastStep          = errors.New("last step cannot be deleted")
	errOperationsPublishIncomplete = errors.New("publication steps incomplete")
	errOperationsPublishTargets    = errors.New("platform publishing managed by targets")
)

func (h *OperationsProgressHandler) DeleteStep(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	itemID, stepID, ok := operationsStepID(c)
	if !ok {
		return
	}
	user, _ := middleware.CurrentSessionUser(c)
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var step model.OperationsProgressStep
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND item_id = ?", stepID, itemID).Take(&step).Error; err != nil {
			return err
		}
		if step.Status == "done" {
			return errOperationsStepCompleted
		}
		var count int64
		if err := tx.Model(&model.OperationsProgressStep{}).Where("item_id = ?", itemID).Count(&count).Error; err != nil {
			return err
		}
		if count <= 1 {
			return errOperationsLastStep
		}
		if err := tx.Delete(&step).Error; err != nil {
			return err
		}
		return tx.Create(&model.OperationsProgressUpdate{
			ItemID: itemID, AuthorID: user.ID, Kind: "progress", Content: "移除环节：" + step.Title,
		}).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "环节不存在")
	} else if errors.Is(err, errOperationsStepCompleted) {
		writeAPIError(c, http.StatusConflict, "已完成环节请先恢复为待处理")
	} else if errors.Is(err, errOperationsLastStep) {
		writeAPIError(c, http.StatusConflict, "至少保留一个环节")
	} else if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "移除环节失败")
	} else {
		writeAPI(c, http.StatusOK, "环节已移除", gin.H{"id": stepID})
	}
}
