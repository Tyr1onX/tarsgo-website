import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("dashboard/setup/super-admin", "routes/dashboard/setup-super-admin.tsx"),
  route("dashboard", "routes/dashboard/layout.tsx", [
    index("routes/dashboard/index.tsx"),
    route("users", "routes/users/dashboard.tsx"),
    route("users/registrations", "routes/users/registrations.tsx"),
    route("admin", "routes/admin/dashboard.tsx"),
    route("admin/statistics", "routes/admin/statistics.tsx"),
    route("admin/users", "routes/admin/users.tsx"),
    route("admin/user-groups", "routes/admin/user-groups.tsx"),
    route("admin/form-config", "routes/admin/form-config.tsx"),
    route("admin/registrations", "routes/admin/registrations.tsx"),
    route("admin/portal-content", "routes/admin/portal-content.tsx"),
    route("admin/system-config/email", "routes/admin/system-config-email.tsx"),
    route("admin/system-config/oauth", "routes/admin/system-config-oauth.tsx"),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
