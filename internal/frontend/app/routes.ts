import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("robots", "routes/robots.tsx"),
  route("events-and-honors", "routes/events-and-honors.tsx"),
  route("team-history", "routes/team-history.tsx"),
  route("join", "routes/join.tsx"),
  route("micro-specialties/low-altitude-intelligent-sensing-control", "routes/micro-specialty-low-altitude.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("dashboard/setup/super-admin", "routes/dashboard/setup-super-admin.tsx"),
  route("dashboard", "routes/dashboard/layout.tsx", [
    index("routes/dashboard/index.tsx"),
    route("users/registrations", "routes/users/registrations.tsx"),
    route("admin", "routes/admin/dashboard.tsx"),
    route("admin/users", "routes/admin/users.tsx"),
    route("admin/recruitment", "routes/admin/recruitment-management.tsx"),
    route("admin/recruitment-analytics", "routes/admin/recruitment-analytics.tsx"),
    route("admin/registrations", "routes/admin/registrations.tsx"),
    route("admin/email", "routes/admin/email-management.tsx"),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
