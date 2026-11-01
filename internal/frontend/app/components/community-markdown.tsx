import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";

import { CommunityIcon } from "~/components/community-icons";
import { decodeCommunityImageTitle, safeCommunityMarkdownUrl } from "~/lib/community-markdown";

function childText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childText).join("");
  if (node && typeof node === "object" && "props" in node) return childText((node as { props?: { children?: ReactNode } }).props?.children);
  return "";
}

function highlightedCode(value: string, language: string) {
  if (language && hljs.getLanguage(language)) return hljs.highlight(value, { language, ignoreIllegals: true }).value;
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = Array.isArray(children) ? children[0] : children;
  const props = code && typeof code === "object" && "props" in code ? (code as { props?: { className?: string; children?: ReactNode } }).props : undefined;
  const value = childText(props?.children).replace(/\n$/, "");
  const language = props?.className?.match(/language-([\w+-]+)/)?.[1] ?? "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { setCopied(false); }
  }
  return <figure className="community-markdown-code">
    <button type="button" className="community-markdown-code__copy" onClick={() => void copy()} aria-label="复制代码">{copied ? "已复制" : "复制"}</button>
    {language ? <span className="community-markdown-code__language">{language}</span> : null}
    <pre><code className={language ? `hljs language-${language}` : "hljs"} dangerouslySetInnerHTML={{ __html: highlightedCode(value, language) }} /></pre>
  </figure>;
}

export function CommunityMarkdown({ source, className = "", allowBlobImages = false }: { source: string; className?: string; allowBlobImages?: boolean }) {
  const [activeImage, setActiveImage] = useState<{ src: string; alt: string; caption: string } | null>(null);

  useEffect(() => {
    if (!activeImage) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setActiveImage(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeImage]);

  const components: Components = {
    a: ({ href, children, ...props }) => <a href={href} {...props} target={href && /^https?:/i.test(href) ? "_blank" : undefined} rel={href && /^https?:/i.test(href) ? "noreferrer noopener" : undefined}>{children}</a>,
    img: ({ src, alt, title }) => {
      const imageSrc = safeCommunityMarkdownUrl(src ?? "", allowBlobImages);
      if (!imageSrc) return null;
      const layout = decodeCommunityImageTitle(title);
      const caption = layout?.caption ?? (title && !title.startsWith("jijia-image:") ? title : "");
      return <span className={`community-markdown-image${layout ? ` is-${layout.align}` : ""}`} style={layout ? { width: `${layout.width}%` } : undefined}>
        <button type="button" className="community-markdown-image__open" onClick={() => setActiveImage({ src: imageSrc, alt: alt ?? "", caption })} aria-label={caption || alt || "放大图片"}>
          <img src={imageSrc} alt={alt ?? ""} loading="lazy" />
        </button>
        {caption ? <span className="community-markdown-image__caption">{caption}</span> : null}
      </span>;
    },
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    code: ({ children, className: languageClass, ...props }) => <code className={languageClass} {...props}>{children}</code>,
    table: ({ children }) => <div className="community-markdown-table"><table>{children}</table></div>,
    input: ({ checked, ...props }) => <input {...props} checked={checked} readOnly aria-label={checked ? "已完成" : "未完成"} />,
  };

  return <>
    <div className={`community-markdown ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml urlTransform={(url) => safeCommunityMarkdownUrl(url, allowBlobImages)}>{source}</ReactMarkdown>
    </div>
    {activeImage ? <div className="community-markdown-lightbox" role="dialog" aria-modal="true" aria-label={activeImage.caption || activeImage.alt || "图片预览"}>
      <button type="button" className="community-markdown-lightbox__scrim" aria-label="关闭图片预览" onClick={() => setActiveImage(null)} />
      <button type="button" className="community-markdown-lightbox__close" aria-label="关闭图片预览" onClick={() => setActiveImage(null)}><CommunityIcon name="x" /></button>
      <figure><img src={activeImage.src} alt={activeImage.alt} />{activeImage.caption ? <figcaption>{activeImage.caption}</figcaption> : null}</figure>
    </div> : null}
  </>;
}
