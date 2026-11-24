import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const apiProxyTarget = process.env.TARSGO_API_PROXY ?? "http://127.0.0.1:8080";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), {
    // Match the production Go router before Vite's default SPA fallback
    // rewrites a slashless prerendered path to the homepage HTML.
    name: "tarsgo-prerender-preview",
    configurePreviewServer(server) {
      const clientDir = resolve(server.config.root, server.config.environments.client.build.outDir);
      server.middlewares.use((req, _res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const accept = req.headers.accept;
        if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return next();
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname.replace(/\/+$/, "") || "/";
        if (pathname === "/" || extname(pathname) ||
            /^\/(api|upload|assets|media|healthz)(\/|$)/.test(pathname)) return next();
        const page = pathname + "/index.html";
        const fallback = "/__spa-fallback.html";
        if (existsSync(resolve(clientDir, "." + page))) req.url = page + url.search;
        else if (existsSync(resolve(clientDir, "." + fallback))) req.url = fallback + url.search;
        next();
      });
    },
  }],
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
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "vendor-highlight", test: /node_modules\/highlight\.js/ },
            { name: "vendor-katex", test: /node_modules\/katex/ },
            { name: "vendor-markdown", test: /node_modules\/(react-markdown|remark-|rehype-|mdast-|hast-|micromark|unist-|unified)/ },
            { name: "vendor-editor", test: /node_modules\/(@tiptap|prosemirror-|@codemirror|codemirror)/ },
          ],
        },
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
