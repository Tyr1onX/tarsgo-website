import type {
  RegistrationFormField,
  RegistrationFormFieldType,
} from "~/lib/registration-forms-client";

export const LOCKED_REGISTRATION_FIELD_KEYS = [
  "name",
  "phone",
  "email",
  "group_1",
  "group_2",
] as const;

export const REGISTRATION_FORM_STATUS_OPTIONS = [
  { value: 0, label: "草稿" },
  { value: 1, label: "已发布" },
  { value: 2, label: "已关闭" },
] as const;

export const REGISTRATION_FIELD_TYPE_OPTIONS: Array<{
  value: RegistrationFormFieldType;
  label: string;
}> = [
  { value: "text", label: "单行文本" },
  { value: "textarea", label: "多行文本" },
  { value: "number", label: "数字" },
  { value: "select", label: "下拉选择" },
  { value: "radio", label: "单选" },
  { value: "checkbox", label: "多选" },
  { value: "date", label: "日期" },
  { value: "phone", label: "手机号" },
  { value: "email", label: "邮箱" },
  { value: "file", label: "文件上传" },
  { value: "image", label: "图片上传" },
];

export const REGISTRATION_FIELD_TYPE_LABELS = {
  ...(Object.fromEntries(
    REGISTRATION_FIELD_TYPE_OPTIONS.map((item) => [item.value, item.label]),
  ) as Record<Exclude<RegistrationFormFieldType, "user_group_select">, string>),
  user_group_select: "意向组别",
} satisfies Record<RegistrationFormFieldType, string>;

export function buildLockedRegistrationFields(): RegistrationFormField[] {
  return [
    {
      key: "name",
      label: "姓名",
      type: "text",
      required: true,
      placeholder: "请输入真实姓名",
    },
    {
      key: "phone",
      label: "手机号",
      type: "phone",
      required: true,
      placeholder: "请输入常用手机号",
    },
    {
      key: "email",
      label: "邮箱",
      type: "email",
      required: true,
      placeholder: "请输入联系邮箱",
    },
    {
      key: "group_1",
      label: "意向组别(1)",
      type: "user_group_select",
      required: true,
      placeholder: "请选择意向组别(1)",
    },
    {
      key: "group_2",
      label: "意向组别(2)",
      type: "user_group_select",
      required: true,
      placeholder: "请选择意向组别(2)",
    },
  ];
}

export function isLockedRegistrationField(key: string) {
  return LOCKED_REGISTRATION_FIELD_KEYS.includes(
    key as (typeof LOCKED_REGISTRATION_FIELD_KEYS)[number],
  );
}

export function isOptionField(type: RegistrationFormFieldType) {
  return type === "select" || type === "radio" || type === "checkbox" || type === "user_group_select";
}

export function isFileField(type: RegistrationFormFieldType) {
  return type === "file" || type === "image";
}

export function buildCustomRegistrationField(): RegistrationFormField {
  const unique = Date.now().toString(36);
  return {
    key: `field_${unique}`,
    label: "新字段",
    type: "text",
    required: false,
    placeholder: "",
    description: "",
  };
}

export function cloneRegistrationField(
  field: RegistrationFormField,
): RegistrationFormField {
  return {
    ...field,
    options: field.options?.map((option) => ({ ...option })),
    validation: field.validation ? { ...field.validation } : undefined,
    file_config: field.file_config ? { ...field.file_config } : undefined,
    cascade_config: field.cascade_config ? { ...field.cascade_config } : undefined,
  };
}

export function cloneRegistrationFields(
  fields: RegistrationFormField[],
): RegistrationFormField[] {
  return fields.map((field) => cloneRegistrationField(field));
}
