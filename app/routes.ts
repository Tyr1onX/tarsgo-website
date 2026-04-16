import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("dashboard", "routes/dashboard/layout.tsx", [
    index("routes/dashboard/index.tsx"),
    route("users", "routes/users/dashboard.tsx"),
    route("users/registrations", "routes/users/registrations.tsx"),
    route("admin", "routes/admin/dashboard.tsx"),
    route("admin/users", "routes/admin/users.tsx"),
    route("admin/user-groups", "routes/admin/user-groups.tsx"),
    route("admin/permission-groups", "routes/admin/permission-groups.tsx"),
    route("admin/form-config", "routes/admin/form-config.tsx"),
    route("admin/registrations", "routes/admin/registrations.tsx"),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
