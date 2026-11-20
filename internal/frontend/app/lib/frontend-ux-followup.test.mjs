import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("global community shortcuts do not trigger during IME composition or from interactive controls", async () => {
  for (const path of ["routes/dashboard/index.tsx", "routes/dashboard/community-post.tsx"]) {
    const source = await read(path);
    assert.match(source, /event\.isComposing \|\| event\.repeat/);
    assert.match(source, /target instanceof Element && target\.closest\("input, textarea, select, button, a, \[contenteditable=true\], \[role=combobox\]"\)/);
  }
  const menu = await read("components/dashboard-steady-ui.tsx");
  assert.match(menu, /event\.key === "Enter" && !event\.nativeEvent\.isComposing/);
});

test("copied document anchors use visible heading text including inline-markup children", async () => {
  const docs = await read("routes/dashboard/training-materials.tsx");
  assert.match(docs, /function headingText\(children: ReactNode\)/);
  assert.match(docs, /children\.map\(headingText\)\.join\(""\)/);
  assert.match(docs, /isValidElement<\{ children\?: ReactNode \}>\(children\)/);
  assert.match(docs, /headingId\(headingText\(children\)\)/);
  assert.match(docs, /复制「\$\{headingText\(children\)\}」章节链接/);
});

test("offline banner avoids promising unsaved drafts and back-to-top respects reduced motion", async () => {
  const root = await read("root.tsx");
  const menu = await read("components/dashboard-steady-ui.tsx");
  const layout = await read("routes/dashboard/layout.tsx");
  assert.match(root, /window\.addEventListener\("offline", handleOffline\)/);
  assert.match(root, /window\.addEventListener\("online", handleOnline\)/);
  assert.match(root, /当前网络连接已断开/);
  assert.doesNotMatch(root, /表单草稿仍保存在本地/);
  assert.match(menu, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/);
  assert.match(layout, /href="#dashboard-main-content"/);
  assert.match(layout, /id="dashboard-main-content" tabIndex=\{-1\}/);
  assert.match(layout, /document\.title\.replace\(\/\^\\\(\\d\+\\\)\\s\*\//);
});
