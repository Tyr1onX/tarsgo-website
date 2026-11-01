import { useEffect, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from "react";
import { Icon, type IconifyIcon } from "@iconify/react";
import boldIcon from "@iconify-icons/lucide/bold";
import italicIcon from "@iconify-icons/lucide/italic";
import strikethroughIcon from "@iconify-icons/lucide/strikethrough";
import codeIcon from "@iconify-icons/lucide/code";
import listIcon from "@iconify-icons/lucide/list";
import orderedListIcon from "@iconify-icons/lucide/list-ordered";
import taskListIcon from "@iconify-icons/lucide/list-todo";
import quoteIcon from "@iconify-icons/lucide/quote";
import codeBlockIcon from "@iconify-icons/lucide/square-code";
import tableIcon from "@iconify-icons/lucide/table";
import ruleIcon from "@iconify-icons/lucide/separator-horizontal";
import undoIcon from "@iconify-icons/lucide/undo-2";
import redoIcon from "@iconify-icons/lucide/redo-2";
import linkIcon from "@iconify-icons/lucide/link";
import imageSettingsIcon from "@iconify-icons/lucide/image-plus";
import { Crepe } from "@milkdown/crepe";
import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { NodeSelection } from "@milkdown/kit/prose/state";
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  hrSchema,
  imageSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  selectTextNearPosCommand,
  setBlockTypeCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { createTable, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { getMarkdown, insert } from "@milkdown/kit/utils";

import { CommunityIcon } from "~/components/community-icons";
import { CommunityMarkdown } from "~/components/community-markdown";
import { validateCommunityImages, type CommunityAttachment } from "~/lib/community-client";
import { encodeCommunityImageTitle, type CommunityImageLayout } from "~/lib/community-markdown";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./community-markdown-editor.css";

const UPLOAD_PREFIX = "community-upload://";

export type CommunityPendingImage = { token: string; file: File };

type ToolName = "bold" | "italic" | "strike" | "inlineCode" | "bullets" | "numbers" | "tasks" | "quote" | "code" | "table" | "rule" | "undo" | "redo";
const toolIcons: Record<ToolName | "link" | "imageSettings", IconifyIcon> = {
  bold: boldIcon, italic: italicIcon, strike: strikethroughIcon, inlineCode: codeIcon,
  bullets: listIcon, numbers: orderedListIcon, tasks: taskListIcon, quote: quoteIcon,
  code: codeBlockIcon, table: tableIcon, rule: ruleIcon, undo: undoIcon, redo: redoIcon,
  link: linkIcon, imageSettings: imageSettingsIcon,
};

function newToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function normalizePendingImages(markdown: string, urls: Map<string, string>) {
  let value = markdown;
  for (const [url, token] of urls) value = value.replaceAll(url, `${UPLOAD_PREFIX}${token}`);
  return value;
}

function restorePendingImages(markdown: string, uploads: CommunityPendingImage[], tokenUrls: Map<string, string>, urlTokens: Map<string, string>) {
  let value = markdown;
  for (const upload of uploads) {
    if (!upload.token) continue;
    let url = tokenUrls.get(upload.token);
    if (!url) {
      url = URL.createObjectURL(upload.file);
      tokenUrls.set(upload.token, url);
      urlTokens.set(url, upload.token);
    }
    value = value.replaceAll(`${UPLOAD_PREFIX}${upload.token}`, url);
  }
  return value;
}

function selectionTextArea(textarea: HTMLTextAreaElement, prefix: string, suffix = "", block = false) {
  const { value, selectionStart, selectionEnd } = textarea;
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);
  const leading = block && before && !before.endsWith("\n") ? "\n" : "";
  const trailing = block && after && !after.startsWith("\n") ? "\n" : "";
  const insert = `${leading}${prefix}${selected || (suffix ? "文本" : "")}${suffix}${trailing}`;
  const next = `${before}${insert}${after}`;
  const cursor = before.length + leading.length + prefix.length + (selected ? selected.length : suffix ? 2 : 0);
  return { value: next, start: cursor, end: cursor };
}

function ToolbarIcon({ name }: { name: ToolName | "image" | "link" | "imageSettings" }) {
  if (name === "image") return <CommunityIcon name="image" />;
  return <Icon icon={toolIcons[name]} className="community-editor-svg" aria-hidden="true" />;
}

function ToolbarButton({ label, name, onClick, disabled = false }: { label: string; name: ToolName | "image" | "link" | "imageSettings"; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="community-editor-toolbar__button" aria-label={label} title={label} onClick={onClick} disabled={disabled}><ToolbarIcon name={name} /></button>;
}

export function CommunityMarkdownEditor({
  value,
  onChange,
  uploads,
  onUploadsChange,
  attachments = [],
  required = false,
  disabled = false,
  compact = false,
  placeholder = "分享过程、问题或进展…",
}: {
  value: string;
  onChange: (value: string) => void;
  uploads: CommunityPendingImage[];
  onUploadsChange: (uploads: CommunityPendingImage[]) => void;
  attachments?: CommunityAttachment[];
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<Crepe | null>(null);
  const selectedImagePositionRef = useRef<number | null>(null);
  const currentValueRef = useRef(value);
  const uploadsRef = useRef(uploads);
  const urlTokensRef = useRef(new Map<string, string>());
  const tokenUrlsRef = useRef(new Map<string, string>());
  const sourceHistoryRef = useRef<string[]>([]);
  const sourceRedoRef = useRef<string[]>([]);
  const [mode, setMode] = useState<"rich" | "markdown">("rich");
  const [sourcePanel, setSourcePanel] = useState<"edit" | "preview">("edit");
  const [imageError, setImageError] = useState("");
  const [linkDialog, setLinkDialog] = useState(false);
  const [linkHref, setLinkHref] = useState("https://");
  const [linkText, setLinkText] = useState("");
  const [imageDialog, setImageDialog] = useState(false);
  const [imageAttrs, setImageAttrs] = useState({ alt: "", caption: "", width: 100 as CommunityImageLayout["width"], align: "center" as CommunityImageLayout["align"] });
  const [hasSelectedImage, setHasSelectedImage] = useState(false);

  currentValueRef.current = value;
  uploadsRef.current = uploads;

  useEffect(() => {
    if (mode !== "rich" || !rootRef.current) return;
    let live = true;
    let initialized = false;
    const initialValue = restorePendingImages(value, uploads, tokenUrlsRef.current, urlTokensRef.current);
    const editor = new Crepe({
      root: rootRef.current,
      defaultValue: initialValue,
      features: {
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.ListItem]: true,
      },
      featureConfigs: { [Crepe.Feature.Placeholder]: { text: placeholder, mode: "block" } },
    });
    editor.editor.config((ctx) => ctx.update(uploadConfig.key, (previous) => ({
      ...previous,
      uploader: async (files, schema) => {
        const nodes = [];
        for (let index = 0; index < files.length; index++) {
          const file = files.item(index);
          if (!file || !file.type.startsWith("image/")) continue;
          try {
            const url = addUpload(file);
            const image = schema.nodes.image?.createAndFill({ src: url, alt: file.name, title: "" });
            if (image) nodes.push(image);
          } catch { /* The inline error explains why this image could not be added. */ }
        }
        return nodes;
      },
    })));
    editor.on((listener) => listener.markdownUpdated((_ctx, markdown) => {
      const normalized = normalizePendingImages(markdown, urlTokensRef.current);
      notifyChange(normalized);
      refreshSelectedImage(editor);
    }));
    void editor.create().then(() => {
      if (!live) {
        void editor.destroy();
        return;
      }
      initialized = true;
      editorRef.current = editor;
      refreshSelectedImage(editor);
    }).catch(() => {
      if (live) setImageError("编辑器暂时无法启动，请切换到 Markdown 模式继续编辑。 ");
    });
    return () => {
      live = false;
      if (editorRef.current === editor) editorRef.current = null;
      if (initialized) void editor.destroy();
    };
  // Rich editor is recreated only when switching modes or changing its instructional placeholder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => () => {
    for (const url of tokenUrlsRef.current.values()) URL.revokeObjectURL(url);
    tokenUrlsRef.current.clear();
    urlTokensRef.current.clear();
  }, []);

  function notifyChange(next: string) {
    currentValueRef.current = next;
    onChange(next);
    const used = new Set(Array.from(next.matchAll(/community-upload:\/\/([A-Za-z0-9_-]{16,64})/g), (match) => match[1]));
    const remaining = uploadsRef.current.filter((upload) => !upload.token || used.has(upload.token));
    if (remaining.length !== uploadsRef.current.length) {
      const remainingTokens = new Set(remaining.map((upload) => upload.token));
      for (const [token, url] of tokenUrlsRef.current) {
        if (!remainingTokens.has(token)) {
          URL.revokeObjectURL(url);
          tokenUrlsRef.current.delete(token);
          urlTokensRef.current.delete(url);
        }
      }
      uploadsRef.current = remaining;
      onUploadsChange(remaining);
    }
  }

  function changeMode(nextMode: "rich" | "markdown") {
    if (nextMode === "markdown" && editorRef.current) {
      const markdown = editorRef.current.editor.action(getMarkdown());
      notifyChange(normalizePendingImages(markdown, urlTokensRef.current));
    }
    setMode(nextMode);
  }

  function addUpload(file: File) {
    const nextUploads = [...uploadsRef.current, { token: newToken(), file }];
    const validationError = validateCommunityImages(nextUploads.map((item) => item.file));
    if (validationError) {
      setImageError(validationError);
      throw new Error(validationError);
    }
    const upload = nextUploads.at(-1)!;
    const url = URL.createObjectURL(file);
    tokenUrlsRef.current.set(upload.token, url);
    urlTokensRef.current.set(url, upload.token);
    uploadsRef.current = nextUploads;
    onUploadsChange(nextUploads);
    setImageError("");
    return url;
  }

  function refreshSelectedImage(editor: Crepe) {
    editor.editor.action((ctx) => {
      const selection = ctx.get(editorViewCtx).state.selection;
      const node = selection instanceof NodeSelection ? selection.node : null;
      const selected = node?.type === imageSchema.type(ctx);
      selectedImagePositionRef.current = selected && selection instanceof NodeSelection ? selection.from : null;
      setHasSelectedImage(Boolean(selected));
    });
  }

  function selectImage(target: EventTarget | null) {
    const editor = editorRef.current;
    if (!editor || !(target instanceof HTMLImageElement) || target.classList.contains("ProseMirror-separator")) return;
    editor.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const imageType = imageSchema.type(ctx);
      const imagePositions: number[] = [];
      const source = target.getAttribute("src");
      view.state.doc.descendants((node, position) => {
        if (node.type === imageType && node.attrs.src === source) {
          imagePositions.push(position);
          return false;
        }
        return true;
      });
      if (!imagePositions.length) {
        selectedImagePositionRef.current = null;
        setHasSelectedImage(false);
        return;
      }
      selectedImagePositionRef.current = imagePositions[0];
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePositions[0])));
      view.focus();
      setHasSelectedImage(true);
    });
  }

  function runCommand(command: (ctx: Ctx) => void) {
    const editor = editorRef.current;
    if (editor) editor.editor.action(command);
  }

  function commandButton(action: "bold" | "italic" | "strike" | "inlineCode" | "bullets" | "numbers" | "tasks" | "quote" | "code" | "table" | "rule" | "undo" | "redo") {
    const commandMap = {
      bold: () => runCommand((ctx) => ctx.get(commandsCtx).call(toggleStrongCommand.key)),
      italic: () => runCommand((ctx) => ctx.get(commandsCtx).call(toggleEmphasisCommand.key)),
      strike: () => runCommand((ctx) => ctx.get(commandsCtx).call(toggleStrikethroughCommand.key)),
      inlineCode: () => runCommand((ctx) => ctx.get(commandsCtx).call(toggleInlineCodeCommand.key)),
      bullets: () => runCommand((ctx) => ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, { nodeType: bulletListSchema.type(ctx) })),
      numbers: () => runCommand((ctx) => ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, { nodeType: orderedListSchema.type(ctx) })),
      tasks: () => runCommand((ctx) => ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, { nodeType: listItemSchema.type(ctx), attrs: { checked: false } })),
      quote: () => runCommand((ctx) => ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, { nodeType: blockquoteSchema.type(ctx) })),
      code: () => runCommand((ctx) => ctx.get(commandsCtx).call(setBlockTypeCommand.key, { nodeType: codeBlockSchema.type(ctx) })),
      table: () => runCommand((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from } = view.state.selection;
        ctx.get(commandsCtx).call(addBlockTypeCommand.key, { nodeType: createTable(ctx, 3, 3) });
        ctx.get(commandsCtx).call(selectTextNearPosCommand.key, { pos: from });
      }),
      rule: () => runCommand((ctx) => ctx.get(commandsCtx).call(addBlockTypeCommand.key, { nodeType: hrSchema.type(ctx) })),
      undo: () => runCommand((ctx) => ctx.get(commandsCtx).call(undoCommand.key)),
      redo: () => runCommand((ctx) => ctx.get(commandsCtx).call(redoCommand.key)),
    };
    commandMap[action]();
  }

  function changeHeading(level: string) {
    const value = !level || level === "paragraph" ? null : Number(level);
    runCommand((ctx) => ctx.get(commandsCtx).call(setBlockTypeCommand.key, { nodeType: value === null ? paragraphSchema.type(ctx) : headingSchema.type(ctx), attrs: value === null ? undefined : { level: value } }));
  }

  function insertMarkdownSource(prefix: string, suffix = "", block = false) {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const insertion = selectionTextArea(textarea, prefix, suffix, block);
    sourceHistoryRef.current.push(currentValueRef.current);
    sourceRedoRef.current = [];
    notifyChange(insertion.value);
    requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(insertion.start, insertion.end); });
  }

  function openLinkDialog() {
    const editor = editorRef.current;
    if (mode === "rich" && editor) {
      editor.editor.action((ctx) => {
        const { state } = ctx.get(editorViewCtx);
        const { from, to } = state.selection;
        setLinkText(state.doc.textBetween(from, to));
      });
    } else {
      const textarea = sourceRef.current;
      setLinkText(textarea?.value.slice(textarea.selectionStart, textarea.selectionEnd) ?? "");
    }
    setLinkHref("https://");
    setLinkDialog(true);
  }

  function applyLink() {
    const href = linkHref.trim();
    if (!/^(https?:\/\/|mailto:|\/)/i.test(href)) return;
    if (mode === "rich") {
      const editor = editorRef.current;
      if (!editor) return;
      editor.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from, to } = state.selection;
        if (from !== to) {
          view.dispatch(state.tr.addMark(from, to, state.schema.marks.link.create({ href })).scrollIntoView());
        } else {
          const text = linkText.trim() || href;
          const transaction = state.tr.insertText(text, from);
          transaction.addMark(from, from + text.length, state.schema.marks.link.create({ href }));
          view.dispatch(transaction.scrollIntoView());
        }
        view.focus();
      });
    } else {
      insertMarkdownSource(`[${linkText || href}](${href})`);
    }
    setLinkDialog(false);
  }

  function openImageSettings() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const position = selectedImagePositionRef.current;
      const node = position === null ? null : view.state.doc.nodeAt(position);
      if (!node || node.type !== imageSchema.type(ctx)) return;
      const title = typeof node.attrs.title === "string" ? node.attrs.title : "";
      const encoded = title.startsWith("jijia-image:") ? title.slice("jijia-image:".length).split(":") : [];
      const width = Number(encoded[0]);
      const align = encoded[1];
      let caption = "";
      try { caption = decodeURIComponent(encoded.slice(2).join(":")); } catch { caption = ""; }
      setImageAttrs({
        alt: String(node.attrs.alt ?? ""), caption,
        width: [25, 50, 75, 100].includes(width) ? width as CommunityImageLayout["width"] : 100,
        align: ["left", "center", "right"].includes(align) ? align as CommunityImageLayout["align"] : "center",
      });
      setImageDialog(true);
    });
  }

  function applyImageSettings() {
    const editor = editorRef.current;
    if (!editor) return;
    const position = selectedImagePositionRef.current;
    if (position !== null) {
      editor.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const node = view.state.doc.nodeAt(position);
        if (!node || node.type !== imageSchema.type(ctx)) return;
        view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, alt: imageAttrs.alt, title: encodeCommunityImageTitle(imageAttrs) }));
      });
      selectedImagePositionRef.current = position;
    }
    setImageDialog(false);
  }

  function insertMarkdownContent(markdown: string) {
    if (mode === "rich" && editorRef.current) editorRef.current.editor.action(insert(markdown, true));
    else insertMarkdownSource(markdown);
  }

  async function insertFile(file: File) {
    try {
      const url = addUpload(file);
      const token = urlTokensRef.current.get(url)!;
      const alt = file.name.replace(/\.[^.]+$/, "");
      if (mode === "rich" && editorRef.current) editorRef.current.editor.action(insert(`![${alt.replace(/[\]\[]/g, "\\$&")}](${url})`, true));
      else insertMarkdownSource(`![${alt.replace(/[\]\[]/g, "\\$&")}](${UPLOAD_PREFIX}${token})`);
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "图片无法加入正文");
    }
  }

  function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void insertFile(file);
  }

  function handleEditorDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (event.defaultPrevented || !event.dataTransfer.files.length) return;
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    const editor = editorRef.current;
    if (!editor) return;
    editor.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
      for (const file of files) {
        try {
          const url = addUpload(file);
          const image = imageSchema.type(ctx).createAndFill({ src: url, alt: file.name, title: "" });
          if (!image) continue;
          view.dispatch(view.state.tr.insert(position, image).scrollIntoView());
          position += image.nodeSize;
        } catch { /* The inline error explains why this image could not be added. */ }
      }
    });
  }

  function applySourceTool(action: ToolName) {
    const paired: Partial<Record<ToolName, [string, string]>> = {
      bold: ["**", "**"], italic: ["*", "*"], strike: ["~~", "~~"], inlineCode: ["`", "`"], code: ["```\n", "\n```"],
      bullets: ["- ", ""], numbers: ["1. ", ""], tasks: ["- [ ] ", ""], quote: ["> ", ""], rule: ["\n---\n", ""],
      table: ["| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |", ""],
    };
    if (action === "undo") {
      const previous = sourceHistoryRef.current.pop();
      if (previous !== undefined) { sourceRedoRef.current.push(currentValueRef.current); notifyChange(previous); }
      return;
    }
    if (action === "redo") {
      const next = sourceRedoRef.current.pop();
      if (next !== undefined) { sourceHistoryRef.current.push(currentValueRef.current); notifyChange(next); }
      return;
    }
    const [prefix, suffix] = paired[action] ?? ["", ""];
    insertMarkdownSource(prefix, suffix, ["bullets", "numbers", "tasks", "quote", "code"].includes(action));
  }

  function handleSourceChange(event: ChangeEvent<HTMLTextAreaElement>) {
    sourceHistoryRef.current.push(currentValueRef.current);
    if (sourceHistoryRef.current.length > 120) sourceHistoryRef.current.shift();
    sourceRedoRef.current = [];
    const next = event.currentTarget.value;
    let withTokens = next;
    for (const [url, token] of urlTokensRef.current) withTokens = withTokens.replaceAll(url, `${UPLOAD_PREFIX}${token}`);
    notifyChange(withTokens);
  }

  function editorToolbar() {
    const tools: Array<[ToolName, string]> = [["undo", "撤销"], ["redo", "重做"], ["bold", "加粗"], ["italic", "斜体"], ["strike", "删除线"], ["inlineCode", "行内代码"], ["bullets", "无序列表"], ["numbers", "有序列表"], ["tasks", "任务清单"], ["quote", "引用"], ["code", "代码块"], ["table", "插入表格"], ["rule", "分隔线"]];
    return <div className="community-editor-toolbar" role="toolbar" aria-label="Markdown 格式工具">
      <label className="community-editor-toolbar__heading"><span className="sr-only">段落样式</span><select aria-label="段落样式" defaultValue="paragraph" onChange={(event) => changeHeading(event.target.value)} disabled={disabled}><option value="paragraph">正文</option><option value="1">标题 1</option><option value="2">标题 2</option><option value="3">标题 3</option></select></label>
      {tools.map(([name, label], index) => <span className={`community-editor-toolbar__item${[2, 6, 10].includes(index) ? " has-divider" : ""}`} key={name}><ToolbarButton label={label} name={name} onClick={() => commandButton(name)} disabled={disabled} /></span>)}
      <span className="community-editor-toolbar__item has-divider"><ToolbarButton label="插入链接" name="link" onClick={openLinkDialog} disabled={disabled} /><ToolbarButton label="插入图片" name="image" onClick={() => imageInputRef.current?.click()} disabled={disabled} /></span>
      <ToolbarButton label="编辑选中图片" name="imageSettings" onClick={openImageSettings} disabled={disabled || !hasSelectedImage} />
      {attachments.length ? <details className="community-editor-attachments"><summary>插入附件</summary><div>{attachments.map((attachment) => <button key={attachment.id} type="button" onClick={() => insertMarkdownContent(`![${attachment.fileName}](${attachment.url})`)}>{attachment.fileName}</button>)}</div></details> : null}
    </div>;
  }

  const previewValue = restorePendingImages(value, uploads, tokenUrlsRef.current, urlTokensRef.current);
  const accept = "image/jpeg,image/png,image/gif,image/webp";

  return <div className={`community-markdown-editor${compact ? " is-compact" : ""}${disabled ? " is-disabled" : ""}`}>
    <div className="community-markdown-editor__topline">
      <div className="community-markdown-editor__modes" role="tablist" aria-label="编辑模式">
        <button type="button" role="tab" aria-selected={mode === "rich"} className={mode === "rich" ? "is-active" : ""} onClick={() => changeMode("rich")} disabled={disabled}>所见即所得</button>
        <button type="button" role="tab" aria-selected={mode === "markdown"} className={mode === "markdown" ? "is-active" : ""} onClick={() => changeMode("markdown")} disabled={disabled}>Markdown</button>
      </div>
      <span className="community-markdown-editor__hint">支持 Markdown · 图片可粘贴或拖入</span>
    </div>
    {mode === "rich" ? editorToolbar() : null}
    {mode === "rich" ? <div ref={rootRef} className="community-markdown-editor__surface" aria-label={placeholder} onMouseUp={() => { if (editorRef.current) refreshSelectedImage(editorRef.current); }} onKeyUp={() => { if (editorRef.current) refreshSelectedImage(editorRef.current); }} onClick={(event) => selectImage(event.target)} onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={handleEditorDrop} /> : <div className="community-markdown-source">
      <div className="community-markdown-source__tools" role="toolbar" aria-label="Markdown 格式工具">
        <label className="community-editor-toolbar__heading"><span className="sr-only">插入标题</span><select aria-label="插入标题" defaultValue="" onChange={(event) => { const level = Number(event.target.value); if (level) insertMarkdownSource(`${"#".repeat(level)} `, "", true); event.target.value = ""; }} disabled={disabled}><option value="" disabled>标题</option><option value="1">标题 1</option><option value="2">标题 2</option><option value="3">标题 3</option></select></label>
        {(["undo", "redo", "bold", "italic", "strike", "inlineCode", "bullets", "numbers", "tasks", "quote", "code", "table", "rule"] as ToolName[]).map((name) => <ToolbarButton key={name} label={({ undo: "撤销", redo: "重做", bold: "加粗", italic: "斜体", strike: "删除线", inlineCode: "行内代码", bullets: "无序列表", numbers: "有序列表", tasks: "任务清单", quote: "引用", code: "代码块", table: "插入表格", rule: "分隔线" } as Record<ToolName, string>)[name]} name={name} onClick={() => applySourceTool(name)} disabled={disabled} />)}
        <ToolbarButton label="插入链接" name="link" onClick={openLinkDialog} disabled={disabled} />
        <ToolbarButton label="插入图片" name="image" onClick={() => imageInputRef.current?.click()} disabled={disabled} />
      </div>
      <div className="community-markdown-source__panes">
        <div className={`community-markdown-source__edit${sourcePanel === "preview" ? " is-hidden-mobile" : ""}`}>
          <label className="sr-only" htmlFor="community-markdown-source-text">Markdown 正文</label>
          <textarea ref={sourceRef} id="community-markdown-source-text" value={value} onChange={handleSourceChange} onKeyDown={(event) => {
            const modifier = event.metaKey || event.ctrlKey;
            if (modifier && event.key.toLowerCase() === "b") { event.preventDefault(); applySourceTool("bold"); }
            else if (modifier && event.key.toLowerCase() === "i") { event.preventDefault(); applySourceTool("italic"); }
          }} maxLength={20000} placeholder={placeholder} required={required} disabled={disabled} />
        </div>
        <div className={`community-markdown-source__preview${sourcePanel === "edit" ? " is-hidden-mobile" : ""}`} aria-label="实时预览"><CommunityMarkdown source={previewValue} allowBlobImages /></div>
      </div>
      <div className="community-markdown-source__mobile-tabs"><button type="button" className={sourcePanel === "edit" ? "is-active" : ""} onClick={() => setSourcePanel("edit")}>编辑源码</button><button type="button" className={sourcePanel === "preview" ? "is-active" : ""} onClick={() => setSourcePanel("preview")}>效果预览</button></div>
    </div>}
    <input ref={imageInputRef} className="community-markdown-editor__file" type="file" accept={accept} onChange={handleImageSelection} tabIndex={-1} aria-hidden="true" />
    {imageError ? <p className="community-markdown-editor__error" role="alert">{imageError}</p> : null}
    <div className="community-markdown-editor__footer"><span>{uploads.length ? `正文图片 ${uploads.length}/5` : "图片将嵌入正文"}</span>{required && !value.trim() ? <span>请输入正文内容</span> : null}</div>
    {linkDialog ? <div className="community-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="community-link-dialog-title"><div role="group" aria-labelledby="community-link-dialog-title" onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); applyLink(); } }}><h3 id="community-link-dialog-title">插入链接</h3><label>链接文字<input value={linkText} onChange={(event) => setLinkText(event.target.value)} autoFocus /></label><label>链接地址<input value={linkHref} onChange={(event) => setLinkHref(event.target.value)} type="url" /></label><div><button type="button" onClick={() => setLinkDialog(false)}>取消</button><button type="button" className="community-button community-button--primary" onClick={applyLink}>插入链接</button></div></div></div> : null}
    {imageDialog ? <div className="community-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="community-image-dialog-title"><div role="group" aria-labelledby="community-image-dialog-title" onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); applyImageSettings(); } }}><h3 id="community-image-dialog-title">图片设置</h3><label>替代文本<input value={imageAttrs.alt} onChange={(event) => setImageAttrs({ ...imageAttrs, alt: event.target.value })} autoFocus /></label><label>图片说明<input value={imageAttrs.caption} onChange={(event) => setImageAttrs({ ...imageAttrs, caption: event.target.value })} /></label><label>显示宽度<select value={imageAttrs.width} onChange={(event) => setImageAttrs({ ...imageAttrs, width: Number(event.target.value) as CommunityImageLayout["width"] })}><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="100">适应正文</option></select></label><label>对齐方式<select value={imageAttrs.align} onChange={(event) => setImageAttrs({ ...imageAttrs, align: event.target.value as CommunityImageLayout["align"] })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><div><button type="button" onClick={() => setImageDialog(false)}>取消</button><button type="button" className="community-button community-button--primary" onClick={applyImageSettings}>保存图片</button></div></div></div> : null}
  </div>;
}
