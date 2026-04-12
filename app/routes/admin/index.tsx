import { Navigate } from "react-router";

export default function AdminIndexRedirect() {
  return <Navigate to="/admin/dashboard" replace />;
}
