import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("training reader has a navigable document hierarchy and preserves six original tracks", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  assert.match(page, /\?doc=start/);
  assert.match(page, /\?doc=git/);
  assert.match(page, /\?group=foundation/);
  assert.match(page, /原始培养路线/);
  assert.match(page, /aria-current=\{selectedKey === key \? "page" : undefined\}/);
  assert.match(page, /<select/);
  assert.match(page, /<nav className="training-docs__pagination"/);
  assert.match(page, /matchAll\(\/\^## /);
  for (const group of ["electrical", "hardware", "joint", "vision", "ai", "mechanical"]) {
    assert.ok(page.includes('id: "' + group + '"'), group);
  }
  for (const original of ["阶段考核：？？？", "硬件组学习全部软件组内容", "分流后，在学习过cpp 和 python"]) {
    assert.ok(page.includes(original), original);
  }
});

test("Git chapter is a complete hands-on walkthrough with its original resources", async () => {
  const guide = await read("../content/training/git-and-github.md");
  const start = await read("../content/training/start.md");
  const picture = await read("../../../../public/assets/images/training/git-workflow.svg");
  const stylesheet = await read("../routes/dashboard/training-materials.css");

  for (const heading of ["先理解四个位置", "安装 Git 并设置提交身份", "创建自己的练习仓库", "提交并确认本地版本", "把本地仓库连接到 GitHub", "检查 GitHub 上的最终结果", "常见问题"]) {
    assert.ok(guide.includes(heading), heading);
  }
  for (const command of ["git --version", "git init -b main", "git add README.md", "git commit -m", "git log --oneline -1", "git remote add origin", "git push -u origin main"]) {
    assert.ok(guide.includes(command), command);
  }
  assert.match(guide, /BV1Y8aL6SEit/);
  assert.match(guide, /BV1LwHv6LEYz/);
  assert.match(guide, /!\[Git 工作区.*\]\(\/assets\/images\/training\/git-workflow\.svg\)/);
  assert.match(picture, /git (add|commit|push)/i);
  assert.match(start, /\?doc=git/);
  assert.match(stylesheet, /@media \(max-width: 720px\)/);
});

test("both documentation sidebars collapse independently and restore without hiding the article", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const stylesheet = await read("../routes/dashboard/training-materials.css");

  assert.match(page, /\[leftNavigationOpen, setLeftNavigationOpen\] = useState\(true\)/);
  assert.match(page, /\[rightContentsOpen, setRightContentsOpen\] = useState\(true\)/);
  assert.match(page, /setLeftNavigationOpen\(\(open\) => !open\)/);
  assert.match(page, /setRightContentsOpen\(\(open\) => !open\)/);
  for (const label of ["收起文档目录", "展开文档目录", "收起本页目录", "展开本页目录"]) {
    assert.ok(page.includes(label), label);
  }
  assert.match(page, /leftNavigationOpen \? <nav/);
  assert.match(page, /rightContentsOpen \? sections\.map/);
  assert.match(page, /aria-expanded=\{leftNavigationOpen\}/);
  assert.match(page, /aria-expanded=\{rightContentsOpen\}/);
  assert.match(stylesheet, /\.training-docs__layout\.is-left-collapsed\s*\{\s*--training-nav-width: 40px;/);
  assert.match(stylesheet, /\.training-docs__layout\.is-right-collapsed\s*\{\s*--training-toc-width: 40px;/);
  assert.match(stylesheet, /\.training-docs__layout\.is-toc-empty\s*\{\s*--training-toc-width: 0px;/);
  assert.match(stylesheet, /grid-template-columns: var\(--training-nav-width\) minmax\(0, 1fr\) var\(--training-toc-width\)/);
  assert.match(stylesheet, /@media \(max-width: 720px\)/);
  assert.match(stylesheet, /\.training-docs__sidebar \{ display: none; \}/);
  assert.ok(!stylesheet.includes("max-width: 780px"), "article must be able to use available width");
});
