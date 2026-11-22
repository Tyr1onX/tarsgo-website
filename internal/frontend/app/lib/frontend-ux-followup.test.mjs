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


test("mobile editable fields stay at 16px or larger to avoid iOS Safari focus zoom", async () => {
  const styles = await read("app.css");
  assert.match(styles, /@media \(max-width: 639px\) \{\s*body :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), textarea, select\)/);
  assert.match(styles, /font-size: max\(1rem, 1em\)/);
});


test("narrow phone dashboard header retains quick-jump but hides desktop keyboard hint", async () => {
  const css = await read("components/dashboard-steady-ui.css");
  assert.match(css, /@media \(max-width: 479px\)/);
  assert.match(css, /\.dashboard-shell__topbar \{ gap: 0\.5rem; \}/);
  assert.match(css, /\.dashboard-cmdk-kbd \{ display: none; \}/);
  assert.match(css, /\.dashboard-cmdk-trigger \{ padding-inline: 0\.6rem; \}/);
  const jsx = await read("components/dashboard-steady-ui.tsx");
  assert.match(jsx, /aria-label="快速跳转工作台模块（快捷键 Command\+K）"/);
});
