import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/index.tsx"),
    route("dashboard", "routes/admin/dashboard.tsx"),
    route("users", "routes/admin/users.tsx"),
    route("user-groups", "routes/admin/user-groups.tsx"),
    route("form-config", "routes/admin/form-config.tsx"),
    route("registrations", "routes/admin/registrations.tsx"),
  ]),
] satisfies RouteConfig;
