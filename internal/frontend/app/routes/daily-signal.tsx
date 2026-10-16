import { Navigate, useLocation } from "react-router";

export default function LegacyDailySignalRedirect() {
  const location = useLocation();
  return <Navigate to={`/base${location.search}${location.hash}`} replace />;
}
