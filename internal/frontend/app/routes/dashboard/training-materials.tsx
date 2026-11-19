import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CommunityMarkdownEditor, type CommunityPendingImage } from "~/components/community-markdown-editor";
import { TrainingDocumentTree, orderedTrainingNodes, trainingNodeHref, type TrainingNode } from "~/components/training-document-tree";
import { apiRequest } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import startMarkdown from "~/content/training/start.md?raw";
import gitMarkdown from "~/content/training/git-and-github.md?raw";
import "./training-materials.css";

export function meta() {
  return [{ title: "新人培养文档 | TARSGO" }];
}

const materials = [
  {
    id: "foundation",
    label: "通用基础",
    text: `本届纳新 · 通用基础学习资料

适用对象：本届纳新报名、准备参加技术组培养的同学。
说明：以下内容从已有培训路线中整理。各方向按需学习，不是所有人统一必修；具体培养进度、考核和专项内容仍以各组原始资料为准。

一、计算机基础
适用方向：AI、视觉（联合培训原文明确安排）

1. 认识 CPU、内存、硬盘、主板、显卡等计算机硬件及其作用
2. 了解操作系统、文件管理、软件安装
3. 了解计算机网络基础常识

原有视频资源（B站）：BV15i9UBhEZ2、BV1UwPgziE3F

二、Git 与 GitHub
适用方向：AI、视觉（联合培训）；电控（原文要求 Git 版本管理）

1. 安装、配置 Git，管理本地仓库
2. 学习提交与回退、分支与合并
3. 学习远程仓库、SSH 配置及基本协作流程
4. 养成规范提交与版本管理习惯

原有视频资源（B站）：BV1Y8aL6SEit、BV1LwHv6LEYz

三、Linux（Ubuntu）基础
适用方向：AI、视觉（联合培训；视觉路线也要求后续深入学习 Linux）

1. 安装并日常使用 Ubuntu
2. 掌握常用终端命令、文件操作与权限管理
3. 具备基础开发环境的搭建能力

原有视频资源（B站）：BV1cq421w72c、BV1Cc41127B9

四、编程语言基础
各方向使用不同语言，不统一要求全部学习。

Python（AI、视觉）
1. 基础语法、数据类型、流程控制、函数
2. 类与对象、文件操作、常用第三方库
原有视频资源（B站）：BV1rpWjevEip

C++（AI、视觉）
1. 基础语法、指针与引用
2. 类、继承、多态等面向对象知识
3. STL 常用容器
原有视频资源（B站）：BV1Dk4y1j7oj

C 语言（电控）
1. 指针、结构体
2. 内存管理与位运算
电控原文未指定对应视频，此处不另行补充。

五、工程实践基础
以下是从多个方向的路线中归纳的共通学习方式，不是另设的统一考核。

1. 边学边做：联合培训原文强调观看视频的同时动手练习，不以看完课程代替实际操作
2. 调试与验证：电控要求串口、逻辑分析仪调试及系统故障排查；硬件要求完成设计、打样和调试
3. 测试与迭代：机械要求规范测试流程、参与机器人迭代；视觉要求软件工程思维和程序保护
4. 协作与留痕：电控要求代码规范、注释与文档沉淀；视觉涉及与电控进行串口协作

六、与各组培养路线的关系

AI、视觉：联合培训已明确安排计算机基础、Git、Ubuntu、Python、C++，之后分别进入 ROS 2／导航、视觉算法等专项学习。
电控：以 C 语言、Git 和调试习惯为基础，进一步学习 STM32、通信协议、控制算法等。
硬件：与电控均涉及 STM32，硬件专项仍以电路设计、PCB、打样与调试为主。硬件原文提到“学习全部软件组内容”，但未明确“软件组”范围，此处不自行扩展为通用必修。
机械：沿用 SolidWorks、标准件、材料工艺、传动与结构设计等专项路线；工程实践强调测试和迭代，不强制套用软件方向的语言课程。
算法：目前没有独立、明确标注的原始培训路线，暂不补写。

原 AI 与视觉联合培训中的周次、日期和阶段考核安排，仍保留在原文件中，本资料不重新设定全组统一进度或考核。`,
  },
  {
    id: "electrical",
    label: "电控",
    text: `普通正式队员培训路线（电控）

初级培训（时间：招新结束到校内赛开始前）

1. 熟练掌握 C 语言（指针、结构体、内存管理、位运算）
2. 掌握基于 STM32 单片机编程（GPIO、定时器、中断、PWM、ADC、DMA）
3. 熟悉常用通信协议：UART、SPI、I2C、CAN
4. 熟悉常用硬件模块的功能与使用方法
5. 了解底盘运动原理与控制
6. 掌握电机驱动与开环控制
7. 初步掌握 PID 闭环控制原理与基础参数调试
8. 入门 FreeRTOS 实时操作系统（任务创建、延时调度）
9. 养成工程习惯：代码规范、注释、Git 版本管理、串口 / 逻辑分析仪调试

冬令营期间培训课

1. 软件架构进阶：分层模块化设计（驱动层／中间层／应用层）
2. FreeRTOS 进阶：多任务调度、信号量、消息队列、互斥锁

中级培训（时间：校内赛结束到夏令营）

1. 底盘运动学解算与闭环控制
2. 机器人系统姿态控制
3. 发射结构控制：摩擦轮转速控制、拨盘／弹舱供弹逻辑与联动
4. PID 参数整定方法与系统响应调试
5. 整车联调与简单故障排查

高级培训（时间：夏令营到正式队员考核）

1. 熟悉裁判系统各模块的功能与使用方法
2. 独立负责一个模块或车组的完整开发与维护
3. 系统稳定性与鲁棒性优化（异常保护、看门狗、通信容错）
4. 代码规范化与文档沉淀：模块文档、经验总结`,
  },
  {
    id: "hardware",
    label: "硬件",
    text: `普通正式队员培训路线（硬件）

初级培训（硬件扫盲后半个月）

1. 熟悉嘉立创软件，学习软件的使用方法，原理图与pcb的绘制
2. dcdc模块设计与调试
3. stm32最小系统板设计与调试

中级培训（初级结束后到冬令营）

1. 独立完成校内赛小车主控板设计并调试

高级培训（冬令营后到分区赛前）

1. 复刻开源项目，了解电路原理和布局布线
2. 独立负责一个小项目的硬件设计，完成完整设计，打样，调试过程

硬件组学习全部软件组内容`,
  },
  {
    id: "joint",
    label: "AI 与视觉联合",
    text: `AI与视觉联合培训路线
AI视觉 与 TARS_Go｜ 2026—2027学年秋季学期

一、培训目标

本期培训面向新队员，目标是让每一位队员在学期中点前具备进入方向组正式培养所需的基础能力，进度快的可以联系学长：

1. 掌握电脑通识：建立对计算机的基本了解，包括硬件组成（CPU、内存、硬盘、主板、显卡等）、操作系统概念、文件管理与软件安装、计算机网络基础常识，为后续开发学习扫清障碍。
2. 掌握Git与GitHub：能够使用Git进行版本管理，并通过GitHub完成代码托管与团队协作，养成规范的提交习惯。
3. 掌握Linux（Ubuntu）基础：能够独立安装并日常使用Ubuntu系统，熟练操作常用命令，具备基本的开发环境搭建能力。
4. 掌握Python基础：掌握Python语法、数据结构、函数与面向对象编程，能够独立编写处理实际问题的脚本。
5. 掌握C++基础：掌握C++基本语法、指针引用与面向对象编程，了解STL常用容器。

二、培训内容与视频资源

以下视频均来自B站，按模块推荐。视频用于建立概念，务必边看边动手练习，重点在操作，而非刷完课时。

模块一：电脑通识（计算机基础）
学习内容：计算机硬件组成（CPU、内存、硬盘、主板、显卡等）、操作系统概念与文件管理、软件安装
推荐视频（B站）：BV15i9UBhEZ2、BV1UwPgziE3F

模块二：GitHub
学习内容：Git安装与配置、本地仓库、提交与回退、分支与合并、远程仓库与SSH、团队协作流程
推荐视频（B站）：BV1Y8aL6SEit、BV1LwHv6LEYz

模块三：Linux（Ubuntu）
学习内容：Ubuntu安装、常用命令、文件与权限
推荐视频（B站）：BV1cq421w72c、BV1Cc41127B9

模块四：Python
学习内容：语法基础、数据类型、流程控制、函数、类与对象、文件操作、常用第三方库
推荐视频（B站）：BV1rpWjevEip

模块五：C++
学习内容：基础语法、指针与引用、面向对象（类、继承、多态）、STL常用容器
推荐视频（B站）：BV1Dk4y1j7oj

三、时间节点规划

为主视频自学与练习，各周任务环环相扣，建议按周推进，不要积压。

第1-2周（10月8日—10月18日）
主题：电脑通识与GitHub
自学任务：观看计算机基础课程视频，认识电脑硬件与软件构成观看Git与GitHub入门视频，按视频完成环境安装与实操
阶段考核：截图上传github主页

第3周（10月19日—10月25日）
主题：Linux（Ubuntu）
自学任务：观看Ubuntu教程，完成Ubuntu安装
阶段考核：截图上传ubuntu系统界面

第4-5周（10月26日—11月8日）
主题：Python
自学任务：观看Python入门教程
阶段考核：？？？

第6-7周（11月9日—11月22日）
主题：C++
自学任务：观看C++教程
阶段考核：？？？`,
  },
  {
    id: "vision",
    label: "视觉",
    text: `视觉组培训路线

分流阶段：

1. 学习进阶c++知识，包括class，template，lamda，stl容器
2. 初步掌握opencv的使用
3. 初步理解神经网络

冬令营阶段：

1. 掌握多线程调度与线程间通信
2. 尝试写串口与电控合作

下学期：

1. 理解简单的滤波算法
2. 深入了解linux系统
3. 进一步学习深度网络和控制算法

夏令营：

1. 了解学习自瞄系统结构
2. 理解软件工程思维，能够给程序增加适量保护
3. 完成简单自瞄并上车`,
  },
  {
    id: "ai",
    label: "AI",
    text: `分流后，在学习过cpp 和 python的语言基础之后 学习ros2 的知识 并且学习现有哨兵框架的使用和导航栈各个模块的内容以及使用（比如什么是里程计规划器等）

校内赛后了解现有代码的核心算法是什么 优势劣势都分别是什么 了解卡尔曼滤波及各种变种 因子图 决策树 pid mpc 点云聚类等 再根据这些算法的内容做优化`,
  },
  {
    id: "mechanical",
    label: "机械",
    text: `普通正式队员培训路线（机械）

初级培训（时间：招新结束到校内赛开始前）

1. 熟练掌握solidworks软件零件部分功能
2. 熟练掌握solidworks装配体功能
3. 认识RM常用标准件并能熟练使用工具
4. 了解常用材料及工艺（碳板，玻纤板，铝合金，铝方管，3D打印及材料，基础CNC工艺了解）
5. 认识常用轴承类型以及掌握基本轴系设计
6. 能够初步设计三大传动结构
7. 掌握队内雕刻机使用方法
8. 熟悉一定电路知识，能够协助电控布线
9. 掌握基本电机知识，能够初步选型电机

冬令营期间培训课

1. 进阶零件设计（轻量化，控制成本，灌输一定理论力学，材料力学知识）
2. 机器人系统化机械结构设计（底盘，云台，发射，拨弹及输弹系统，从工况以及需求出发，整体规划机器人机械方案选型，从能做到会做思维转变）

中级培训（时间：校内赛结束到夏令营）

1. 掌握一定静力学仿真能力，对零件进行加以校核（强度及刚度），能够对零件进行拓扑优化
2. 能够自主设计机器人部分模块（要能达到加工程度）
3. 规范测试流程，形成测试习惯。
4. 参与该赛季机器人迭代，测试过程。

高级培训（时间：夏令营到正式队员考核）

1. 优化上个赛季机器人图纸
2. 养成测试流程与机器人迭代闭环思维
3. 自主设计一台所在兵种机器人`,
  },
] as const;

const defaultMarkdown: Record<string, string> = {
  welcome: "# 写给刚刚来到这里的你\n",
  team: "# 认识吉甲大师\n",
  growth: "# 你将在这里经历什么\n",
  directions: "# 找到适合自己的方向\n",
  start: startMarkdown,
  together: "# 学习不是一个人的事情\n",
  continue: "# 从这里继续出发\n",
  git: gitMarkdown,
};

function headingId(title: string) {
  return title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = isValidElement<{ children?: ReactNode }>(children) ? children.props.children : children;
  const value = String(code ?? "").replace(/\n$/, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return <div className="training-docs__code">
    <div className="training-docs__code-bar">
      <span>命令 / 示例</span>
      <button type="button" onClick={() => void copy()}>{copied ? "已复制" : "复制"}</button>
    </div>
    <pre><code>{value}</code></pre>
  </div>;
}

function DocumentationArticle({ source, title }: { source: string; title: string }) {
  const components: Components = {
    h2: ({ children }) => <h2 id={headingId(String(children))}>{children}</h2>,
    h3: ({ children }) => <h3 id={headingId(String(children))}>{children}</h3>,
    a: ({ href, children }) => href?.startsWith("?")
      ? <Link to={href}>{children}</Link>
      : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ src, alt }) => <img src={src} alt={alt ?? ""} loading="lazy" />,
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  };

  return <div className="training-docs__markdown">
    <h1>{title}</h1>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>{source.replace(/^# [^\n]*(?:\n|$)/, "")}</ReactMarkdown>
  </div>;
}

export default function TrainingMaterialsPage() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const canEdit = currentUser.role.name === "super_admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [tree, setTree] = useState<TrainingNode[]>([]);
  const [treeError, setTreeError] = useState("");
  const [treeRevision, setTreeRevision] = useState(0);
  const [documentCache, setDocumentCache] = useState<Record<string, { body: string; error?: string }>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [uploads, setUploads] = useState<CommunityPendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [leftNavigationOpen, setLeftNavigationOpen] = useState(true);
  const [rightContentsOpen, setRightContentsOpen] = useState(true);
  const flushRef = useRef<() => string>(() => "");
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ nodes: TrainingNode[] }>("/api/training-documents/tree", { signal: controller.signal })
      .then(({ nodes }) => { setTree(nodes); setTreeError(""); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setTreeError(error instanceof Error ? error.message : "目录加载失败");
      });
    return () => controller.abort();
  }, [treeRevision]);

  const selectedNode = tree.find((node) =>
    node.kind === "reference" ? searchParams.get("group") === node.ref && searchParams.has("group")
      : node.kind === "document" && !searchParams.has("group") && node.id === (searchParams.get("doc") ?? "welcome")
  ) ?? (searchParams.has("group") || searchParams.has("doc") ? undefined : tree.find(({ id }) => id === "welcome"));
  const selectedMaterial = selectedNode?.kind === "reference"
    ? materials.find(({ id }) => id === selectedNode.ref) : undefined;
  const selectedDocument = selectedNode?.kind === "document"
    ? { id: selectedNode.id, markdown: defaultMarkdown[selectedNode.id] ?? `# ${selectedNode.title}\n` }
    : undefined;
  const selectedKey = selectedNode?.id ?? "";
  const documentSlug = selectedDocument?.id;
  const documentRecord = documentSlug ? documentCache[documentSlug] : undefined;
  useEffect(() => {
    if (!documentSlug || documentCache[documentSlug]) return;
    const controller = new AbortController();
    apiRequest<{ body: string }>(`/api/training-documents/${documentSlug}`, { signal: controller.signal })
      .then(({ body }) => setDocumentCache((cache) => ({ ...cache, [documentSlug]: { body } }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDocumentCache((cache) => ({
            ...cache,
            [documentSlug]: { body: "", error: error instanceof Error ? error.message : "文档加载失败" },
          }));
        }
      });
    return () => controller.abort();
  }, [documentSlug, documentCache]);

  useEffect(() => {
    setEditing(false);
    setUploads([]);
    setSaveError("");
  }, [selectedKey]);

  const documentSource = selectedDocument && documentRecord && !documentRecord.error
    ? documentRecord.body || selectedDocument.markdown : null;

  function confirmLeave() {
    return !editing || (draft === documentSource && uploads.length === 0) || window.confirm("有未保存的修改，确定离开吗？");
  }

  function beginEdit() {
    if (documentSource === null) return;
    setDraft(documentSource);
    setUploads([]);
    setSaveError("");
    setEditing(true);
  }

  async function saveDocument() {
    if (!selectedDocument || saving) return;
    const markdown = flushRef.current();
    const form = new FormData();
    form.set("body", markdown);
    form.set("uploadTokens", JSON.stringify(uploads.map(({ token }) => token)));
    uploads.forEach(({ file }) => form.append("files", file, file.name));
    setSaving(true);
    setSaveError("");
    try {
      const saved = await apiRequest<{ body: string }>(`/api/admin/training-documents/${selectedDocument.id}`, { method: "PUT", body: form });
      setDocumentCache((cache) => ({ ...cache, [selectedDocument.id]: { body: saved.body } }));
      setEditing(false);
      setUploads([]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const orderedPages = orderedTrainingNodes(tree).map(({ node }) => node).filter((node) => node.kind !== "folder");
  const activeIndex = orderedPages.findIndex(({ id }) => id === selectedKey);
  const before = orderedPages[activeIndex - 1];
  const after = orderedPages[activeIndex + 1];
  const sections = selectedDocument
    ? Array.from((editing ? draft : documentSource ?? selectedDocument.markdown).matchAll(/^## (.+)$/gm), ([, title]) => ({ title, id: headingId(title) }))
    : [];

  return <section className="training-docs admin-design mx-auto w-full max-w-[84rem] p-4 sm:p-6" aria-label="新人培养文档">
    <header className="training-docs__top">新人培养文档</header>
    <label className="training-docs__mobile-picker">
      <span>选择章节</span>
      <select
        value={selectedKey}
        onChange={(event) => {
          if (!confirmLeave()) return;
          const node = tree.find(({ id }) => id === event.target.value);
          if (node && node.kind !== "folder") {
            setSearchParams(node.kind === "reference" ? { group: node.ref ?? "" } : { doc: node.id });
          }
        }}
      >
        {orderedTrainingNodes(tree).map(({ node, depth }) => <option key={node.id} value={node.id} disabled={node.kind === "folder"}>
          {"　".repeat(depth)}{node.title}
        </option>)}
      </select>
    </label>
    <div className={`training-docs__layout${leftNavigationOpen ? "" : " is-left-collapsed"}${rightContentsOpen ? "" : " is-right-collapsed"}${sections.length ? "" : " is-toc-empty"}`}>
      <aside className="training-docs__sidebar" aria-label="文档导航">
        <div className="training-docs__sidebar-control">
          <button type="button" onClick={() => setLeftNavigationOpen((open) => !open)}
            aria-label={leftNavigationOpen ? "收起文档目录" : "展开文档目录"}
            title={leftNavigationOpen ? "收起文档目录" : "展开文档目录"}
            aria-expanded={leftNavigationOpen}>{leftNavigationOpen ? "‹" : "›"}</button>
        </div>
        <div className="training-docs__sidebar-body" aria-hidden={!leftNavigationOpen} inert={!leftNavigationOpen}>
          <TrainingDocumentTree
            nodes={tree}
            selectedId={selectedKey}
            canEdit={canEdit}
            onTreeChange={setTree}
            canNavigate={confirmLeave}
          />
        </div>
        {treeError ? <div className="training-docs__tree-error" role="alert">
          {treeError}
          <button type="button" onClick={() => setTreeRevision((value) => value + 1)}>重试</button>
        </div> : null}
      </aside>
      <article className="training-docs__article">
        {canEdit && selectedDocument && documentSource !== null ? <div className="training-docs__article-header">
          <div className="training-docs__actions">
            {editing ? <>
              <button type="button" onClick={() => { setEditing(false); setUploads([]); setSaveError(""); }} disabled={saving}>取消</button>
              <button type="button" className="training-docs__save" onClick={() => void saveDocument()} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
            </> : <button type="button" onClick={beginEdit}>编辑</button>}
          </div>
        </div> : null}
        {selectedMaterial
          ? <>
            <h1>{selectedNode?.title ?? selectedMaterial.label}</h1>
            <pre className="training-docs__original">{selectedMaterial.text}</pre>
          </>
          : treeError
            ? <p className="training-docs__status" role="alert">{treeError}</p>
            : !selectedDocument
              ? tree.length ? <p className="training-docs__status" role="status">文档不存在</p> : <div className="training-docs__placeholder" aria-label="正在加载文档" />
            : !documentRecord
              ? <div className="training-docs__placeholder" aria-label="正在加载文档">
                <h1>{selectedNode?.title}</h1>
                <span /><span />
              </div>
            : documentRecord.error
              ? <p className="training-docs__status" role="alert">{documentRecord.error}</p>
              : editing
                ? <section className="training-docs__editing" aria-label="编辑文档">
                  <CommunityMarkdownEditor
                    key={selectedDocument.id}
                    value={draft}
                    onChange={setDraft}
                    flushRef={flushRef}
                    uploads={uploads}
                    onUploadsChange={setUploads}
                    placeholder="编辑文档内容…"
                    disabled={saving}
                  />
                  {saveError ? <p className="training-docs__save-error" role="alert">{saveError}</p> : null}
                </section>
                : <DocumentationArticle source={documentSource ?? selectedDocument.markdown} title={selectedNode?.title ?? ""} />}
        <nav className="training-docs__pagination" aria-label="相邻文档">
          {before ? <Link to={trainingNodeHref(before)} onClick={(event) => { if (!confirmLeave()) event.preventDefault(); }}>← {before.title}</Link> : <span />}
          {after ? <Link to={trainingNodeHref(after)} onClick={(event) => { if (!confirmLeave()) event.preventDefault(); }}>{after.title} →</Link> : <span />}
        </nav>
      </article>
      {sections.length ? <aside className="training-docs__toc" aria-label="本页目录">
        <div className="training-docs__toc-header">
          {rightContentsOpen ? <h2>本页目录</h2> : null}
          <button type="button" onClick={() => setRightContentsOpen((open) => !open)}
            aria-label={rightContentsOpen ? "收起本页目录" : "展开本页目录"}
            title={rightContentsOpen ? "收起本页目录" : "展开本页目录"}
            aria-expanded={rightContentsOpen}>{rightContentsOpen ? "›" : "‹"}</button>
        </div>
        {rightContentsOpen ? sections.map(({ title, id }) => <a key={id} href={`#${id}`}>{title}</a>) : null}
      </aside> : <div className="training-docs__toc" aria-hidden="true" />}
    </div>
  </section>;
}
