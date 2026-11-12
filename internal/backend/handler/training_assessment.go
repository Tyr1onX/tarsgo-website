package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

type TrainingAssessmentHandler struct {
	db          *gorm.DB
	assignments *assignment.Service
}

func NewTrainingAssessmentHandler(db *gorm.DB, assignments *assignment.Service) *TrainingAssessmentHandler {
	return &TrainingAssessmentHandler{db: db, assignments: assignments}
}

type trainingGradeRow struct {
	Name  string `json:"name"`
	Score *uint8 `json:"score"`
	Note  string `json:"note"`
}

type capabilityRatingInput struct {
	DimensionID uint64 `json:"dimensionId"`
	Score       *uint8 `json:"score"`
	Note        string `json:"note"`
}

func normalizeTrainingRows(rows []trainingGradeRow) ([]trainingGradeRow, bool) {
	if len(rows) == 0 || len(rows) > 500 {
		return nil, false
	}
	seen := make(map[string]bool, len(rows))
	result := make([]trainingGradeRow, 0, len(rows))
	for _, row := range rows {
		row.Name = strings.TrimSpace(row.Name)
		row.Note = strings.TrimSpace(row.Note)
		if row.Name == "" || utf8.RuneCountInString(row.Name) > 100 || utf8.RuneCountInString(row.Note) > 500 || (row.Score != nil && *row.Score > 100) || seen[row.Name] {
			return nil, false
		}
		seen[row.Name] = true
		result = append(result, row)
	}
	return result, true
}

func (h *TrainingAssessmentHandler) fail(c *gin.Context, err error) {
	var serviceErr *assignment.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= 500 {
			middleware.LogInternalError(c, "training_assessment", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "training_assessment", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "读取或保存失败")
}

func (h *TrainingAssessmentHandler) members(c *gin.Context, groupID uint64) ([]assignment.MemberOption, bool) {
	if groupID == 0 {
		writeAPIError(c, http.StatusBadRequest, "请选择技术组")
		return nil, false
	}
	members, err := h.assignments.ListGroupMembers(c.Request.Context(), currentAssignmentActor(c), groupID)
	if err != nil {
		h.fail(c, err)
		return nil, false
	}
	return members, true
}

// Snapshot is admin-only. No score is added to any ordinary member endpoint.
func (h *TrainingAssessmentHandler) Snapshot(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Query("groupId"), 10, 64)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "技术组参数不合法")
		return
	}
	members, ok := h.members(c, groupID)
	if !ok {
		return
	}

	var grades []model.TrainingGrade
	var dimensions []model.CapabilityDimension
	var ratings []model.CapabilityRating
	db := h.db.WithContext(c.Request.Context())
	if err := db.Where("group_id = ?", groupID).Order("assessment_name ASC, user_id ASC").Find(&grades).Error; err != nil {
		h.fail(c, err)
		return
	}
	if err := db.Where("group_id = ?", groupID).Order("id ASC").Find(&dimensions).Error; err != nil {
		h.fail(c, err)
		return
	}
	if len(dimensions) > 0 {
		ids := make([]uint64, 0, len(dimensions))
		for _, dimension := range dimensions {
			ids = append(ids, dimension.ID)
		}
		if err := db.Where("dimension_id IN ?", ids).Find(&ratings).Error; err != nil {
			h.fail(c, err)
			return
		}
	}
	if grades == nil {
		grades = []model.TrainingGrade{}
	}
	if dimensions == nil {
		dimensions = []model.CapabilityDimension{}
	}
	if ratings == nil {
		ratings = []model.CapabilityRating{}
	}
	writeAPI(c, http.StatusOK, "读取培训成绩与能力评价成功", gin.H{"members": members, "grades": grades, "dimensions": dimensions, "ratings": ratings})
}

func (h *TrainingAssessmentHandler) ImportGrades(c *gin.Context) {
	var input struct {
		GroupID        uint64             `json:"groupId"`
		AssessmentName string             `json:"assessmentName"`
		Rows           []trainingGradeRow `json:"rows"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "成绩内容不合法")
		return
	}
	input.AssessmentName = strings.TrimSpace(input.AssessmentName)
	rows, valid := normalizeTrainingRows(input.Rows)
	if !valid || input.AssessmentName == "" || utf8.RuneCountInString(input.AssessmentName) > 120 {
		writeAPIError(c, http.StatusBadRequest, "成绩名称、姓名、分数或备注不合法，或存在重复姓名")
		return
	}
	members, ok := h.members(c, input.GroupID)
	if !ok {
		return
	}
	byName := make(map[string][]uint64, len(members))
	for _, member := range members {
		byName[member.Name] = append(byName[member.Name], member.UserID)
	}
	grades := make([]model.TrainingGrade, 0, len(rows))
	skipped := make([]string, 0)
	now := time.Now().UTC()
	for _, row := range rows {
		ids := byName[row.Name]
		if len(ids) != 1 {
			skipped = append(skipped, row.Name)
			continue
		}
		grades = append(grades, model.TrainingGrade{
			GroupID: input.GroupID, AssessmentName: input.AssessmentName,
			UserID: ids[0], Score: row.Score, Note: row.Note,
			UpdatedBy: currentAssignmentActor(c).ID, UpdatedAt: now,
		})
	}
	if len(grades) > 0 {
		err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
			for i := range grades {
				if err := tx.Clauses(clause.OnConflict{
					Columns:   []clause.Column{{Name: "group_id"}, {Name: "assessment_name"}, {Name: "user_id"}},
					DoUpdates: clause.AssignmentColumns([]string{"score", "note", "updated_by", "updated_at"}),
				}).Create(&grades[i]).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			h.fail(c, err)
			return
		}
	}
	writeAPI(c, http.StatusOK, "成绩同步完成", gin.H{"imported": len(grades), "unmatched": skipped})
}

func (h *TrainingAssessmentHandler) AddDimension(c *gin.Context) {
	var input struct {
		GroupID uint64 `json:"groupId"`
		Name    string `json:"name"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "能力维度不合法")
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 100 {
		writeAPIError(c, http.StatusBadRequest, "能力维度名称不合法")
		return
	}
	if _, ok := h.members(c, input.GroupID); !ok {
		return
	}
	var count int64
	if err := h.db.WithContext(c.Request.Context()).Model(&model.CapabilityDimension{}).Where("group_id = ?", input.GroupID).Count(&count).Error; err != nil {
		h.fail(c, err)
		return
	}
	if count >= 8 {
		writeAPIError(c, http.StatusBadRequest, "每组最多设置 8 个能力维度")
		return
	}
	item := model.CapabilityDimension{GroupID: input.GroupID, Name: input.Name, CreatedAt: time.Now().UTC()}
	if err := h.db.WithContext(c.Request.Context()).Create(&item).Error; err != nil {
		writeAPIError(c, http.StatusConflict, "能力维度名称已存在或保存失败")
		return
	}
	writeAPI(c, http.StatusCreated, "能力维度已添加", item)
}

func (h *TrainingAssessmentHandler) RemoveDimension(c *gin.Context) {
	groupID, e1 := strconv.ParseUint(c.Query("groupId"), 10, 64)
	dimensionID, e2 := strconv.ParseUint(c.Param("id"), 10, 64)
	if e1 != nil || e2 != nil || dimensionID == 0 {
		writeAPIError(c, http.StatusBadRequest, "参数不合法")
		return
	}
	if _, ok := h.members(c, groupID); !ok {
		return
	}
	var dimension model.CapabilityDimension
	if err := h.db.WithContext(c.Request.Context()).Where("group_id = ? AND id = ?", groupID, dimensionID).Take(&dimension).Error; err != nil {
		writeAPIError(c, http.StatusNotFound, "能力维度不存在")
		return
	}
	if err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("dimension_id = ?", dimensionID).Delete(&model.CapabilityRating{}).Error; err != nil {
			return err
		}
		return tx.Delete(&dimension).Error
	}); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "能力维度已删除", gin.H{"id": dimensionID})
}

func (h *TrainingAssessmentHandler) SaveRatings(c *gin.Context) {
	var input struct {
		GroupID uint64                  `json:"groupId"`
		UserID  uint64                  `json:"userId"`
		Ratings []capabilityRatingInput `json:"ratings"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.UserID == 0 || len(input.Ratings) > 8 {
		writeAPIError(c, http.StatusBadRequest, "能力评分不合法")
		return
	}
	members, ok := h.members(c, input.GroupID)
	if !ok {
		return
	}
	allowedMember := false
	for _, member := range members {
		if member.UserID == input.UserID {
			allowedMember = true
			break
		}
	}
	if !allowedMember {
		writeAPIError(c, http.StatusBadRequest, "成员不属于当前技术组")
		return
	}
	var dimensions []model.CapabilityDimension
	if err := h.db.WithContext(c.Request.Context()).Where("group_id = ?", input.GroupID).Find(&dimensions).Error; err != nil {
		h.fail(c, err)
		return
	}
	allowed := make(map[uint64]bool, len(dimensions))
	for _, dimension := range dimensions {
		allowed[dimension.ID] = true
	}
	seen := make(map[uint64]bool, len(input.Ratings))
	for _, rating := range input.Ratings {
		if !allowed[rating.DimensionID] || seen[rating.DimensionID] || (rating.Score != nil && *rating.Score > 5) || utf8.RuneCountInString(strings.TrimSpace(rating.Note)) > 500 {
			writeAPIError(c, http.StatusBadRequest, "能力维度、分数或备注不合法")
			return
		}
		seen[rating.DimensionID] = true
	}
	now, actorID := time.Now().UTC(), currentAssignmentActor(c).ID
	if err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		for _, value := range input.Ratings {
			if value.Score == nil {
				if err := tx.Where("dimension_id = ? AND user_id = ?", value.DimensionID, input.UserID).Delete(&model.CapabilityRating{}).Error; err != nil {
					return err
				}
				continue
			}
			rating := model.CapabilityRating{DimensionID: value.DimensionID, UserID: input.UserID, Score: *value.Score, Note: strings.TrimSpace(value.Note), UpdatedBy: actorID, UpdatedAt: now}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "dimension_id"}, {Name: "user_id"}},
				DoUpdates: clause.AssignmentColumns([]string{"score", "note", "updated_by", "updated_at"}),
			}).Create(&rating).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "能力评价已保存", gin.H{"userId": input.UserID})
}
