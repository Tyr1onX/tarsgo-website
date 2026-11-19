import { OperationsFollowerImportPage } from "./operations-wechat-import";

export function meta() { return [{ title: "导入视频号数据 | TARSGO" }]; }

export default function OperationsWeChatVideoImportPage() {
  return <OperationsFollowerImportPage platform="wechat_video" />;
}
