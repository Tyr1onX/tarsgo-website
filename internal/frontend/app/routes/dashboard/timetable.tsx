import { Navigate } from "react-router";

// Keep existing bookmarks working; timetable uploads now live in Personal Profile.
export function meta() { return [{ title: "课程时间 | TARSGO" }]; }
export default function TimetableRedirect() {
  return <Navigate to="/dashboard?profile=timetable" replace />;
}
