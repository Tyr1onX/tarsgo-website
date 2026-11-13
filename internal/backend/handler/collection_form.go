package handler

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/accountprofile"
)

var collectionFieldKey = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_]{0,39}$`)

type CollectionFormHandler struct{ db *gorm.DB }

func NewCollectionFormHandler(db *gorm.DB) *CollectionFormHandler {
	return &CollectionFormHandler{db: db}
}

type collectionFormInput struct {
	Title         string                  `json:"title"`
	Description   string                  `json:"description"`
	Fields        []model.CollectionField `json:"fields"`
	Status        string                  `json:"status"`
	LoginRequired *bool                   `json:"loginRequired"`
	Capacity      int                     `json:"capacity"`
	OpensAt       *time.Time              `json:"opensAt"`
	ClosesAt      *time.Time              `json:"closesAt"`
}

func validateCollectionForm(input collectionFormInput) error {
	draft := input.Status == "draft"
	if (!draft && strings.TrimSpace(input.Title) == "") || len([]rune(input.Title)) > 120 || len([]rune(input.Description)) > 1000 {
		return errors.New("标题或说明长度不合法")
	}
	if input.Status != "draft" && input.Status != "published" && input.Status != "closed" {
		return errors.New("表单状态不合法")
	}
	if input.Capacity < 0 || input.Capacity > 1000000 || (!draft && len(input.Fields) == 0) || len(input.Fields) > 30 {
		return errors.New("字段数量或总名额不合法")
	}
	if !draft && input.OpensAt != nil && input.ClosesAt != nil && !input.OpensAt.Before(*input.ClosesAt) {
		return errors.New("截止时间必须晚于开始时间")
	}
	seen := make(map[string]bool, len(input.Fields))
	for _, field := range input.Fields {
		if !collectionFieldKey.MatchString(field.Key) || seen[field.Key] || (!draft && strings.TrimSpace(field.Label) == "") || len([]rune(field.Label)) > 100 {
			return errors.New("字段名称或标识不合法")
		}
		seen[field.Key] = true
		switch field.Type {
		case "text", "textarea", "number", "date":
			if len(field.Options) != 0 {
				return errors.New("此字段类型不能设置选项")
			}
		case "radio", "select", "checkbox":
			if len(field.Options) < 2 || len(field.Options) > 30 {
				return errors.New("选择题须设置 2–30 个选项")
			}
			values := map[string]bool{}
			for _, option := range field.Options {
				if strings.TrimSpace(option.Value) == "" || (!draft && strings.TrimSpace(option.Label) == "") ||
					len([]rune(option.Value)) > 100 || len([]rune(option.Label)) > 100 ||
					len([]rune(option.Description)) > 300 ||
					values[option.Value] || option.Capacity < 0 || option.Capacity > 1000000 {
					return errors.New("选项或选项名额不合法")
				}
				values[option.Value] = true
			}
		default:
			return errors.New("字段类型不支持")
		}
	}
	return nil
}

func validateCollectionAnswers(fields []model.CollectionField, raw map[string]any) (map[string]any, error) {
	if raw == nil || len(raw) > len(fields) {
		return nil, errors.New("填写内容不合法")
	}
	result := make(map[string]any, len(fields))
	for _, field := range fields {
		value, exists := raw[field.Key]
		if !exists || value == nil || value == "" {
			if field.Required {
				return nil, fmt.Errorf("请填写%s", field.Label)
			}
			continue
		}
		switch field.Type {
		case "text", "textarea", "date":
			s, ok := value.(string)
			if !ok || len([]rune(s)) > 5000 || (field.Type != "textarea" && len([]rune(s)) > 500) {
				return nil, fmt.Errorf("%s填写内容不合法", field.Label)
			}
			s = strings.TrimSpace(s)
			if s == "" {
				if field.Required {
					return nil, fmt.Errorf("请填写%s", field.Label)
				}
				continue
			}
			if field.Type == "date" {
				if _, err := time.Parse("2006-01-02", s); err != nil {
					return nil, fmt.Errorf("%s日期格式不合法", field.Label)
				}
			}
			result[field.Key] = s
		case "number":
			n, ok := value.(float64)
			if !ok || n != n || n > 1e12 || n < -1e12 {
				return nil, fmt.Errorf("%s须填写有效数字", field.Label)
			}
			result[field.Key] = n
		case "radio", "select":
			s, ok := value.(string)
			if !ok || !collectionOptionExists(field.Options, s) {
				return nil, fmt.Errorf("%s选项无效", field.Label)
			}
			result[field.Key] = s
		case "checkbox":
			items, ok := value.([]any)
			if !ok || len(items) > len(field.Options) || (field.Required && len(items) == 0) {
				return nil, fmt.Errorf("%s选项无效", field.Label)
			}
			seen := map[string]bool{}
			selected := make([]string, 0, len(items))
			for _, item := range items {
				s, ok := item.(string)
				if !ok || seen[s] || !collectionOptionExists(field.Options, s) {
					return nil, fmt.Errorf("%s选项无效", field.Label)
				}
				seen[s] = true
				selected = append(selected, s)
			}
			result[field.Key] = selected
		}
	}
	return result, nil
}

func collectionOptionExists(options []model.CollectionOption, value string) bool {
	for _, option := range options {
		if option.Value == value {
			return true
		}
	}
	return false
}

// Each selected checkbox value consumes one seat; radio and select consume
// one seat for their sole selected value.
func collectionOptionUsed(db *gorm.DB, formID uint64, field model.CollectionField, value string) (int64, error) {
	query := db.Model(&model.CollectionSubmission{}).Where("form_id = ?", formID)
	path := "$." + field.Key
	if field.Type == "checkbox" {
		query = query.Where("JSON_CONTAINS(JSON_EXTRACT(answers, ?), JSON_QUOTE(?)) = 1", path, value)
	} else {
		query = query.Where("JSON_UNQUOTE(JSON_EXTRACT(answers, ?)) = ?", path, value)
	}
	var used int64
	err := query.Count(&used).Error
	return used, err
}

func (h *CollectionFormHandler) owned(c *gin.Context) (*model.CollectionForm, bool) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "表单 ID 无效")
		return nil, false
	}
	var form model.CollectionForm
	if err := h.db.First(&form, id).Error; err != nil {
		writeAPIError(c, http.StatusNotFound, "表单不存在")
		return nil, false
	}
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || (form.CreatorID != user.ID && user.Role.Name != model.RoleNameSuperAdmin) {
		writeAPIError(c, http.StatusForbidden, "无权管理此表单")
		return nil, false
	}
	return &form, true
}

func (h *CollectionFormHandler) List(c *gin.Context) {
	user, _ := middleware.CurrentSessionUser(c)
	query := h.db.Model(&model.CollectionForm{})
	if user.Role.Name != model.RoleNameSuperAdmin {
		query = query.Where("creator_id = ?", user.ID)
	}
	var forms []model.CollectionForm
	if err := query.Order("id desc").Limit(200).Find(&forms).Error; err != nil {
		writeAPIError(c, 500, "读取表单失败")
		return
	}
	type item struct {
		model.CollectionForm
		Count int64 `json:"count"`
	}
	items := make([]item, 0, len(forms))
	for _, form := range forms {
		var count int64
		if err := h.db.Model(&model.CollectionSubmission{}).Where("form_id = ?", form.ID).Count(&count).Error; err != nil {
			writeAPIError(c, 500, "读取提交数量失败")
			return
		}
		items = append(items, item{form, count})
	}
	writeAPI(c, 200, "获取成功", gin.H{"items": items})
}

func (h *CollectionFormHandler) Create(c *gin.Context) {
	var input collectionFormInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, 400, "表单参数不合法")
		return
	}
	if input.Status == "" {
		input.Status = "draft"
	}
	if err := validateCollectionForm(input); err != nil {
		writeAPIError(c, 400, err.Error())
		return
	}
	user, _ := middleware.CurrentSessionUser(c)
	form := model.CollectionForm{
		CreatorID: user.ID, Title: strings.TrimSpace(input.Title), Description: strings.TrimSpace(input.Description),
		Fields: input.Fields, Status: input.Status, LoginRequired: input.LoginRequired == nil || *input.LoginRequired,
		Capacity: input.Capacity, OpensAt: input.OpensAt, ClosesAt: input.ClosesAt,
	}
	if err := h.db.Create(&form).Error; err != nil {
		writeAPIError(c, 500, "创建失败")
		return
	}
	writeAPI(c, 200, "创建成功", form)
}

func (h *CollectionFormHandler) Delete(c *gin.Context) {
	form, ok := h.owned(c)
	if !ok {
		return
	}
	// Only unused drafts are deletable. Published forms and their submissions
	// must not be removed through this shortcut.
	result := h.db.Where("id = ? AND status = ?", form.ID, "draft").Delete(&model.CollectionForm{})
	if result.Error != nil {
		writeAPIError(c, 500, "删除失败")
		return
	}
	if result.RowsAffected == 0 {
		writeAPIError(c, 409, "只能删除未发布的草稿")
		return
	}
	writeAPI(c, 200, "删除成功", gin.H{"deleted": true})
}

func (h *CollectionFormHandler) GetAdmin(c *gin.Context) {
	form, ok := h.owned(c)
	if !ok {
		return
	}
	var count int64
	if err := h.db.Model(&model.CollectionSubmission{}).Where("form_id = ?", form.ID).Count(&count).Error; err != nil {
		writeAPIError(c, 500, "读取失败")
		return
	}
	usage := make(map[string]map[string]int64)
	for _, field := range form.Fields {
		if field.Type != "radio" && field.Type != "select" && field.Type != "checkbox" {
			continue
		}
		usage[field.Key] = make(map[string]int64, len(field.Options))
		for _, option := range field.Options {
			used, err := collectionOptionUsed(h.db, form.ID, field, option.Value)
			if err != nil {
				writeAPIError(c, 500, "读取选项统计失败")
				return
			}
			usage[field.Key][option.Value] = used
		}
	}
	writeAPI(c, 200, "获取成功", gin.H{"form": form, "count": count, "usage": usage})
}

func (h *CollectionFormHandler) Update(c *gin.Context) {
	form, ok := h.owned(c)
	if !ok {
		return
	}
	var input collectionFormInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, 400, "表单参数不合法")
		return
	}
	if err := validateCollectionForm(input); err != nil {
		writeAPIError(c, 400, err.Error())
		return
	}
	// Editing and submission lock the same form row, preventing a schema change
	// between a submission's quota check and its insert.
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var current model.CollectionForm
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, form.ID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&model.CollectionSubmission{}).Where("form_id = ?", form.ID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 && (!sameCollectionFields(current.Fields, input.Fields) ||
			(input.LoginRequired != nil && current.LoginRequired != *input.LoginRequired) ||
			input.Status == "draft") {
			return rejectCollection(409, "已有提交记录，不能修改字段或填写方式")
		}
		fieldsJSON, err := json.Marshal(input.Fields)
		if err != nil {
			return err
		}
		updates := map[string]any{
			"title": strings.TrimSpace(input.Title), "description": strings.TrimSpace(input.Description),
			"fields": string(fieldsJSON), "status": input.Status, "capacity": input.Capacity,
			"opens_at": input.OpensAt, "closes_at": input.ClosesAt,
		}
		if input.LoginRequired != nil {
			updates["login_required"] = *input.LoginRequired
		}
		return tx.Model(&current).Updates(updates).Error
	})
	if err != nil {
		var rejected *collectionSubmitError
		if errors.As(err, &rejected) {
			writeAPIError(c, rejected.status, rejected.text)
			return
		}
		writeAPIError(c, 500, "保存失败")
		return
	}
	writeAPI(c, 200, "保存成功", gin.H{"id": form.ID})
}

func sameCollectionFields(a, b []model.CollectionField) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Key != b[i].Key || a[i].Label != b[i].Label || a[i].Type != b[i].Type || a[i].Required != b[i].Required ||
			len(a[i].Options) != len(b[i].Options) {
			return false
		}
		for j := range a[i].Options {
			if a[i].Options[j].Label != b[i].Options[j].Label || a[i].Options[j].Value != b[i].Options[j].Value {
				return false
			}
		}
	}
	return true
}

// The account profile is the only source of participant details; submissions
// retain just user_id. This also honors the legacy profile fallback.
func collectionParticipant(db *gorm.DB, user model.User) (*model.CollectionParticipant, bool, error) {
	profile, err := accountprofile.Resolve(db, user, time.Now())
	if err != nil {
		return nil, false, err
	}
	return &model.CollectionParticipant{
		UserID: user.ID, RealName: profile.RealName,
		College: profile.College, StudentID: profile.StudentID,
	}, profile.Complete(), nil
}

func (h *CollectionFormHandler) attachCollectionParticipants(items []model.CollectionSubmission) error {
	ids := make([]uint64, 0, len(items))
	seen := make(map[uint64]bool)
	for _, item := range items {
		if item.UserID != nil && !seen[*item.UserID] {
			ids = append(ids, *item.UserID)
			seen[*item.UserID] = true
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var users []model.User
	if err := h.db.Where("id IN ?", ids).Find(&users).Error; err != nil {
		return err
	}
	participants := make(map[uint64]*model.CollectionParticipant, len(users))
	for _, user := range users {
		profile, _, err := collectionParticipant(h.db, user)
		if err != nil {
			return err
		}
		participants[user.ID] = profile
	}
	for i := range items {
		if items[i].UserID != nil {
			items[i].Participant = participants[*items[i].UserID]
		}
	}
	return nil
}

func (h *CollectionFormHandler) GetPublic(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, 404, "表单不存在")
		return
	}
	var form model.CollectionForm
	if err := h.db.Where("id = ? AND status <> 'draft'", id).First(&form).Error; err != nil {
		writeAPIError(c, 404, "表单不存在")
		return
	}
	var viewer any
	if form.LoginRequired {
		member, ok := middleware.CurrentSessionUser(c)
		if !ok || member == nil {
			writeAPIError(c, 401, "请先登录后填写")
			return
		}
		if !member.WorkbenchAccess {
			writeAPIError(c, 403, "仅队伍成员可填写")
			return
		}
		var account model.User
		if err := h.db.First(&account, member.ID).Error; err != nil {
			writeAPIError(c, 500, "读取个人资料失败")
			return
		}
		profile, complete, err := collectionParticipant(h.db, account)
		if err != nil {
			writeAPIError(c, 500, "读取个人资料失败")
			return
		}
		var submitted int64
		if err := h.db.Model(&model.CollectionSubmission{}).
			Where("form_id = ? AND user_id = ?", form.ID, member.ID).Count(&submitted).Error; err != nil {
			writeAPIError(c, 500, "读取提交状态失败")
			return
		}
		viewer = gin.H{"participant": profile, "profileComplete": complete, "submitted": submitted > 0}
	}
	var count int64
	if err := h.db.Model(&model.CollectionSubmission{}).Where("form_id = ?", form.ID).Count(&count).Error; err != nil {
		writeAPIError(c, 500, "读取失败")
		return
	}
	for i := range form.Fields {
		for j := range form.Fields[i].Options {
			option := &form.Fields[i].Options[j]
			if option.Capacity == 0 {
				continue
			}
			used, err := collectionOptionUsed(h.db, form.ID, form.Fields[i], option.Value)
			if err != nil {
				writeAPIError(c, 500, "读取名额失败")
				return
			}
			remaining := max(0, option.Capacity-int(used))
			option.Remaining = &remaining
		}
	}
	remaining := -1
	if form.Capacity > 0 {
		remaining = max(0, form.Capacity-int(count))
	}
	writeAPI(c, 200, "获取成功", gin.H{"form": form, "count": count, "remaining": remaining, "viewer": viewer})
}

type collectionSubmitError struct {
	status int
	text   string
}

func (e *collectionSubmitError) Error() string { return e.text }
func rejectCollection(status int, message string) error {
	return &collectionSubmitError{status, message}
}

func (h *CollectionFormHandler) Submit(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, 404, "表单不存在")
		return
	}
	var body struct {
		Answers map[string]any `json:"answers"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeAPIError(c, 400, "填写内容不合法")
		return
	}
	user, authenticated := middleware.CurrentSessionUser(c)
	var userID *uint64
	if authenticated && user != nil {
		userID = &user.ID
	}
	err = h.db.Transaction(func(tx *gorm.DB) error {
		var form model.CollectionForm
		// Every submit for a form serializes on this row before checking totals
		// and option quotas; no extra counter state can drift.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&form, id).Error; err != nil {
			return rejectCollection(404, "表单不存在")
		}
		now := time.Now()
		if form.Status != "published" || (form.OpensAt != nil && now.Before(*form.OpensAt)) || (form.ClosesAt != nil && !now.Before(*form.ClosesAt)) {
			return rejectCollection(409, "表单未开放或已截止")
		}
		if form.LoginRequired {
			if userID == nil {
				return rejectCollection(401, "请先登录后填写")
			}
			if !user.WorkbenchAccess {
				return rejectCollection(403, "仅队伍成员可填写")
			}
			var account model.User
			if err := tx.First(&account, *userID).Error; err != nil {
				return err
			}
			_, complete, err := collectionParticipant(tx, account)
			if err != nil {
				return err
			}
			if !complete {
				return rejectCollection(409, "请先完善个人资料")
			}
		}
		answers, err := validateCollectionAnswers(form.Fields, body.Answers)
		if err != nil {
			return rejectCollection(400, err.Error())
		}
		var count int64
		if err := tx.Model(&model.CollectionSubmission{}).Where("form_id = ?", id).Count(&count).Error; err != nil {
			return err
		}
		if form.Capacity > 0 && count >= int64(form.Capacity) {
			return rejectCollection(409, "表单名额已满")
		}
		if userID != nil {
			var used int64
			if err := tx.Model(&model.CollectionSubmission{}).Where("form_id = ? AND user_id = ?", id, *userID).Count(&used).Error; err != nil {
				return err
			}
			if used > 0 {
				return rejectCollection(409, "你已经提交过此表单")
			}
		}
		for _, field := range form.Fields {
			if field.Type != "radio" && field.Type != "select" && field.Type != "checkbox" {
				continue
			}
			selected := make(map[string]bool)
			switch value := answers[field.Key].(type) {
			case string:
				selected[value] = true
			case []string:
				for _, item := range value {
					selected[item] = true
				}
			}
			for _, option := range field.Options {
				if !selected[option.Value] || option.Capacity == 0 {
					continue
				}
				used, err := collectionOptionUsed(tx, id, field, option.Value)
				if err != nil {
					return err
				}
				if used >= int64(option.Capacity) {
					return rejectCollection(409, field.Label+"："+option.Label+"已满")
				}
			}
		}
		return tx.Create(&model.CollectionSubmission{FormID: id, UserID: userID, Answers: answers, CreatedAt: now}).Error
	})
	if err != nil {
		var rejected *collectionSubmitError
		if errors.As(err, &rejected) {
			writeAPIError(c, rejected.status, rejected.text)
			return
		}
		var mysqlErr *mysql.MySQLError
		if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
			writeAPIError(c, 409, "你已经提交过此表单")
			return
		}
		writeAPIError(c, 500, "提交失败")
		return
	}
	writeAPI(c, 200, "提交成功", gin.H{"submitted": true})
}

func (h *CollectionFormHandler) Submissions(c *gin.Context) {
	form, ok := h.owned(c)
	if !ok {
		return
	}
	var items []model.CollectionSubmission
	if err := h.db.Where("form_id = ?", form.ID).Order("id desc").Limit(1000).Find(&items).Error; err != nil {
		writeAPIError(c, 500, "读取提交记录失败")
		return
	}
	if err := h.attachCollectionParticipants(items); err != nil {
		writeAPIError(c, 500, "读取成员资料失败")
		return
	}
	writeAPI(c, 200, "获取成功", gin.H{"items": items})
}

func (h *CollectionFormHandler) DeleteSubmission(c *gin.Context) {
	form, ok := h.owned(c)
	if !ok {
		return
	}
	id, err := parsePathID(c.Param("submissionId"))
	if err != nil {
		writeAPIError(c, 400, "记录 ID 无效")
		return
	}
	result := h.db.Where("form_id = ? AND id = ?", form.ID, id).Delete(&model.CollectionSubmission{})
	if result.Error != nil {
		writeAPIError(c, 500, "删除失败")
		return
	}
	if result.RowsAffected == 0 {
		writeAPIError(c, 404, "记录不存在")
		return
	}
	writeAPI(c, 200, "删除成功", gin.H{"deleted": true})
}

func collectionExportValue(field model.CollectionField, value string) string {
	if field.Type == "radio" || field.Type == "select" || field.Type == "checkbox" {
		for _, option := range field.Options {
			if option.Value == value {
				return option.Label
			}
		}
	}
	return value
}

func (h *CollectionFormHandler) Export(c *gin.Context) {
	form, ok := h.owned(c)
	if !ok {
		return
	}
	var submissions []model.CollectionSubmission
	if err := h.db.Where("form_id = ?", form.ID).Order("id asc").Find(&submissions).Error; err != nil {
		writeAPIError(c, 500, "导出失败")
		return
	}
	if err := h.attachCollectionParticipants(submissions); err != nil {
		writeAPIError(c, 500, "读取成员资料失败")
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=collection-%d.csv", form.ID))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Status(http.StatusOK)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(c.Writer)
	header := []string{"提交编号", "提交时间", "成员姓名", "学院", "学号"}
	for _, field := range form.Fields {
		header = append(header, field.Label)
	}
	_ = writer.Write(header)
	for _, item := range submissions {
		row := []string{strconv.FormatUint(item.ID, 10), item.CreatedAt.Format("2006-01-02 15:04:05")}
		if item.Participant == nil {
			row = append(row, "", "", "")
		} else {
			row = append(row, salonCSVCell(item.Participant.RealName),
				salonCSVCell(item.Participant.College), salonCSVCell(item.Participant.StudentID))
		}
		for _, field := range form.Fields {
			raw := item.Answers[field.Key]
			value := ""
			switch v := raw.(type) {
			case string:
				value = collectionExportValue(field, v)
			case []any:
				parts := make([]string, 0, len(v))
				for _, element := range v {
					parts = append(parts, collectionExportValue(field, fmt.Sprint(element)))
				}
				value = strings.Join(parts, "、")
			case []string:
				parts := make([]string, 0, len(v))
				for _, item := range v {
					parts = append(parts, collectionExportValue(field, item))
				}
				value = strings.Join(parts, "、")
			case nil:
			default:
				value = fmt.Sprint(v)
			}
			row = append(row, salonCSVCell(value))
		}
		_ = writer.Write(row)
	}
	writer.Flush()
}
