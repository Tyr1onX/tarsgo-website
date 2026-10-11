package registration

import (
	"strconv"
	"strings"

	"tarsgo-backend/model"
)

type lockedRegistrationFieldSpec struct {
	Key         string
	FieldType   string
	Label       string
	Placeholder string
}

var registrationLockedFieldSpecs = []lockedRegistrationFieldSpec{
	{
		Key:         "name",
		FieldType:   "text",
		Label:       "姓名",
		Placeholder: "请输入真实姓名",
	},
	{
		Key:         "phone",
		FieldType:   "phone",
		Label:       "手机号",
		Placeholder: "请输入常用手机号",
	},
	{
		Key:         "email",
		FieldType:   "email",
		Label:       "邮箱",
		Placeholder: "请输入联系邮箱",
	},
	{
		Key:         "preferred_group",
		FieldType:   "user_group_select",
		Label:       "意向组",
		Placeholder: "请选择意向组",
	},
}

var legacyRegistrationGroupFieldKeys = map[string]struct{}{
	"group_1": {},
	"group_2": {},
}

var registrationLockedFields = func() map[string]lockedRegistrationFieldSpec {
	items := make(map[string]lockedRegistrationFieldSpec, len(registrationLockedFieldSpecs))
	for _, spec := range registrationLockedFieldSpecs {
		items[spec.Key] = spec
	}
	return items
}()

func buildLockedRegistrationField(spec lockedRegistrationFieldSpec) model.FormField {
	return model.FormField{
		Key:         spec.Key,
		Label:       spec.Label,
		Type:        spec.FieldType,
		Required:    true,
		Placeholder: spec.Placeholder,
	}
}

func mergeLockedRegistrationFields(fields []model.FormField) []model.FormField {
	byKey := make(map[string]model.FormField, len(fields))
	for _, field := range fields {
		byKey[field.Key] = field
	}

	merged := make([]model.FormField, 0, len(fields)+len(registrationLockedFieldSpecs))
	lockedKeys := make(map[string]struct{}, len(registrationLockedFieldSpecs))
	for _, spec := range registrationLockedFieldSpecs {
		item, ok := byKey[spec.Key]
		if !ok {
			item = buildLockedRegistrationField(spec)
		}
		item.Key = spec.Key
		item.Label = spec.Label
		item.Type = spec.FieldType
		item.Required = true
		if item.Placeholder == "" {
			item.Placeholder = spec.Placeholder
		}
		if spec.FieldType == "user_group_select" {
			item.Options = nil
		}
		merged = append(merged, item)
		lockedKeys[spec.Key] = struct{}{}
	}

	for _, field := range fields {
		if _, ok := lockedKeys[field.Key]; ok {
			continue
		}
		if _, legacy := legacyRegistrationGroupFieldKeys[field.Key]; legacy {
			continue
		}
		merged = append(merged, normalizeLegacyRecruitmentFieldCopy(field))
	}

	return cloneRegistrationFields(merged)
}

func hasLegacyDualIntentFields(fields []model.FormField) bool {
	keys := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		keys[field.Key] = struct{}{}
	}
	_, hasFirst := keys["group_1"]
	_, hasSecond := keys["group_2"]
	return hasFirst && hasSecond
}

func registrationFormEditorFields(fields []model.FormField) []model.FormField {
	if hasLegacyDualIntentFields(fields) {
		return cloneRegistrationFields(fields)
	}
	return mergeLockedRegistrationFields(fields)
}

func normalizeLegacyRecruitmentFieldCopy(field model.FormField) model.FormField {
	replacements := []struct {
		old string
		new string
	}{
		{"为什么选择上面2个组别，请分别阐述。", "为什么选择上面的意向组，请阐述。"},
		{"为什么选择上面 2 个组别，请分别阐述。", "为什么选择上面的意向组，请阐述。"},
	}
	for _, replacement := range replacements {
		field.Label = strings.ReplaceAll(field.Label, replacement.old, replacement.new)
		field.Description = strings.ReplaceAll(field.Description, replacement.old, replacement.new)
		field.Placeholder = strings.ReplaceAll(field.Placeholder, replacement.old, replacement.new)
	}
	return field
}

func hydrateUserGroupSelectFields(fields []model.FormField, groups []model.UserGroup) []model.FormField {
	return hydrateUserGroupSelectOptions(mergeLockedRegistrationFields(fields), groups)
}

func hydrateUserGroupSelectOptions(fields []model.FormField, groups []model.UserGroup) []model.FormField {
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

func buildVisibleUserGroupOptions(groups []model.UserGroup) []model.FormFieldOption {
	options := make([]model.FormFieldOption, 0, len(groups))
	for _, group := range groups {
		if group.ID == 0 {
			continue
		}
		options = append(options, model.FormFieldOption{
			Label: group.Name,
			Value: strconv.FormatUint(group.ID, 10),
		})
	}
	return options
}
