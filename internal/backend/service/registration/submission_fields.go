package registration

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"mime/multipart"
	"net/http"
	"net/mail"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"tarsgo-backend/model"
	"time"
)

func normalizeRegistrationSubmission(fields []model.FormField, input SubmitRegistrationInput, existingFormData map[string]any) (*normalizedRegistrationSubmission, error) {
	formData := make(map[string]any, len(fields)+2)
	for legacyKey := range legacyRegistrationGroupFieldKeys {
		if value, ok := existingFormData[legacyKey]; ok {
			formData[legacyKey] = cloneDynamicValue(value)
		}
	}
	uploads := make([]registrationUploadField, 0)

	for _, field := range fields {
		switch field.Type {
		case "text", "textarea":
			value, ok, err := normalizeRequiredSingleValue(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "number":
			value, ok, err := normalizeSubmittedNumber(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "select", "radio":
			value, ok, err := normalizeSubmittedSingleOption(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "checkbox":
			value, ok, err := normalizeSubmittedMultiOptions(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "date":
			value, ok, err := normalizeSubmittedDate(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "phone":
			value, ok, err := normalizeSubmittedPhone(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "email":
			value, ok, err := normalizeSubmittedEmail(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "user_group_select":
			value, _, ok, err := normalizeSubmittedUserGroup(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "file", "image":
			files, preserveExisting, err := normalizeSubmittedFiles(field, input.Files[field.Key], existingFormData[field.Key])
			if err != nil {
				return nil, err
			}
			if len(files) > 0 {
				uploads = append(uploads, registrationUploadField{
					Field: field,
					Files: files,
				})
				continue
			}
			if preserveExisting {
				formData[field.Key] = cloneDynamicValue(existingFormData[field.Key])
			}
		default:
			return nil, &ServiceError{Status: http.StatusBadRequest, Message: "存在未支持的报名字段类型"}
		}
		if value, exists := formData[field.Key]; exists {
			if err := validateRegistrationFieldValue(field, value); err != nil {
				return nil, err
			}
		}
	}

	contactName := valueAsOptionalString(formData["name"])
	contactPhone := valueAsOptionalString(formData["phone"])
	contactEmail := valueAsOptionalString(formData["email"])
	preferredGroupID, _ := parseOptionalUint64String(valueAsString(formData["preferred_group"]))
	if preferredGroupID == nil {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "意向组为必填项"}
	}

	return &normalizedRegistrationSubmission{
		FormData:         formData,
		Uploads:          uploads,
		ContactName:      contactName,
		ContactPhone:     contactPhone,
		ContactEmail:     contactEmail,
		PreferredGroupID: preferredGroupID,
	}, nil
}

// validateRegistrationFieldValue enforces the field validation contract on the server.
// Invalid validation configuration is ignored; submitted values are always validated.
func validateRegistrationFieldValue(field model.FormField, value any) error {
	v := field.Validation
	if len(v) == 0 || value == nil {
		return nil
	}
	label := field.Label
	if label == "" {
		label = field.Key
	}
	if max, ok := validationInt(v["max_length"]); ok {
		if str, ok := value.(string); ok && len([]rune(str)) > max {
			return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 长度不能超过 %d", label, max)}
		}
	}
	if pattern, ok := v["pattern"].(string); ok && strings.TrimSpace(pattern) != "" {
		if str, ok := value.(string); ok {
			re, err := regexp.Compile(pattern)
			if err == nil && !re.MatchString(str) {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 格式不符合要求", label)}
			}
		}
	}
	if field.Type == "number" {
		n, ok := numericValue(value)
		if ok {
			if min, exists := validationFloat(v["min"]); exists && n < min {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 不能小于 %v", label, min)}
			}
			if max, exists := validationFloat(v["max"]); exists && n > max {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 不能大于 %v", label, max)}
			}
			if places, exists := validationInt(v["decimal_places"]); exists && places >= 0 {
				text := strconv.FormatFloat(n, 'f', -1, 64)
				if dot := strings.IndexByte(text, '.'); dot >= 0 && len(text)-dot-1 > places {
					return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 小数位数不能超过 %d", label, places)}
				}
			}
		}
	}
	if field.Type == "date" {
		if str, ok := value.(string); ok {
			if min, ok := v["min_date"].(string); ok && min != "" && str < min {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 日期不能早于 %s", label, min)}
			}
			if max, ok := v["max_date"].(string); ok && max != "" && str > max {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 日期不能晚于 %s", label, max)}
			}
		}
	}
	return nil
}

func validationFloat(value any) (float64, bool) {
	switch x := value.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case json.Number:
		n, err := x.Float64()
		return n, err == nil
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func validationInt(value any) (int, bool) {
	n, ok := validationFloat(value)
	return int(n), ok && n >= 0 && math.Trunc(n) == n
}
func numericValue(value any) (float64, bool) { return validationFloat(value) }

func normalizeRequiredSingleValue(field model.FormField, values []string) (string, bool, error) {
	value := firstTrimmedValue(values)
	if value == "" {
		if field.Required {
			return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
		}
		return "", false, nil
	}
	return value, true, nil
}

func normalizeSubmittedNumber(field model.FormField, values []string) (any, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return nil, ok, err
	}

	numberValue, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 必须为数字", field.Label)}
	}
	if places, exists := validationInt(field.Validation["decimal_places"]); exists {
		if dot := strings.IndexByte(value, '.'); dot >= 0 && len(strings.TrimRight(value[dot+1:], "0")) > places {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 小数位数不能超过 %d", field.Label, places)}
		}
	}

	if math.Trunc(numberValue) == numberValue {
		return int64(numberValue), true, nil
	}
	return numberValue, true, nil
}

func normalizeSubmittedSingleOption(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}
	if !registrationOptionAllowed(field.Options, value) {
		return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
	}
	return value, true, nil
}

func normalizeSubmittedMultiOptions(field model.FormField, values []string) ([]string, bool, error) {
	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))

	for _, raw := range values {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if !registrationOptionAllowed(field.Options, value) {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}

	if len(normalized) == 0 {
		if field.Required {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
		}
		return nil, false, nil
	}

	return normalized, true, nil
}

func normalizeSubmittedDate(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}

	layouts := []string{"2006-01-02", time.RFC3339, "2006-01-02 15:04:05"}
	for _, layout := range layouts {
		if parsed, parseErr := time.Parse(layout, value); parseErr == nil {
			return parsed.Format("2006-01-02"), true, nil
		}
		if parsed, parseErr := time.ParseInLocation(layout, value, time.Local); parseErr == nil {
			return parsed.Format("2006-01-02"), true, nil
		}
	}

	return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的日期格式不合法", field.Label)}
}

func normalizeSubmittedPhone(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}
	if !mainlandPhonePattern.MatchString(value) {
		return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的手机号格式不合法", field.Label)}
	}
	return value, true, nil
}

func normalizeSubmittedEmail(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}

	address, parseErr := mail.ParseAddress(value)
	if parseErr != nil || strings.TrimSpace(address.Address) == "" {
		return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的邮箱格式不合法", field.Label)}
	}

	return strings.TrimSpace(address.Address), true, nil
}

func normalizeSubmittedUserGroup(field model.FormField, values []string) (string, uint64, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", 0, ok, err
	}
	if !registrationOptionAllowed(field.Options, value) {
		return "", 0, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
	}

	groupID, parseErr := strconv.ParseUint(value, 10, 64)
	if parseErr != nil || groupID == 0 {
		return "", 0, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
	}
	return value, groupID, true, nil
}

func normalizeSubmittedFiles(field model.FormField, headers []*multipart.FileHeader, existingValue any) ([]*multipart.FileHeader, bool, error) {
	files := filterUploadHeaders(headers)
	if len(files) == 0 {
		if hasExistingRegistrationFiles(field, existingValue) {
			return nil, true, nil
		}
		if field.Required {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
		}
		return nil, false, nil
	}

	if field.Type == "file" && len(files) > 1 {
		return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 仅允许上传一个文件", field.Label)}
	}

	if field.Type == "image" {
		if maxCount, ok := parseRegistrationFileConfigPositiveInt(field.FileConfig, "max_count"); ok && len(files) > maxCount {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 上传图片数量超过限制", field.Label)}
		}
	}

	for _, fileHeader := range files {
		if err := validateRegistrationFileHeader(field, fileHeader); err != nil {
			return nil, false, err
		}
	}

	return files, false, nil
}

func hasExistingRegistrationFiles(field model.FormField, value any) bool {
	if value == nil {
		return false
	}
	if field.Type == "file" {
		_, ok := registrationStoredFileFromAny(value)
		return ok
	}

	items, ok := value.([]any)
	if ok {
		for _, item := range items {
			if _, exists := registrationStoredFileFromAny(item); exists {
				return true
			}
		}
		return false
	}

	mappedItems, ok := value.([]map[string]any)
	if ok {
		for _, item := range mappedItems {
			if _, exists := registrationStoredFileFromAny(item); exists {
				return true
			}
		}
	}
	return false
}

func validateRegistrationFileHeader(field model.FormField, fileHeader *multipart.FileHeader) error {
	if fileHeader == nil {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的上传文件不合法", field.Label)}
	}

	maxSize, hasMaxSize := parseRegistrationFileConfigPositiveInt(field.FileConfig, "max_size_mb")
	if hasMaxSize && fileHeader.Size > int64(maxSize)*1024*1024 {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的文件大小超过限制", field.Label)}
	}

	contentType := strings.TrimSpace(fileHeader.Header.Get("Content-Type"))
	if field.Type == "image" && !looksLikeImageUpload(fileHeader.Filename, contentType) {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 仅支持图片文件", field.Label)}
	}

	allowedTypes, hasAllowedTypes := parseRegistrationFileConfigStringList(field.FileConfig, "allowed_types")
	if hasAllowedTypes && !registrationUploadTypeAllowed(fileHeader.Filename, contentType, allowedTypes) {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的文件类型不被允许", field.Label)}
	}

	return nil
}

func parseRegistrationFileConfigPositiveInt(config map[string]any, key string) (int, bool) {
	if len(config) == 0 {
		return 0, false
	}
	value, ok := config[key]
	if !ok {
		return 0, false
	}
	parsed, err := parsePositiveIntAny(value)
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func parseRegistrationFileConfigStringList(config map[string]any, key string) ([]string, bool) {
	if len(config) == 0 {
		return nil, false
	}
	value, ok := config[key]
	if !ok {
		return nil, false
	}
	parsed, err := parseStringListAny(value)
	if err != nil || len(parsed) == 0 {
		return nil, false
	}
	return parsed, true
}

func registrationUploadTypeAllowed(fileName string, contentType string, allowedTypes []string) bool {
	extension := strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".")
	normalizedContentType := strings.ToLower(strings.TrimSpace(contentType))

	for _, allowedType := range allowedTypes {
		candidate := strings.ToLower(strings.TrimSpace(allowedType))
		candidate = strings.TrimPrefix(candidate, ".")
		if candidate == "" {
			continue
		}
		if extension != "" && candidate == extension {
			return true
		}
		if normalizedContentType != "" {
			if candidate == normalizedContentType {
				return true
			}
			if strings.HasSuffix(candidate, "/*") && strings.HasPrefix(normalizedContentType, strings.TrimSuffix(candidate, "*")) {
				return true
			}
		}
	}

	return false
}

func looksLikeImageUpload(fileName string, contentType string) bool {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "image/") {
		return true
	}

	switch strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".") {
	case "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg":
		return true
	default:
		return false
	}
}

func registrationOptionAllowed(options []model.FormFieldOption, value string) bool {
	for _, option := range options {
		if strings.TrimSpace(option.Value) == value {
			return true
		}
	}
	return false
}

func filterUploadHeaders(headers []*multipart.FileHeader) []*multipart.FileHeader {
	files := make([]*multipart.FileHeader, 0, len(headers))
	for _, header := range headers {
		if header == nil {
			continue
		}
		if strings.TrimSpace(header.Filename) == "" && header.Size == 0 {
			continue
		}
		files = append(files, header)
	}
	return files
}

func firstTrimmedValue(values []string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func valueAsOptionalString(value any) *string {
	text, ok := value.(string)
	if !ok {
		return nil
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func valueAsString(value any) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func parseOptionalUint64String(value string) (*uint64, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}

	parsed, err := strconv.ParseUint(trimmed, 10, 64)
	if err != nil || parsed == 0 {
		return nil, errors.New("invalid uint64 string")
	}
	result := parsed
	return &result, nil
}

func copyUint64Ptr(value *uint64) *uint64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func uint64Pointer(value uint64) *uint64 {
	return &value
}

func stringPointer(value string) *string {
	return &value
}

func timePointer(value time.Time) *time.Time {
	return &value
}

func sanitizeRegistrationFormData(formData map[string]any) map[string]any {
	if len(formData) == 0 {
		return map[string]any{}
	}

	sanitized := make(map[string]any, len(formData))
	for key, value := range formData {
		sanitized[key] = sanitizeRegistrationDataValue(value)
	}
	return sanitized
}

func sanitizeRegistrationDataValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		cloned := make(map[string]any, len(typed))
		for key, item := range typed {
			if key == "storage_path" || key == "content_type" {
				continue
			}
			cloned[key] = sanitizeRegistrationDataValue(item)
		}
		return cloned
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, sanitizeRegistrationDataValue(item))
		}
		return items
	case []map[string]any:
		items := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			sanitized, ok := sanitizeRegistrationDataValue(item).(map[string]any)
			if ok {
				items = append(items, sanitized)
			}
		}
		return items
	default:
		return cloneDynamicValue(typed)
	}
}

func findRegistrationField(fields []model.FormField, key string) (model.FormField, bool) {
	targetKey := strings.TrimSpace(key)
	for _, field := range fields {
		if field.Key == targetKey {
			return field, true
		}
	}
	return model.FormField{}, false
}

func extractRegistrationStoredFile(formData map[string]any, field model.FormField, index int) (*registrationStoredFileRef, error) {
	value, exists := formData[field.Key]
	if !exists {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	if field.Type == "file" {
		fileRef, ok := registrationStoredFileFromAny(value)
		if !ok {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		if index != 0 {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return fileRef, nil
	}

	if mappedItems, ok := value.([]map[string]any); ok {
		if index >= len(mappedItems) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		fileRef, exists := registrationStoredFileFromAny(mappedItems[index])
		if !exists {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return fileRef, nil
	}

	items, ok := value.([]any)
	if !ok {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}
	if index >= len(items) {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	fileRef, exists := registrationStoredFileFromAny(items[index])
	if !exists {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}
	return fileRef, nil
}

func registrationStoredFileFromAny(value any) (*registrationStoredFileRef, bool) {
	item, ok := value.(map[string]any)
	if !ok {
		return nil, false
	}

	path, _ := item["storage_path"].(string)
	fileName, _ := item["file_name"].(string)
	contentType, _ := item["content_type"].(string)
	if strings.TrimSpace(path) == "" || strings.TrimSpace(fileName) == "" {
		return nil, false
	}

	return &registrationStoredFileRef{
		Path:        path,
		FileName:    fileName,
		ContentType: contentType,
	}, true
}
