import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router";

import type { OrganizationCategory, OrganizationPreview } from "~/data/organization-preview";
import { apiRequest } from "~/lib/api-client";
import { layoutOrganizationPreview, type OrganizationBox } from "~/lib/organization-preview-layout";
import type { Route } from "./+types/organization-preview";
import "./organization-preview.css";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "战队组织架构预览 | TARSGO" },
    { name: "description", content: "吉甲大师战队真实管理岗位与岗位分类预览。" },
  ];
}

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.5;

function splitTitle(title: string, width: number) {
  const limit = Math.max(12, Math.floor((width - 24) / 12));
  const characters = Array.from(title);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += limit) {
    lines.push(characters.slice(index, index + limit).join(""));
  }
  return lines.slice(0, 2);
}

function PersonCard({ box, title, name, vacancy = false }: { box: OrganizationBox; title: string; name: string; vacancy?: boolean }) {
  const titleLines = splitTitle(title, box.width);
  const firstBaseline = titleLines.length > 1 ? box.y + 23 : box.y + 27;
  return (
    <g role="group" aria-label={`${title}：${name}`} className={`organization-preview__person${vacancy ? " is-vacant" : ""}`}>
      <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="9" />
      <text className="organization-preview__position" x={box.x + 12} y={firstBaseline}>
        {titleLines.map((line, index) => <tspan key={`${line}-${index}`} x={box.x + 12} dy={index === 0 ? 0 : 14}>{line}</tspan>)}
      </text>
      <text className="organization-preview__name" x={box.x + 12} y={box.y + 58}>{name}</text>
    </g>
  );
}

function CategoryPanel({
  category,
  box,
  expanded,
  onToggle,
}: {
  category: OrganizationCategory;
  box: ReturnType<typeof layoutOrganizationPreview>["categories"][number];
  expanded: boolean;
  onToggle: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };
  const positionByID = new Map(category.positions.map((position) => [position.id, position]));

  return (
    <g className="organization-preview__category">
      <rect className="organization-preview__category-panel" x={box.x} y={box.y} width={box.width} height={box.height} rx="12" />
      <g
        className="organization-preview__category-toggle"
        data-org-interactive="true"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${expanded ? "收起" : "展开"}${category.title}岗位`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <rect x={box.x + 1} y={box.y + 1} width={box.width - 2} height={box.headerHeight - 1} rx="11" />
        <text className="organization-preview__category-title" x={box.x + 16} y={box.y + 31}>{category.title}</text>
        <text className="organization-preview__category-count" x={box.x + box.width - 43} y={box.y + 30}>
          {expanded ? "−" : "+"} {category.positions.length}
        </text>
      </g>
      {expanded ? box.positions.map((positionBox) => {
        const position = positionByID.get(positionBox.id);
        if (!position) return null;
        return <PersonCard key={position.id} box={positionBox} title={position.title} name={position.name} vacancy={position.name === "待确认"} />;
      }) : null}
    </g>
  );
}

export default function OrganizationPreviewPage() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerID: number; x: number; y: number; left: number; top: number } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [viewportHeight, setViewportHeight] = useState(620);
  const [viewportMeasured, setViewportMeasured] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [data, setData] = useState<OrganizationPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [expandedIDs, setExpandedIDs] = useState<Set<string>>(() => new Set());
  const layout = useMemo(() => layoutOrganizationPreview(viewportWidth, expandedIDs, data?.categories ?? []), [viewportWidth, expandedIDs, data]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    apiRequest<OrganizationPreview>("/api/admin/organization-preview")
      .then((result) => {
        setData(result);
        setExpandedIDs(new Set(result.categories.map(({ id }) => id)));
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "无法读取组织架构"));
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      setViewportWidth(Math.max(320, Math.floor(entry.contentRect.width)));
      setViewportHeight(Math.max(1, Math.floor(entry.contentRect.height)));
      setViewportMeasured(true);
    });
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [data]);

  const fitToScreen = useCallback((isInitial = false) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const currentLayout = layoutRef.current;
    const mobileStack = currentLayout.columns === 1;
    const widthZoom = (viewport.clientWidth - 20) / currentLayout.width;
    const heightZoom = mobileStack ? 1 : (viewport.clientHeight - 20) / currentLayout.height;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(1, widthZoom, heightZoom));
    setZoom(nextZoom);
    viewport.scrollTo({ left: 0, top: 0, behavior: isInitial ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    if (!viewportMeasured) return;
    fitToScreen(true);
  }, [fitToScreen, viewportMeasured, viewportWidth, viewportHeight]);

  function toggleCategory(categoryID: string) {
    setExpandedIDs((current) => {
      const next = new Set(current);
      if (next.has(categoryID)) next.delete(categoryID);
      else next.add(categoryID);
      return next;
    });
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || !(event.target instanceof Element) || event.target.closest("[data-org-interactive]")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = { pointerID: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport || drag.pointerID !== event.pointerId) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerID !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function changeZoom(amount: number) {
    setZoom((current) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((current + amount) * 100) / 100)));
  }

  if (!data) {
    return <main className="organization-preview" role="status">{loadError || "正在加载组织架构…"}</main>;
  }

  return (
    <main className="organization-preview">
      <header className="organization-preview__header">
        <div className="organization-preview__brandline">
          <Link to="/dashboard" className="organization-preview__back">← 返回工作台</Link>
          <span className="organization-preview__preview-tag">预览</span>
        </div>
        <p className="organization-preview__eyebrow">TARSGO / TEAM MAP</p>
        <h1>吉甲大师组织架构</h1>
        <p className="organization-preview__intro">先认识负责人，再按岗位类别找到对应同学。</p>
      </header>

      <section className="organization-preview__workspace" aria-label="战队组织架构图">
        <div className="organization-preview__toolbar">
          <div className="organization-preview__legend">
            <span className="organization-preview__legend-dot" aria-hidden="true" />
            <span>实线只标出已确认的负责人层级</span>
          </div>
          <div className="organization-preview__controls" aria-label="组织架构图操作">
            <button type="button" aria-label="缩小组织架构图" onClick={() => changeZoom(-0.1)} disabled={zoom <= MIN_ZOOM}>−</button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" aria-label="放大组织架构图" onClick={() => changeZoom(0.1)} disabled={zoom >= MAX_ZOOM}>＋</button>
            <button type="button" className="organization-preview__fit" onClick={() => fitToScreen()}>适应屏幕</button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className="organization-preview__viewport"
          role="region"
          aria-label="可缩放和平移的战队组织架构图"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <svg
            className="organization-preview__svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={Math.round(layout.width * zoom)}
            height={Math.round(layout.height * zoom)}
            role="group"
            aria-label="吉甲大师战队负责人和岗位分类"
          >
            <path className="organization-preview__confirmed-link" d={layout.leaderConnector} />
            <g className="organization-preview__team-root" role="group" aria-label={data.team.title}>
              <rect x={layout.team.x} y={layout.team.y} width={layout.team.width} height={layout.team.height} rx="12" />
              <text x={layout.width / 2} y={layout.team.y + 36}>{data.team.title}</text>
            </g>
            <g className="organization-preview__captain" role="group" aria-label={`${data.leader.title}：${data.leader.name}`}>
              <rect x={layout.leader.x} y={layout.leader.y} width={layout.leader.width} height={layout.leader.height} rx="11" />
              <text className="organization-preview__captain-role" x={layout.width / 2} y={layout.leader.y + 28}>{data.leader.title}</text>
              <text className="organization-preview__captain-name" x={layout.width / 2} y={layout.leader.y + 53}>{data.leader.name}</text>
            </g>
            <text className="organization-preview__classification-note" x={layout.width / 2} y={(layout.categories[0]?.y ?? 254) - 19}>
              以下为岗位分类展示 · 分类不代表汇报关系
            </text>
            {layout.categories.map((categoryBox) => {
              const category = data.categories.find(({ id }) => id === categoryBox.id);
              if (!category) return null;
              return (
                <CategoryPanel
                  key={category.id}
                  category={category}
                  box={categoryBox}
                  expanded={expandedIDs.has(category.id)}
                  onToggle={() => toggleCategory(category.id)}
                />
              );
            })}
          </svg>
        </div>
        <p className="organization-preview__help">桌面端可按住画布拖动；点击分类标题展开或收起岗位。手机端可纵向浏览。</p>
      </section>
      <footer className="organization-preview__footer">管理层岗位信息依据《管理层任命10.7》整理。电控组长待确认。</footer>
    </main>
  );
}
