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
  for (const heading of ["为什么保存文件还需要版本记录", "一个文件怎样成为一次提交", "安装 Git 与查看版本", "创建一个最小仓库", "亲眼看到一次修改前后的区别", "GitHub 怎样与本地仓库连接", "常见问题"]) {
    assert.ok(guide.includes(heading), heading);
  }
  for (const command of ["git --version", "git init -b main", "git add README.md", "git commit -m", "git log --oneline -1", "git remote add origin", "git push -u origin main"]) {
    assert.ok(guide.includes(command), command);
  }
  assert.match(guide, /https:\/\/git-scm\.com\/downloads/);
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
  for (const heading of ["计算机怎样执行一个程序", "操作系统为什么存在", "文件、文件夹和路径", "软件为什么有版本与依赖", "浏览器打开网页时发生了什么"]) assert.ok(guide.includes(heading), heading);
  assert.match(git, /一个文件怎样成为一次提交/);
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
    assert.ok(source.length > (name.startsWith("term-") ? 650 : 2400), name + ": missing step-by-step explanation");
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
    assert.ok(source.length > 2400, name + ": missing explanation");
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

test("beginner lessons introduce their ideas before implementation details", async () => {
  const chapterOrder = {
    "computer-basics": [
      "计算机怎样执行一个程序", "操作系统为什么存在",
      "文件、文件夹和路径", "软件为什么有版本与依赖",
      "浏览器打开网页时发生了什么",
    ],
    "git-and-github": [
      "为什么保存文件还需要版本记录",
      "一个文件怎样成为一次提交", "安装 Git 与查看版本",
      "创建一个最小仓库", "亲眼看到一次修改前后的区别",
      "GitHub 怎样与本地仓库连接", "分支与协作",
    ],
    "path-electrical": [
      "把“目标”和“实际”表示成数据", "把程序放到控制板上",
      "获取真实的电机转速", "根据误差调整输出",
      "让多个工作同时运行",
    ],
    "path-hardware": [
      "电路为什么需要完整通路", "原理图与 PCB 有什么区别",
      "为什么电源要单独设计", "STM32 为什么需要最小系统",
      "从练习板变成主控板",
    ],
    "path-mechanical": [
      "从尺寸开始理解三维建模", "几个零件怎样组成一个机构",
      "电机的运动如何传到轴上", "同一个支架为什么可以用不同材料",
      "仿真告诉我们什么",
    ],
    "path-joint": [
      "文件与程序从哪里来", "为什么要用 Git 保存变化",
      "Ubuntu 和终端解决什么问题", "Python：让程序计算平均转速",
      "C++：用另一种语言表达同一个计算",
    ],
    "path-vision": [
      "图片在程序里是什么", "怎样从图片里挑出目标区域",
      "从白色像素得到一个位置", "怎样保存每一帧的检测结果",
      "阈值方法为什么会遇到局限", "连续图片怎样组成实时系统",
    ],
    "path-ai": [
      "机器人怎样知道自己在哪里", "地图告诉机器人什么",
      "规划与控制有什么区别", "机器人系统要拆成多个节点",
      "传感器信息不一致怎么办",
    ],
  };
  for (const [name, headings] of Object.entries(chapterOrder)) {
    const body = await read("../content/training/" + name + ".md");
    let last = -1;
    for (const heading of headings) {
      const index = body.indexOf(heading);
      assert.ok(index > last, name + ": out-of-order or missing step: " + heading);
      last = index;
    }
  }
  const basics = await read("../content/training/computer-basics.md");
  assert.match(basics, /磁盘像书架/);
  assert.match(basics, /路径的起点/);
  const git = await read("../content/training/git-and-github.md");
  assert.match(git, /已经保存的版本/);
  assert.match(git, /git diff/);
});
