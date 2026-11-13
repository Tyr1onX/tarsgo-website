import type { CollectionField, CollectionInput, CollectionOption } from "./collection-forms-client";

export type CollectionPreset = "registration" | "information" | "feedback" | "blank";

export const collectionPresets: { id: CollectionPreset; title: string; description: string }[] = [
  { id: "registration", title: "活动报名", description: "成员直接选场次，可限制名额" },
  { id: "information", title: "信息确认", description: "确认资料或事项，不重复填身份" },
  { id: "feedback", title: "意见反馈", description: "收集队内成员的建议" },
  { id: "blank", title: "空白表单", description: "自己添加填写内容" },
];

export const fieldKey = () => `f${Math.random().toString(36).slice(2, 10)}`;
export const isChoice = (type: CollectionField["type"]) => ["radio", "checkbox", "select"].includes(type);
export const makeOption = (label: string, capacity = 0): CollectionOption => ({
  value: fieldKey(), label, capacity,
});
export const makeField = (type: CollectionField["type"], label = "", required = true): CollectionField => ({
  key: fieldKey(), label, type, required,
  ...(isChoice(type) ? { options: [makeOption("选项 1"), makeOption("选项 2")] } : {}),
});

export const defaultCloseTime = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  return date.toISOString();
};

export function makeCollectionPreset(preset: CollectionPreset): CollectionInput {
  const base: CollectionInput = {
    title: "", description: "", fields: [],
    status: "draft", loginRequired: true, capacity: 0,
    opensAt: null, closesAt: defaultCloseTime(),
  };
  switch (preset) {
    case "registration": {
      const slot = makeField("radio", "参加场次");
      slot.options = [makeOption("场次一", 5), makeOption("场次二", 5), makeOption("场次三", 5)];
      return { ...base, title: "活动报名表", description: "请选择适合自己的参加场次。",
        fields: [slot] };
    }
    case "information": {
      const confirmation = makeField("radio", "确认结果");
      confirmation.options = [makeOption("已确认"), makeOption("需要补充说明")];
      return { ...base, title: "信息确认表", description: "请核对相关事项后选择确认结果。",
        fields: [confirmation, makeField("textarea", "补充说明", false)] };
    }
    case "feedback": {
      const rating = makeField("radio", "整体感受");
      rating.options = ["非常满意", "满意", "一般", "不满意"].map((label) => makeOption(label));
      return { ...base, title: "活动反馈", fields: [
        rating, makeField("textarea", "意见与建议", false),
      ] };
    }
    case "blank":
      return { ...base, fields: [makeField("text", "")] };
  }
}
