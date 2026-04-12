import { useState } from "react";

export function meta() {
  return [
    { title: "表单配置 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 报名表单配置" },
  ];
}

interface FormField {
  id: number;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

const defaultFields: FormField[] = [
  { id: 1, label: "姓名", type: "text", required: true },
  { id: 2, label: "学号", type: "text", required: true },
  { id: 3, label: "邮箱", type: "email", required: true },
  { id: 4, label: "手机号", type: "tel", required: true },
  { id: 5, label: "学院", type: "text", required: true },
  { id: 6, label: "专业", type: "text", required: true },
  { id: 7, label: "年级", type: "select", required: true, options: ["大一", "大二", "大三", "大四", "研一", "研二"] },
  { id: 8, label: "意向组别", type: "select", required: true, options: ["机械组", "电控组", "视觉组", "决策组", "软件组", "AI组", "运营组"] },
  { id: 9, label: "技能特长", type: "textarea", required: false },
  { id: 10, label: "自我介绍", type: "textarea", required: false },
];

const typeLabels: Record<string, string> = {
  text: "单行文本",
  email: "邮箱",
  tel: "电话",
  select: "下拉选择",
  textarea: "多行文本",
  number: "数字",
  date: "日期",
  radio: "单选",
  checkbox: "多选",
};

export default function FormConfig() {
  const [fields] = useState<FormField[]>(defaultFields);
  const [selectedField, setSelectedField] = useState<FormField | null>(null);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">表单配置</h1>
          <p className="text-sm text-gray-400 mt-1">配置战队报名表单的字段与规则</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-300 border border-gray-700 hover:bg-white/5 rounded-lg transition-colors"
          >
            预览表单
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            添加字段
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Field list */}
        <div className="lg:col-span-3 space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              onClick={() => setSelectedField(field)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedField?.id === field.id
                  ? "bg-primary-500/5 border-primary-500/30"
                  : "bg-gray-900 border-gray-800 hover:border-gray-700"
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Drag handle */}
                <div className="text-gray-600 cursor-grab shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </div>

                {/* Field info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{field.label}</span>
                    {field.required && (
                      <span className="text-[10px] font-medium text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                        必填
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                      {typeLabels[field.type]}
                    </span>
                    {field.options && (
                      <span className="text-xs text-gray-500">
                        {field.options.length} 个选项
                      </span>
                    )}
                  </div>
                </div>

                {/* Order number */}
                <span className="text-xs text-gray-600 font-mono shrink-0">#{index + 1}</span>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                    </svg>
                  </button>
                  <button type="button" className="p-1.5 text-gray-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Field detail / preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-24 rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-sm">
                {selectedField ? "字段详情" : "表单预览"}
              </h2>
            </div>

            {selectedField ? (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">字段名称</label>
                  <input
                    type="text"
                    value={selectedField.label}
                    readOnly
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">字段类型</label>
                  <select
                    value={selectedField.type}
                    disabled
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300"
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-5 rounded-full relative ${selectedField.required ? "bg-primary-500" : "bg-gray-700"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${selectedField.required ? "left-[18px]" : "left-0.5"}`} />
                  </div>
                  <span className="text-sm text-gray-300">必填字段</span>
                </div>
                {selectedField.options && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">选项列表</label>
                    <div className="space-y-2">
                      {selectedField.options.map((opt) => (
                        <div key={opt} className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm text-gray-500 text-center py-8">
                  点击左侧字段查看详情
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
