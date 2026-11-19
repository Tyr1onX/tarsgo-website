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
  for (const label of ["写给刚刚来到这里的你", "通用基础概览", "Git 与 GitHub", "原始培养路线"]) {
    assert.ok(backend.includes(label), label);
  }
  for (const retired of ["认识吉甲大师", "你将在这里经历什么", "找到适合自己的方向",
    "开始你的第一次学习", "学习不是一个人的事情", "从这里继续出发"]) {
    assert.ok(!backend.includes(retired), retired);
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
  assert.match(stylesheet, /\.training-docs__layout\.is-left-collapsed\s*\{\s*--training-nav-width: 44px;/);
  assert.match(stylesheet, /\.training-docs__layout\.is-right-collapsed\s*\{\s*--training-toc-width: 44px;/);
  assert.match(stylesheet, /grid-template-columns: var\(--training-nav-width\) minmax\(0, 1fr\) var\(--training-toc-width\)/);
  assert.match(stylesheet, /@media \(max-width: 720px\)/);
  assert.match(stylesheet, /\.training-docs__sidebar \{ display: none; \}/);
});

test("document sidebar keeps its instance and scroll position when collapsed", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const tree = await read("../components/training-document-tree.tsx");
  const css = await read("../routes/dashboard/training-materials.css");
  assert.match(page, /className="training-docs__sidebar-body" aria-hidden=\{!leftNavigationOpen\} inert=\{!leftNavigationOpen\}/);
  assert.doesNotMatch(page, /leftNavigationOpen \? <TrainingDocumentTree/);
  assert.match(page, /<TrainingDocumentTree/);
  assert.match(css, /\.training-docs__sidebar-body \{[^}]*overflow-y: auto;[^}]*scrollbar-gutter: stable;/);
  assert.match(css, /\.training-docs__layout\.is-left-collapsed \.training-docs__sidebar-body \{ visibility: hidden; pointer-events: none; \}/);
  assert.match(css, /\.training-docs__sidebar-control \{ position: absolute; top: 0;/);
  assert.match(css, /\.training-tree__toolbar \{ position: absolute; top: 0;/);
  assert.doesNotMatch(css, /\.training-docs__sidebar, \.training-docs__toc \{[^}]*overflow-y: auto;/);
  assert.match(tree, /title=\{node\.title\}/);
});

test("reader reuses visited document bodies and avoids redundant helper text", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const css = await read("../routes/dashboard/training-materials.css");
  assert.match(page, /\[documentCache, setDocumentCache\] = useState<Record<string, \{ body: string; error\?: string \}>>\(\{\}\)/);
  assert.match(page, /if \(!documentSlug \|\| documentCache\[documentSlug\]\) return;/);
  assert.match(page, /setDocumentCache\(\(cache\) => \(\{ \.\.\.cache, \[documentSlug\]: \{ body \} \}\)\)/);
  assert.match(page, /setDocumentCache\(\(cache\) => \(\{ \.\.\.cache, \[selectedDocument\.id\]: \{ body: saved\.body \} \}\)\)/);
  assert.match(page, /documentRecord\.error/);
  assert.match(page, /training-docs__placeholder/);
  assert.doesNotMatch(page, /面向本届纳新同学|training-docs__breadcrumb|资料原文保留/);
  assert.doesNotMatch(css, /max-width: 780px|training-docs__breadcrumb|training-docs__original-label/);
  assert.match(css, /\.training-docs__article \{[^}]*max-width: 800px;[^}]*margin-inline: auto;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("training reader uses the existing image layout metadata instead of forcing every image full-width", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const stylesheet = await read("../routes/dashboard/training-materials.css");
  const editor = await read("../components/community-markdown-editor.tsx");

  assert.match(editor, /显示宽度<select/);
  for (const width of [25, 50, 75, 100]) {
    assert.match(editor, new RegExp('<option value="' + width + '">'));
  }
  assert.match(page, /import \{ decodeCommunityImageTitle \} from "~\/lib\/community-markdown"/);
  assert.match(page, /img: \(\{ src, alt, title \}\) => \{/);
  assert.match(page, /const layout = decodeCommunityImageTitle\(title\)/);
  assert.match(page, /style=\{layout \? \{ width: `\$\{layout\.width\}%` \} : undefined\}/);
  assert.match(page, /is-\$\{layout\.align\}/);
  assert.match(page, /training-docs__image-caption/);
  assert.match(page, /loading="lazy" decoding="async"/);
  assert.match(stylesheet, /\.training-docs__image\.is-center \{ margin-inline: auto; \}/);
  assert.match(stylesheet, /\.training-docs__image\.is-right \{ margin-left: auto; \}/);
  assert.doesNotMatch(stylesheet, /\.training-docs__markdown img \{[^}]*width: 100%;/);
});

test("foundation overview links to a usable computer basics guide without adding mandatory training", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const overview = await read("../content/training/foundation.md");
  const guide = await read("../content/training/computer-basics.md");
  const backend = await read("../../../backend/handler/training_document_tree.go");

  assert.match(page, /computer: computerMarkdown/);
  assert.match(page, /selectedMaterial\.id === "foundation"/);
  assert.match(page, /DocumentationArticle source=\{selectedMaterial\.text\}/);
  assert.match(backend, /computerGuideNode\(\)/);
  assert.match(backend, /computerGuideScope/);
  assert.match(overview, /\?doc=computer/);
  assert.match(overview, /\?doc=git/);
  for (const topic of ["Ubuntu", "Python", "C++", "C 语言", "工程"]) {
    assert.ok(overview.includes(topic), topic);
  }
  for (const task of ["CPU", "内存", "tarsgo-practice", "notes.txt", "example.com", "Git 与 GitHub"]) {
    assert.ok(guide.includes(task), task);
  }
  for (const bv of ["BV15i9UBhEZ2", "BV1UwPgziE3F"]) {
    assert.ok(guide.includes(bv), bv);
  }
  assert.match(guide, /不需要上传或打卡/);
});
