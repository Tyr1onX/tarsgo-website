package handler

import (
	"strconv"

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
		Key:         "group_1",
		FieldType:   "user_group_select",
		Label:       "意向组别(1)",
		Placeholder: "请选择意向组别(1)",
	},
	{
		Key:         "group_2",
		FieldType:   "user_group_select",
		Label:       "意向组别(2)",
		Placeholder: "请选择意向组别(2)",
	},
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
		merged = append(merged, field)
	}

	return cloneRegistrationFields(merged)
}

func hydrateUserGroupSelectFields(fields []model.FormField, groups []model.UserGroup) []model.FormField {
	result := mergeLockedRegistrationFields(fields)
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
