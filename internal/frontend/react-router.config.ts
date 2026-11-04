import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  prerender: ["/", "/about", "/robots", "/events-and-honors", "/team-history", "/join", "/programs/ai-salon"],
  future: {
    v8_splitRouteModules: true,
  },
} satisfies Config;
