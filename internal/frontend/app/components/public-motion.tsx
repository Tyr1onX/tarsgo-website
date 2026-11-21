import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./public-motion.css";

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`public-reveal${revealed ? " is-revealed" : ""}${className ? ` ${className}` : ""}`}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

export function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(target);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      setValue(target);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();
        const duration = 720;
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(step);
        };
        setValue(0);
        requestAnimationFrame(step);
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="public-counter">
      {value}
      {suffix}
    </span>
  );
}

export function useScrollSpy(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0] ?? "");
  const key = ids.join("|");

  useEffect(() => {
    if (!ids.length || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    setActiveId(ids[0] ?? "");
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-110px 0px -62% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return activeId;
}

export type PublicLightboxPhoto = {
  src: string;
  alt: string;
};

export function PublicPhotoLightbox({
  photos,
  activeIndex,
  onClose,
  onSelect,
}: {
  photos: readonly PublicLightboxPhoto[];
  activeIndex: number | null;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photo = activeIndex !== null ? photos[activeIndex] ?? null : null;

  useEffect(() => {
    setZoom(1);
  }, [activeIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (photo && !dialog.open) dialog.showModal();
    else if (!photo && dialog.open) dialog.close();
  }, [photo]);

  return (
    <dialog
      ref={dialogRef}
      className="public-lightbox"
      aria-label={photo?.alt || "图片预览"}
      onClose={onClose}
      onKeyDown={(event) => {
        if (activeIndex === null || !photo) return;
        if (event.key === "ArrowLeft" && photos.length > 1) {
          event.preventDefault();
          onSelect((activeIndex - 1 + photos.length) % photos.length);
        } else if (event.key === "ArrowRight" && photos.length > 1) {
          event.preventDefault();
          onSelect((activeIndex + 1) % photos.length);
        } else if (event.key === "0") {
          setZoom(1);
        }
      }}
      onWheel={(event) => {
        if (Math.abs(event.deltaY) < 4) return;
        setZoom((current) => Math.min(3, Math.max(1, Number((current + (event.deltaY < 0 ? 0.25 : -0.25)).toFixed(2)))));
      }}
    >
      {photo && activeIndex !== null ? (
        <>
          <button type="button" className="public-lightbox__scrim" aria-label="关闭图片预览" onClick={() => dialogRef.current?.close()} />
          <div className="public-lightbox__toolbar">
            {photos.length > 1 ? (
              <span className="public-lightbox__pill">
                {activeIndex + 1} / {photos.length}
              </span>
            ) : null}
            <button
              type="button"
              className="public-lightbox__pill public-lightbox__pill--btn"
              onClick={() => setZoom((z) => (z > 1.05 ? 1 : 1.75))}
              aria-label={zoom > 1.05 ? "还原图片比例" : "放大图片"}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="public-lightbox__close" aria-label="关闭图片预览" onClick={() => dialogRef.current?.close()} autoFocus>
              ×
            </button>
          </div>
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="public-lightbox__nav public-lightbox__nav--prev"
                aria-label="上一张"
                onClick={() => onSelect((activeIndex - 1 + photos.length) % photos.length)}
              >
                ‹
              </button>
              <button
                type="button"
                className="public-lightbox__nav public-lightbox__nav--next"
                aria-label="下一张"
                onClick={() => onSelect((activeIndex + 1) % photos.length)}
              >
                ›
              </button>
            </>
          ) : null}
          <figure>
            <img
              src={photo.src}
              alt={photo.alt}
              className={zoom > 1.05 ? "is-zoomed" : ""}
              style={{ transform: `scale(${zoom})` }}
              onClick={() => setZoom((z) => (z > 1.05 ? 1 : 1.75))}
            />
          </figure>
        </>
      ) : null}
    </dialog>
  );
}
