import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [gallery, setGallery] = useState<Array<{ src: string; alt: string; caption: string }>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  const activeImage = activeIndex !== null ? gallery[activeIndex] ?? null : null;

  const openLightbox = (clickedSrc: string, alt: string, caption: string, buttonEl: HTMLButtonElement) => {
    const buttons = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>(".community-markdown-image__open") ?? []);
    if (buttons.length > 0) {
      const items = buttons.map((btn) => ({
        src: btn.dataset.lightboxSrc ?? "",
        alt: btn.dataset.lightboxAlt ?? "",
        caption: btn.dataset.lightboxCaption ?? "",
      })).filter((item) => Boolean(item.src));
      const idx = Math.max(0, buttons.indexOf(buttonEl));
      setGallery(items.length ? items : [{ src: clickedSrc, alt, caption }]);
      setActiveIndex(items.length ? Math.min(idx, items.length - 1) : 0);
    } else {
      setGallery([{ src: clickedSrc, alt, caption }]);
      setActiveIndex(0);
    }
    setZoom(1);
  };

  useEffect(() => {
    if (activeIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveIndex(null);
      } else if (event.key === "ArrowLeft" && gallery.length > 1) {
        event.preventDefault();
        setActiveIndex((idx) => (idx === null ? null : (idx - 1 + gallery.length) % gallery.length));
        setZoom(1);
      } else if (event.key === "ArrowRight" && gallery.length > 1) {
        event.preventDefault();
        setActiveIndex((idx) => (idx === null ? null : (idx + 1) % gallery.length));
        setZoom(1);
      } else if (event.key === "0") {
        setZoom(1);
      } else if (event.key === "+" || event.key === "=") {
        setZoom((z) => Math.min(3, Number((z + 0.35).toFixed(2))));
      } else if (event.key === "-") {
        setZoom((z) => Math.max(1, Number((z - 0.35).toFixed(2))));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, gallery.length]);

  const components: Components = {
    a: ({ href, children, ...props }) => <a href={href} {...props} target={href && /^https?:/i.test(href) ? "_blank" : undefined} rel={href && /^https?:/i.test(href) ? "noreferrer noopener" : undefined}>{children}</a>,
    img: ({ src, alt, title }) => {
      const imageSrc = safeCommunityMarkdownUrl(src ?? "", allowBlobImages);
      if (!imageSrc) return null;
      const layout = decodeCommunityImageTitle(title);
      const caption = layout?.caption ?? (title && !title.startsWith("jijia-image:") ? title : "");
      return <span className={`community-markdown-image${layout ? ` is-${layout.align}` : ""}`} style={layout ? { width: `${layout.width}%` } : undefined}>
        <button
          type="button"
          className="community-markdown-image__open"
          data-lightbox-src={imageSrc}
          data-lightbox-alt={alt ?? ""}
          data-lightbox-caption={caption}
          onClick={(event) => openLightbox(imageSrc, alt ?? "", caption, event.currentTarget)}
          aria-label={caption || alt || "放大图片"}
        >
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
    <div ref={containerRef} className={`community-markdown ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml urlTransform={(url) => safeCommunityMarkdownUrl(url, allowBlobImages)}>{source}</ReactMarkdown>
    </div>
    {activeImage && activeIndex !== null ? (
      <div
        className="community-markdown-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={activeImage.caption || activeImage.alt || "图片预览"}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) < 4) return;
          setZoom((z) => {
            const next = z + (event.deltaY < 0 ? 0.25 : -0.25);
            return Math.min(3, Math.max(1, Number(next.toFixed(2))));
          });
        }}
      >
        <button type="button" className="community-markdown-lightbox__scrim" aria-label="关闭图片预览" onClick={() => setActiveIndex(null)} />
        <div className="community-markdown-lightbox__toolbar">
          {gallery.length > 1 ? <span className="community-markdown-lightbox__counter">{activeIndex + 1} / {gallery.length}</span> : null}
          <button
            type="button"
            className="community-markdown-lightbox__zoom"
            onClick={() => setZoom((z) => (z > 1.05 ? 1 : 1.75))}
            aria-label={zoom > 1.05 ? "还原图片比例" : "放大图片"}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="community-markdown-lightbox__close" aria-label="关闭图片预览" onClick={() => setActiveIndex(null)}>
            <CommunityIcon name="x" />
          </button>
        </div>
        {gallery.length > 1 ? (
          <>
            <button
              type="button"
              className="community-markdown-lightbox__nav community-markdown-lightbox__nav--prev"
              aria-label="上一张图片"
              onClick={() => {
                setActiveIndex((idx) => (idx === null ? null : (idx - 1 + gallery.length) % gallery.length));
                setZoom(1);
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className="community-markdown-lightbox__nav community-markdown-lightbox__nav--next"
              aria-label="下一张图片"
              onClick={() => {
                setActiveIndex((idx) => (idx === null ? null : (idx + 1) % gallery.length));
                setZoom(1);
              }}
            >
              ›
            </button>
          </>
        ) : null}
        <figure>
          <img
            src={activeImage.src}
            alt={activeImage.alt}
            className={zoom > 1.05 ? "is-zoomed" : ""}
            style={{ transform: `scale(${zoom})` }}
            onClick={() => setZoom((z) => (z > 1.05 ? 1 : 1.75))}
          />
          {activeImage.caption ? <figcaption>{activeImage.caption}</figcaption> : null}
        </figure>
      </div>
    ) : null}
  </>;
}
