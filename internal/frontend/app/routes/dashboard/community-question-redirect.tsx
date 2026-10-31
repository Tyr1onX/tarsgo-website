import { Navigate, useSearchParams } from "react-router";

export function meta() {
  return [{ title: "吉甲社区 | TARSGO" }];
}

export default function LegacyCommunityQuestionRedirect() {
  const [params] = useSearchParams();
  const id = Number(params.get("questionId"));
  return <Navigate replace to={Number.isSafeInteger(id) && id > 0 ? `/dashboard/community/${id}` : "/dashboard"} />;
}
