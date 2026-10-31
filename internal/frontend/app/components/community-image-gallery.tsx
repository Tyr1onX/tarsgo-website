import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CommunityIcon } from "~/components/community-icons";
import type { CommunityAttachment } from "~/lib/community-client";

export function CommunityImageGallery({
  attachments,
  compact = false,
}: {
  attachments: CommunityAttachment[];
  compact?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const wasOpenRef = useRef(false);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    if (activeIndex < 0) {
      if (wasOpenRef.current) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveIndex(-1);
      if (event.key === "ArrowLeft") setActiveIndex((activeIndexRef.current + attachments.length - 1) % attachments.length);
      if (event.key === "ArrowRight") setActiveIndex((activeIndexRef.current + 1) % attachments.length);
      if (event.key === "Tab") {
        const controls = Array.from(document.querySelectorAll<HTMLElement>(".community-image-viewer button:not(:disabled)"));
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex >= 0, attachments.length]);

  if (!attachments.length) return null;
  const visibleAttachments = compact ? attachments.slice(0, 4) : attachments;
  const activeAttachment = attachments[activeIndex];

  return <>
    <div className={`community-image-gallery${compact ? " community-image-gallery--compact" : ""}`} role="group" aria-label={`共 ${attachments.length} 张图片`}>
      {visibleAttachments.map((attachment, index) => <button
        type="button"
        className="community-image-gallery__thumb"
        key={attachment.id}
        aria-label={`查看图片 ${index + 1}：${attachment.fileName}`}
        onClick={(event) => { triggerRef.current = event.currentTarget; setActiveIndex(index); }}
      >
        <img src={attachment.url} alt={attachment.fileName} loading="lazy" />
        {compact && index === visibleAttachments.length - 1 && attachments.length > visibleAttachments.length ? <span className="community-image-gallery__more">还有 {attachments.length - visibleAttachments.length} 张</span> : null}
      </button>)}
    </div>
    {activeAttachment && typeof document !== "undefined" ? createPortal(<div className="community-image-viewer" role="dialog" aria-modal="true" aria-label="图片预览" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveIndex(-1); }}>
      <button ref={closeRef} type="button" className="community-image-viewer__close" aria-label="关闭图片预览" onClick={() => setActiveIndex(-1)}><CommunityIcon name="x" /></button>
      {attachments.length > 1 ? <button type="button" className="community-image-viewer__step community-image-viewer__step--previous" aria-label="上一张图片" onClick={() => setActiveIndex((index) => (index + attachments.length - 1) % attachments.length)}><CommunityIcon name="chevronLeft" /></button> : null}
      <figure className="community-image-viewer__figure">
        <img src={activeAttachment.url} alt={activeAttachment.fileName} />
        <figcaption>{activeAttachment.fileName} · {activeIndex + 1}/{attachments.length}</figcaption>
      </figure>
      {attachments.length > 1 ? <button type="button" className="community-image-viewer__step community-image-viewer__step--next" aria-label="下一张图片" onClick={() => setActiveIndex((index) => (index + 1) % attachments.length)}><CommunityIcon name="chevronRight" /></button> : null}
    </div>, document.body) : null}
  </>;
}
