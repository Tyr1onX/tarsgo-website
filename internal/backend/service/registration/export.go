package registration

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"tarsgo-backend/model"
	"time"
)

func (s *RegistrationService) ExportFormRegistrationsCSV(ctx context.Context, actor RegistrationFormActor, formID uint64, baseURL string) (*RegistrationCSVExportResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationSuperAdminActor(actor)); err != nil {
		return nil, err
	}
	if formID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名表 ID 不合法"}
	}

	form, err := s.repo.GetFormByID(ctx, formID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名表不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名表失败", Err: err}
	}

	groups, err := s.repo.ListShownUserGroups(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
	}

	filter := ListRegistrationsInput{
		FormID: ptrUint64(formID),
	}

	registrations, err := s.repo.ListRegistrationsForExport(ctx, filter)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名导出数据失败", Err: err}
	}

	exportForm := *form
	exportForm.FieldsSchema = hydrateRegistrationExportFields(registrationExportFields(form.FieldsSchema, registrations), groups)

	content, err := buildRegistrationExportCSV(&exportForm, registrations, baseURL)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "生成报名导出文件失败", Err: err}
	}

	return &RegistrationCSVExportResult{
		FileName: fmt.Sprintf("registration-form-%d-registrations.csv", formID),
		Content:  content,
	}, nil
}

func buildRegistrationExportCSV(form *model.RegistrationForm, registrations []model.Registration, baseURL string) ([]byte, error) {
	fields := cloneRegistrationFields(form.FieldsSchema)
	extraKeys := collectRegistrationExportExtraKeys(fields, registrations)
	headers := append([]string{}, registrationExportPrefixHeaders...)
	for _, field := range fields {
		headers = append(headers, field.Label)
	}
	headers = append(headers, registrationExportSuffixHeaders...)
	headers = append(headers, extraKeys...)

	buffer := &bytes.Buffer{}
	buffer.WriteString("\uFEFF")

	writer := csv.NewWriter(buffer)
	writer.UseCRLF = true
	if err := writer.Write(headers); err != nil {
		return nil, err
	}

	formTitle := strings.TrimSpace(form.Title)
	for index := range registrations {
		row := buildRegistrationExportCSVRow(formTitle, fields, extraKeys, &registrations[index], baseURL)
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func registrationExportFields(fields []model.FormField, _ []model.Registration) []model.FormField {
	return mergeLockedRegistrationFields(fields)
}

var registrationExportPrefixHeaders = []string{
	"报名记录ID",
	"报名表ID",
	"报名表标题",
}

var registrationExportSuffixHeaders = []string{
	"当前状态",
	"初筛人",
	"初筛时间",
	"初筛备注",
	"面试人",
	"面试时间",
	"面试结果 / 最终结果",
	"面试备注",
	"提交时间",
}

func buildRegistrationExportCSVRow(formTitle string, fields []model.FormField, extraKeys []string, registration *model.Registration, baseURL string) []string {
	row := []string{
		registrationExportCell(strconv.FormatUint(registration.ID, 10)),
		registrationExportCell(strconv.FormatUint(registration.FormID, 10)),
		registrationExportCell(registrationExportFormTitle(registration, formTitle)),
	}

	for _, field := range fields {
		row = append(row, registrationExportCell(formatRegistrationExportFieldValue(registration, field, registration.FormData[field.Key], baseURL)))
	}
	row = append(row,
		registrationExportCell(recruitmentStatusLabel(registration.RecruitmentStatus)),
		registrationExportCell(registrationExportReviewerName(registration.Screener)),
		registrationExportCell(formatRegistrationExportTime(registration.ScreenedAt)),
		registrationExportCell(registrationExportOptionalString(registration.ScreeningRemark)),
		registrationExportCell(registrationExportReviewerName(registration.Interviewer)),
		registrationExportCell(formatRegistrationExportTime(registration.InterviewedAt)),
		registrationExportCell(recruitmentOutcomeLabel(registration)),
		registrationExportCell(registrationExportOptionalString(registration.InterviewRemark)),
		registrationExportCell(formatRegistrationExportTimeValue(registration.SubmittedAt)),
	)
	for _, key := range extraKeys {
		row = append(row, registrationExportCell(formatRegistrationExportValue(registration.FormData[key], baseURL)))
	}
	return row
}

func hydrateRegistrationExportFields(fields []model.FormField, groups []model.UserGroup) []model.FormField {
	result := cloneRegistrationFields(fields)
	options := buildVisibleUserGroupOptions(groups)
	for index := range result {
		if result[index].Type != "user_group_select" {
			continue
		}
		result[index].Options = append([]model.FormFieldOption(nil), options...)
	}
	return result
}

func collectRegistrationExportExtraKeys(fields []model.FormField, registrations []model.Registration) []string {
	if len(registrations) == 0 {
		return nil
	}

	fieldKeys := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		fieldKeys[field.Key] = struct{}{}
	}

	extraKeys := make(map[string]struct{})
	for _, registration := range registrations {
		for key := range registration.FormData {
			if _, exists := fieldKeys[key]; exists {
				continue
			}
			if _, legacy := legacyRegistrationGroupFieldKeys[key]; legacy {
				continue
			}
			extraKeys[key] = struct{}{}
		}
	}

	result := make([]string, 0, len(extraKeys))
	for key := range extraKeys {
		result = append(result, key)
	}
	sort.Strings(result)
	return result
}

func registrationExportFormTitle(registration *model.Registration, fallback string) string {
	if registration != nil {
		title := strings.TrimSpace(registration.Form.Title)
		if title != "" {
			return title
		}
	}
	return strings.TrimSpace(fallback)
}

func recruitmentStatusLabel(status string) string {
	switch status {
	case model.RecruitmentStatusPendingScreening:
		return "待初筛"
	case model.RecruitmentStatusPendingInterview:
		return "待面试"
	case model.RecruitmentStatusAdmitted:
		return "已录取"
	case model.RecruitmentStatusRejected:
		return "未通过"
	case model.RecruitmentStatusWithdrawn:
		return "已撤回"
	default:
		return strings.TrimSpace(status)
	}
}

func recruitmentOutcomeLabel(registration *model.Registration) string {
	if registration == nil {
		return ""
	}
	switch registration.RecruitmentStatus {
	case model.RecruitmentStatusAdmitted:
		return "面试通过并录取"
	case model.RecruitmentStatusRejected:
		if valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageScreening {
			return "初筛未通过"
		}
		if valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageInterview {
			return "面试未通过"
		}
		return "未通过"
	default:
		return ""
	}
}

func registrationExportReviewerName(user *model.User) string {
	if user == nil {
		return ""
	}
	if user.RealName != nil && strings.TrimSpace(*user.RealName) != "" {
		return strings.TrimSpace(*user.RealName)
	}
	return "姓名待核实"
}

func registrationExportOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func formatRegistrationExportTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return formatRegistrationExportTimeValue(*value)
}

func formatRegistrationExportTimeValue(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.In(time.Local).Format("2006-01-02 15:04:05")
}

func formatRegistrationExportFieldValue(registration *model.Registration, field model.FormField, value any, baseURL string) string {
	if field.Key == "preferred_group" && registration != nil && registration.PreferredGroup != nil {
		return registration.PreferredGroup.Name
	}
	switch field.Type {
	case "select", "radio", "user_group_select":
		return registrationExportOptionLabel(field.Options, valueAsString(value))
	case "checkbox":
		return strings.Join(registrationExportOptionLabels(field.Options, registrationExportStringSlice(value)), "；")
	case "file":
		texts := registrationExportStoredFiles(registration, field, value, baseURL)
		return strings.Join(texts, "；")
	case "image":
		texts := registrationExportStoredFiles(registration, field, value, baseURL)
		return strings.Join(texts, "；")
	default:
		return formatRegistrationExportValue(value, baseURL)
	}
}

func registrationExportOptionLabel(options []model.FormFieldOption, value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	for _, option := range options {
		if option.Value == trimmed {
			return option.Label
		}
	}
	return trimmed
}

func registrationExportOptionLabels(options []model.FormFieldOption, values []string) []string {
	if len(values) == 0 {
		return nil
	}
	labels := make([]string, 0, len(values))
	for _, value := range values {
		label := registrationExportOptionLabel(options, value)
		if strings.TrimSpace(label) == "" {
			continue
		}
		labels = append(labels, label)
	}
	return labels
}

func registrationExportStoredFiles(registration *model.Registration, field model.FormField, value any, baseURL string) []string {
	if registration == nil {
		return nil
	}

	switch typed := value.(type) {
	case map[string]any:
		text, ok := registrationExportStoredFileText(registration.ID, field.Key, 0, typed, baseURL)
		if !ok {
			return nil
		}
		return []string{text}
	case []map[string]any:
		texts := make([]string, 0, len(typed))
		for index, item := range typed {
			text, ok := registrationExportStoredFileText(registration.ID, field.Key, index, item, baseURL)
			if !ok {
				continue
			}
			texts = append(texts, text)
		}
		return texts
	case []any:
		texts := make([]string, 0, len(typed))
		for index, item := range typed {
			fileItem, ok := item.(map[string]any)
			if !ok {
				continue
			}
			text, exists := registrationExportStoredFileText(registration.ID, field.Key, index, fileItem, baseURL)
			if !exists {
				continue
			}
			texts = append(texts, text)
		}
		return texts
	default:
		return nil
	}
}

func registrationExportStoredFileText(registrationID uint64, fieldKey string, index int, value map[string]any, baseURL string) (string, bool) {
	fileName, _ := value["file_name"].(string)
	fileURL, _ := value["file_url"].(string)
	if stored, ok := registrationStoredFileFromAny(value); ok {
		fileName = stored.FileName
		fileURL = registrationExportAbsoluteURL(baseURL, fmt.Sprintf("/api/admin/registrations/%d/files/%s/%d", registrationID, fieldKey, index))
	}

	fileName = strings.TrimSpace(fileName)
	fileURL = registrationExportAbsoluteURL(baseURL, fileURL)
	if fileName == "" && fileURL == "" {
		return "", false
	}
	if fileName == "" {
		return fileURL, true
	}
	if fileURL == "" {
		return fileName, true
	}
	return fmt.Sprintf("%s: %s", fileName, fileURL), true
}

func formatRegistrationExportValue(value any, baseURL string) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []string:
		return strings.Join(registrationExportTrimmedStrings(typed), "；")
	case []any:
		fileTexts := registrationExportLooseFileTexts(typed, baseURL)
		if len(fileTexts) > 0 {
			return strings.Join(fileTexts, "；")
		}
		stringValues := registrationExportStringSlice(typed)
		if len(stringValues) > 0 {
			return strings.Join(stringValues, "；")
		}
		return registrationExportJSONString(typed)
	case []map[string]any:
		fileTexts := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := registrationExportLooseFileText(item, baseURL)
			if !ok {
				return registrationExportJSONString(typed)
			}
			fileTexts = append(fileTexts, text)
		}
		return strings.Join(fileTexts, "；")
	case map[string]any:
		if text, ok := registrationExportLooseFileText(typed, baseURL); ok {
			return text
		}
		return registrationExportJSONString(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func registrationExportLooseFileTexts(values []any, baseURL string) []string {
	texts := make([]string, 0, len(values))
	for _, value := range values {
		item, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		text, exists := registrationExportLooseFileText(item, baseURL)
		if !exists {
			return nil
		}
		texts = append(texts, text)
	}
	return texts
}

func registrationExportLooseFileText(value map[string]any, baseURL string) (string, bool) {
	fileName, _ := value["file_name"].(string)
	fileURL, _ := value["file_url"].(string)
	fileName = strings.TrimSpace(fileName)
	fileURL = registrationExportAbsoluteURL(baseURL, fileURL)
	if fileName == "" && fileURL == "" {
		return "", false
	}
	if fileName == "" {
		return fileURL, true
	}
	if fileURL == "" {
		return fileName, true
	}
	return fmt.Sprintf("%s: %s", fileName, fileURL), true
}

func registrationExportJSONString(value any) string {
	bytes, err := json.Marshal(value)
	if err != nil {
		return strings.TrimSpace(fmt.Sprint(value))
	}
	return string(bytes)
}

func registrationExportStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return registrationExportTrimmedStrings(typed)
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			switch item.(type) {
			case map[string]any, []any, []map[string]any:
				return nil
			}
			text := strings.TrimSpace(fmt.Sprint(item))
			if text == "" {
				continue
			}
			values = append(values, text)
		}
		return values
	default:
		return nil
	}
}

func registrationExportTrimmedStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func registrationExportCell(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	dangerous := strings.TrimLeft(trimmed, " \t\r\n")
	if dangerous != "" {
		switch dangerous[0] {
		case '=', '+', '-', '@':
			return "'" + trimmed
		}
	}
	return trimmed
}

func registrationExportAbsoluteURL(baseURL string, rawPath string) string {
	path := strings.TrimSpace(rawPath)
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}

	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return path
	}
	if strings.HasPrefix(path, "/") {
		return base + path
	}
	return base + "/" + path
}
