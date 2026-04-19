import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";

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
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
