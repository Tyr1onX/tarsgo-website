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
