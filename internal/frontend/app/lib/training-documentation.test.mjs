import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("training documents use a persistent expandable tree without losing the original materials", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const tree = await read("../components/training-document-tree.tsx");
  const backend = await read("../../../backend/handler/training_document_tree.go");
  assert.match(page, /api\/training-documents\/tree/);
  assert.match(page, /<TrainingDocumentTree/);
  assert.match(page, /orderedTrainingNodes\(tree\)/);
  assert.match(page, /trainingNodeHref\(before\)/);
  assert.match(tree, /setExpanded/);
  assert.match(tree, /aria-expanded=\{expanded\.has\(node\.id\)\}/);
  assert.match(tree, /新建子模块/);
  assert.match(tree, /新建子文档/);
  assert.match(tree, /重命名/);
  assert.match(tree, /method: "POST"/);
  assert.match(tree, /method: "PATCH"/);
  assert.match(backend, /training_document_tree/);
  assert.match(backend, /"document", Scope: 3/);
  for (const label of [
    "写给刚刚来到这里的你", "认识吉甲大师", "你将在这里经历什么", "找到适合自己的方向",
    "开始你的第一次学习", "学习不是一个人的事情", "从这里继续出发",
    "通用基础概览", "Git 与 GitHub", "原始培养路线",
  ]) {
    assert.ok(backend.includes(label), label);
  }
  for (const group of ["electrical", "hardware", "joint", "vision", "ai", "mechanical"]) {
    assert.ok(page.includes('id: "' + group + '"'), group);
  }
  for (const original of ["阶段考核：？？？", "硬件组学习全部软件组内容", "分流后，在学习过cpp 和 python"]) {
    assert.ok(page.includes(original), original);
  }
});

test("Git chapter keeps its complete hands-on walkthrough and reference links", async () => {
  const guide = await read("../content/training/git-and-github.md");
  const start = await read("../content/training/start.md");
  const picture = await read("../../../../public/assets/images/training/git-workflow.svg");
  for (const heading of ["先理解四个位置", "安装 Git 并设置提交身份", "创建自己的练习仓库", "提交并确认本地版本", "把本地仓库连接到 GitHub", "检查 GitHub 上的最终结果", "常见问题"]) {
    assert.ok(guide.includes(heading), heading);
  }
  for (const command of ["git --version", "git init -b main", "git add README.md", "git commit -m", "git log --oneline -1", "git remote add origin", "git push -u origin main"]) {
    assert.ok(guide.includes(command), command);
  }
  for (const bv of ["BV1Y8aL6SEit", "BV1LwHv6LEYz"]) assert.ok(guide.includes(bv));
  assert.match(guide, /git-workflow\.svg/);
  assert.match(picture, /git (add|commit|push)/i);
  assert.match(start, /\?doc=git/);
});

test("document layout still allows independent left and right collapse", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const stylesheet = await read("../routes/dashboard/training-materials.css");
  assert.match(page, /\[leftNavigationOpen, setLeftNavigationOpen\] = useState\(true\)/);
  assert.match(page, /\[rightContentsOpen, setRightContentsOpen\] = useState\(true\)/);
  assert.match(page, /setLeftNavigationOpen\(\(open\) => !open\)/);
  assert.match(page, /setRightContentsOpen\(\(open\) => !open\)/);
  assert.match(page, /<TrainingDocumentTree/);
  assert.match(page, /rightContentsOpen \? sections\.map/);
  assert.match(stylesheet, /\.training-docs__layout\.is-left-collapsed\s*\{\s*--training-nav-width: 40px;/);
  assert.match(stylesheet, /\.training-docs__layout\.is-right-collapsed\s*\{\s*--training-toc-width: 40px;/);
  assert.match(stylesheet, /grid-template-columns: var\(--training-nav-width\) minmax\(0, 1fr\) var\(--training-toc-width\)/);
  assert.match(stylesheet, /@media \(max-width: 720px\)/);
  assert.match(stylesheet, /\.training-docs__sidebar \{ display: none; \}/);
});
