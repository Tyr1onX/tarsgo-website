import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  prerender: ["/"],
  future: {
    v8_splitRouteModules: true,
  },
} satisfies Config;
