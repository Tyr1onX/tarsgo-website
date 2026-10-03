import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const apiProxyTarget = process.env.TARSGO_API_PROXY ?? "http://127.0.0.1:8080";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  publicDir,
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(repoRoot)],
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      // Uploaded group images are returned as same-origin paths by the API.
      // Proxy them in split frontend development just like API requests.
      "/upload": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
