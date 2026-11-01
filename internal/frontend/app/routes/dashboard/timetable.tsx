import { Navigate, useOutletContext } from "react-router";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

// Keep existing bookmarks working; timetable uploads now live in Personal Profile.
export function meta() { return [{ title: "课程时间 | TARSGO" }]; }
export default function TimetableRedirect() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  return <Navigate to={`/dashboard/members/${currentUser.id}?tab=settings#timetable`} replace />;
}
