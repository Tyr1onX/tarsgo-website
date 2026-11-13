package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
)

var errOperationsStageInvalid = errors.New("invalid operations stage transition")

var operationsStageLabels = map[string]map[string]string{
	"video": {
		"unconfirmed": "待确认", "planning": "选题文案", "materials": "素材拍摄",
		"editing": "剪辑制作", "review": "审核确认", "published": "已发布",
	},
	"merchandise": {
		"unconfirmed": "待确认", "planning": "需求确定", "design": "设计制作",
		"approval": "设计定稿", "sample": "打样确认",
		"production": "批量生产", "delivered": "完成发放",
	},
}

func validOperationsStage(kind, stage string) bool {
	if kind == "video" || kind == "merchandise" {
		_, ok := operationsStageLabels[kind][stage]
		return ok
	}
	return stage == ""
}

type operationsStageInput struct {
	Stage   string `json:"stage"`
	Confirm bool   `json:"confirm"`
}

func (h *OperationsProgressHandler) RecordStage(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		writeAPIError(c, http.StatusBadRequest, "事项编号不正确")
		return
	}
	var input operationsStageInput
	if c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, http.StatusBadRequest, "阶段参数不正确")
		return
	}
	user, _ := middleware.CurrentSessionUser(c)
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var item model.OperationsProgressItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if item.Status == "done" {
			return errOperationsStageInvalid
		}
		if item.Kind != "video" && item.Kind != "merchandise" {
			return errOperationsStageInvalid
		}
		if !input.Confirm && !validOperationsStage(item.Kind, input.Stage) {
			return errOperationsStageInvalid
		}
		from := item.Stage
		to := input.Stage
		if input.Confirm {
			to = from
		}
		if to == from && !input.Confirm {
			return errOperationsStageInvalid
		}
		kind := "stage"
		content := fmt.Sprintf("阶段：%s → %s", operationsStageLabels[item.Kind][from], operationsStageLabels[item.Kind][to])
		if input.Confirm {
			kind = "confirmed"
			content = fmt.Sprintf("已确认：%s（无变化）", operationsStageLabels[item.Kind][from])
		}
		if !input.Confirm {
			if err := tx.Model(&item).Update("stage", to).Error; err != nil {
				return err
			}
		}
		entry := model.OperationsProgressUpdate{
			ItemID: item.ID, AuthorID: user.ID, Kind: kind,
			FromStage: from, ToStage: to, Content: content,
		}
		return tx.Create(&entry).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "事项不存在")
	} else if errors.Is(err, errOperationsStageInvalid) {
		writeAPIError(c, http.StatusBadRequest, "当前状态无法执行此阶段操作")
	} else if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "阶段更新失败，请重试")
	} else {
		writeAPI(c, http.StatusOK, "阶段进度已记录", gin.H{"id": id})
	}
}
