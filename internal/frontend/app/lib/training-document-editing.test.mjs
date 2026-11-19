import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("training documents reuse the existing visual editor and save the current markdown", async () => {
  const route = await read("../routes/dashboard/training-materials.tsx");
  assert.match(route, /CommunityMarkdownEditor/);
  assert.match(route, /flushRef\.current\(\)/);
  assert.match(route, /<DocumentationArticle source=\{documentSource/);
  assert.match(route, /<DocumentationArticle source=\{documentSource \?\? selectedDocument\.markdown\} title=/);
  assert.match(route, /apiRequest<\{ body: string \}>\(\x60\/api\/training-documents\/\$\{documentSlug\}/);
  assert.match(route, /api\/admin\/training-documents\/\$\{selectedDocument\.id\}/);
  assert.match(route, /canEdit = currentUser\.role\.name === "super_admin"/);
  assert.match(route, /onUploadsChange=\{setUploads\}/);
  assert.match(route, /上传|保存中|保存/);
  assert.match(route, /window\.confirm\(/);
  for (const group of ["electrical", "hardware", "joint", "vision", "ai", "mechanical"]) {
    assert.ok(route.includes('id: "' + group + '"'), group);
  }
  const existingEditor = await read("../components/community-markdown-editor.tsx");
  assert.match(existingEditor, /\[Crepe\.Feature\.Table\]: true/);
  assert.match(existingEditor, /所见即所得/);
  assert.match(existingEditor, /实时预览/);
});

test("training documentation endpoints keep reads available and writes super admin only", async () => {
  const router = await read("../../../backend/router/router.go");
  const start = router.indexOf('trainingReadAPI := api.Group("/training-documents")');
  const end = router.indexOf('trainingImagesAPI := api.Group("/training-document-images")', start);
  assert.ok(start > 0 && end > start);
  assert.match(router.slice(start, end), /RequireAuthenticated\(authService\)/);
  assert.match(router, /superAdminAPI\.PUT\("\/training-documents\/:slug", trainingDocumentHandler\.Save\)/);
  assert.match(router, /trainingReadAPI\.GET\("\/tree", trainingDocumentHandler\.ListTree\)/);
  assert.match(router, /superAdminAPI\.POST\("\/training-documents\/nodes", trainingDocumentHandler\.CreateNode\)/);
  assert.match(router, /superAdminAPI\.PATCH\("\/training-documents\/nodes\/:id", trainingDocumentHandler\.RenameNode\)/);
  const adminIndex = router.indexOf('superAdminAPI := adminAPI.Group("")');
  const authorizeIndex = router.indexOf('superAdminAPI.Use(middleware.RequireSuperAdmin(authService))');
  assert.ok(adminIndex >= 0 && authorizeIndex > adminIndex);
  const handler = await read("../../../backend/handler/training_document.go");
  assert.match(handler, /training_document_git/);
  assert.match(handler, /training_document_start/);
  assert.match(handler, /privatefile\.Upload/);
});

test("training document format tools stay visible below the fixed dashboard header while editing", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const styles = await read("../routes/dashboard/training-materials.css");
  const shared = await read("../components/community-markdown-editor.css");
  const editor = await read("../components/community-markdown-editor.tsx");
  const dashboard = await read("../routes/dashboard/layout.tsx");

  assert.match(page, /<section className="training-docs__editing"/);
  assert.match(dashboard, /dashboard-shell__topbar sticky top-0 z-\[60\].*h-16/);
  assert.match(shared, /\.community-markdown-editor \{[^}]*overflow: hidden;/);
  assert.match(styles, /\.training-docs__editing \.community-markdown-editor \{[^}]*overflow: visible;/);
  assert.match(styles, /\.training-docs__editing :is\(\.community-editor-toolbar, \.community-markdown-source__tools\) \{\s*position: sticky;\s*top: 64px;\s*z-index: 20;\s*background: var\(--admin-surface\);\s*\}/);
  assert.match(editor, /className="community-editor-toolbar" role="toolbar"/);
  assert.match(editor, /className="community-markdown-source__tools" role="toolbar"/);
  assert.match(editor, /label="编辑选中图片"/);
});

test("all editor icons explain their actions on hover and focus, even when image settings are disabled", async () => {
  const editor = await read("../components/community-markdown-editor.tsx");
  const styles = await read("../components/community-markdown-editor.css");
  assert.match(editor, /import \{ createPortal \} from "react-dom"/);
  assert.match(editor, /onMouseEnter=\{\(event\) => showTooltip\(event\.currentTarget\)\}/);
  assert.match(editor, /onMouseLeave=\{\(\) => setTooltip\(null\)\}/);
  assert.match(editor, /onFocus=\{\(event\) => showTooltip\(event\.currentTarget\)\}/);
  assert.match(editor, /onBlur=\{\(\) => setTooltip\(null\)\}/);
  assert.match(editor, /先点击正文中的图片，再调整大小与对齐方式/);
  assert.match(editor, /图片设置：调整大小、对齐和说明/);
  assert.match(editor, /role="tooltip"/);
  assert.match(editor, /document\.body/);
  assert.match(editor, /aria-label=\{hint\}/);
  assert.match(styles, /\.community-editor-toolbar__tooltip-target > button:disabled \{ pointer-events: none; \}/);
  assert.match(styles, /\.community-editor-toolbar__tooltip \{ position: fixed; z-index: 1000;/);
  assert.match(styles, /background: var\(--theme-text\); color: var\(--theme-card\);/);
  assert.match(styles, /pointer-events: none; \}/);
  assert.match(editor, /name="imageSettings"/);
  assert.match(editor, /className="community-markdown-source__tools" role="toolbar"/);
});
