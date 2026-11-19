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
  for (const label of ["写给刚刚来到这里的你", "计算机基础", "Git 与 GitHub", "原始培养路线"]) {
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

test("foundation opens directly into real tutorials without an overview", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const guide = await read("../content/training/computer-basics.md");
  const git = await read("../content/training/git-and-github.md");
  const backend = await read("../../../backend/handler/training_document_tree.go");

  assert.match(page, /computer: computerMarkdown/);
  assert.doesNotMatch(page, /foundationMarkdown/);
  assert.match(page, /searchParams.get\("group"\) === "foundation"/);
  assert.match(page, /setSearchParams\(\{ doc: "computer" \}, \{ replace: true \}\)/);
  assert.match(backend, /computerGuideNode\(\)/);
  assert.doesNotMatch(backend, /Title: "通用基础概览"/);
  for (const task of ["CPU", "内存", "tarsgo-practice", "notes.txt", "example.com", "DNS"]) {
    assert.ok(guide.includes(task), task);
  }
  assert.doesNotMatch(guide + git, /\?group=foundation/);
  assert.match(guide, /计算机的硬件组成/);
  assert.match(guide, /操作系统、文件与目录/);
  assert.match(guide, /软件安装、版本与依赖/);
  assert.match(guide, /域名、网络与网页访问/);
  assert.match(git, /工作区、暂存区、本地仓库与远程仓库/);
});

test("six direction paths explain technical topics while preserving the original routes", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const tree = await read("../../../backend/handler/training_document_tree.go");
  const sources = {
    "path-electrical": ["C 语言", "STM32", "FreeRTOS", "PID", "看门狗"],
    "path-hardware": ["PCB", "DC-DC", "STM32", "打样", "主控板"],
    "path-mechanical": ["SolidWorks", "标准件", "传动", "仿真", "迭代"],
    "path-joint": ["Ubuntu", "Python", "C++", "Git", "?doc=computer"],
    "path-vision": ["OpenCV", "神经网络", "串口", "滤波", "自瞄"],
    "path-ai": ["ROS 2", "里程计", "规划", "卡尔曼", "点云聚类"],
  };
  assert.match(tree, /Title: "方向学习路径"/);
  for (const [slug, terms] of Object.entries(sources)) {
    const path = await read("../content/training/" + slug + ".md");
    assert.match(page, new RegExp('"' + slug + '":'));
    assert.match(tree, new RegExp('ID: "' + slug + '"'));
    assert.match(path, /^## .+/m);
    for (const term of terms) assert.ok(path.includes(term), slug + ": " + term);
  }
  for (const original of ["阶段考核：？？？", "硬件组学习全部软件组内容", "分流后，在学习过cpp 和 python"]) {
    assert.ok(page.includes(original), original);
  }
  for (const text of ["不需要购买设备", "不必追求标准答案", "不需要上传或打卡"]) {
    const basics = await read("../content/training/computer-basics.md");
    assert.ok(!basics.includes(text), text);
  }
});

test("technical concepts are complete reachable lessons and all internal links resolve", async () => {
  const page = await read("../routes/dashboard/training-materials.tsx");
  const backend = await read("../../../backend/handler/training_document_tree.go");
  const pathNames = ["path-electrical", "path-hardware", "path-mechanical", "path-joint", "path-vision", "path-ai"];
  const conceptNames = [
    "term-c", "term-stm32", "term-peripherals", "term-bus", "term-pid", "term-rtos",
    "term-pcb", "term-power", "term-bringup", "term-cad", "term-mechanism",
    "term-materials", "term-fea", "term-linux", "term-python", "term-cpp",
    "term-opencv", "term-neural", "term-concurrency", "term-filter", "term-ros2",
    "term-odometry", "term-navigation", "term-estimation", "term-decision",
    "term-pointcloud", "term-engineering",
  ];
  const knownDocs = new Set(["computer", "git", "welcome", ...pathNames, ...conceptNames]);
  assert.match(backend, /Title: "概念详解"/);
  assert.match(page, /articleTitle = source\.match/);

  for (const name of [...pathNames, ...conceptNames]) {
    const source = name.startsWith("term-")
      ? await read("../content/training/concepts/" + name + ".md")
      : await read("../content/training/" + name + ".md");
    assert.match(source, /^# .+\n/m, name);
    assert.ok(source.length > (name.startsWith("term-") ? 220 : 1200), name + ": missing technical explanation");
    assert.ok(backend.includes('ID: "' + name + '"'), name + ": missing catalog node");
    assert.ok(page.includes('"' + name + '":'), name + ": missing default markdown");

    for (const [, destination] of source.matchAll(/\]\(\?doc=([a-z0-9-]+)\)/g)) {
      assert.ok(knownDocs.has(destination), name + ": invalid link to " + destination);
    }
  }
  for (const name of pathNames) {
    const source = await read("../content/training/" + name + ".md");
    assert.doesNotMatch(source, /\*\*(检查|完成判断)：\*\*/, name + ": contains study-process text");
    assert.match(source, /\?doc=term-/, name + ": no concept navigation");
    assert.ok(source.length > 1200, name + ": missing explanation");
  }
});

test("knowledge chapters do not show audience, course outcomes, checklists or next-reading prompts", async () => {
  const pathNames = ["computer-basics", "git-and-github", "path-electrical", "path-hardware", "path-mechanical", "path-joint", "path-vision", "path-ai"];
  const conceptNames = ["term-c", "term-stm32", "term-peripherals", "term-bus", "term-pid", "term-rtos", "term-pcb", "term-power", "term-bringup", "term-cad", "term-mechanism", "term-materials", "term-fea", "term-linux", "term-python", "term-cpp", "term-opencv", "term-neural", "term-concurrency", "term-filter", "term-ros2", "term-odometry", "term-navigation", "term-estimation", "term-decision", "term-pointcloud", "term-engineering"];
  for (const name of [...pathNames, ...conceptNames]) {
    const source = name.startsWith("term-")
      ? await read("../content/training/concepts/" + name + ".md")
      : await read("../content/training/" + name + ".md");
    assert.doesNotMatch(source, /(?:^## (?:继续学习|自己验证)|^\*\*(?:适用方向|学完后能做什么|完成目标|完成判断|检查)：\*\*)/m, name);
    assert.doesNotMatch(source, /(?:不需要上传或打卡|不必追求标准答案|从手边的电脑开始|如果你的方向需要|返回 \[[^\]]+学习路径)/, name);
  }
});
