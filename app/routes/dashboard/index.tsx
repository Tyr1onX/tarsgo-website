import { Navigate } from "react-router";

export default function DashboardIndexRedirect() {
  return <Navigate to="/dashboard/users" replace />;
}
