import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import type { OrganizationCategory, OrganizationPosition, OrganizationPreview } from "~/data/organization-preview";
import { apiRequest } from "~/lib/api-client";
import { organizationPositionDuty } from "~/lib/organization-preview-duties";
import type { Route } from "./+types/organization-preview";
import "./organization-preview.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "成员与岗位 | TARSGO" }];
}

type SelectedPosition = {
  position: OrganizationPosition;
  categoryId: string;
  categoryTitle: string;
};

function MemberAvatar({ position, size = "normal" }: { position: OrganizationPosition; size?: "small" | "normal" }) {
  return (
    <span className={`organization-directory__avatar${size === "small" ? " is-small" : ""}`} aria-hidden="true">
      <span>{Array.from(position.name)[0] ?? "?"}</span>
      {position.avatarUrl ? <img src={position.avatarUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
    </span>
  );
}

function CategorySection({
  category,
  expanded,
  selectedPositionId,
  onToggle,
  onSelectPosition,
}: {
  category: OrganizationCategory;
  expanded: boolean;
  selectedPositionId: string | null;
  onToggle: () => void;
  onSelectPosition: (position: OrganizationPosition, category: OrganizationCategory) => void;
}) {
  return (
    <section className={`organization-directory__category${expanded ? " is-expanded" : ""}`}>
      <button
        type="button"
        className="organization-directory__category-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="organization-directory__category-title">{category.title}</span>
        <span className="organization-directory__category-meta">{category.positions.length} 个岗位</span>
        <span className="organization-directory__chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <ul className="organization-directory__positions">
          {category.positions.map((position) => (
            <li key={position.id}>
              <button
                type="button"
                className={`organization-directory__position${selectedPositionId === position.id ? " is-selected" : ""}`}
                aria-pressed={selectedPositionId === position.id}
                onClick={() => onSelectPosition(position, category)}
              >
                <span>{position.title}</span>
                <span className={`organization-directory__position-state${position.userId === null ? " is-vacant" : ""}`}>
                  {position.userId === null ? "待确认" : "查看成员"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function OrganizationPreviewPage() {
  const [data, setData] = useState<OrganizationPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [expandedIDs, setExpandedIDs] = useState<Set<string>>(() => new Set());
  const [selectedPosition, setSelectedPosition] = useState<SelectedPosition | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const result = await apiRequest<OrganizationPreview>("/api/team/organization-preview");
      setData(result);
      setExpandedIDs(new Set());
      setSelectedPosition(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取成员与岗位");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggleCategory(categoryId: string) {
    const isExpanded = expandedIDs.has(categoryId);
    setExpandedIDs((current) => {
      const next = new Set(current);
      if (isExpanded) {
        next.delete(categoryId);
      } else next.add(categoryId);
      return next;
    });
    if (isExpanded && selectedPosition?.categoryId === categoryId) setSelectedPosition(null);
  }

  function selectPosition(position: OrganizationPosition, categoryId: string, categoryTitle: string) {
    setSelectedPosition((current) => current?.position.id === position.id ? null : { position, categoryId, categoryTitle });
  }

  if (!data) {
    return (
      <main className="organization-directory admin-design" aria-labelledby="organization-directory-title">
        <h1 id="organization-directory-title">成员与岗位</h1>
        {loadError ? <div className="organization-directory__load-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => void load()}>重试</button></div> : <p role="status">正在读取成员与岗位…</p>}
      </main>
    );
  }

  return (
    <main className="organization-directory admin-design" aria-labelledby="organization-directory-title">
      <header className="organization-directory__header">
        <h1 id="organization-directory-title">成员与岗位</h1>
      </header>

      <section className="organization-directory__leader" aria-labelledby="organization-leader-title">
        <p className="organization-directory__section-label" id="organization-leader-title">负责人</p>
        <div className="organization-directory__leader-card">
          <MemberAvatar position={data.leader} />
          <div className="organization-directory__leader-copy">
            <span>{data.leader.title}</span>
            {data.leader.userId === null ? <strong>{data.leader.name}</strong> : <Link to={`/dashboard/members/${data.leader.userId}`}>{data.leader.name}</Link>}
          </div>
          {data.leader.userId !== null ? <Link className="organization-directory__profile-link" to={`/dashboard/members/${data.leader.userId}`}>个人主页 <span aria-hidden="true">↗</span></Link> : null}
        </div>
      </section>

      <section className="organization-directory__groups" aria-labelledby="organization-groups-title">
        <h2 className="organization-directory__section-label" id="organization-groups-title">岗位分类</h2>
        <div className="organization-directory__category-list">
          {data.categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              expanded={expandedIDs.has(category.id)}
              selectedPositionId={selectedPosition?.categoryId === category.id ? selectedPosition.position.id : null}
              onToggle={() => toggleCategory(category.id)}
              onSelectPosition={(position, selectedCategory) => selectPosition(position, selectedCategory.id, selectedCategory.title)}
            />
          ))}
        </div>
      </section>

      {selectedPosition ? (
        <section className="organization-directory__member-detail" aria-labelledby="organization-member-detail-title" aria-live="polite">
          <div className="organization-directory__member-heading">
            <div className="organization-directory__member-person">
              {selectedPosition.position.userId !== null ? <MemberAvatar position={selectedPosition.position} size="small" /> : null}
              <div>
                <p>{selectedPosition.categoryTitle}</p>
                <h2 id="organization-member-detail-title">{selectedPosition.position.title}</h2>
              </div>
            </div>
            <button type="button" className="organization-directory__close" aria-label="关闭成员详情" onClick={() => setSelectedPosition(null)}>×</button>
          </div>
          <p className="organization-directory__member-name">
            {selectedPosition.position.userId === null ? "负责人待确认" : selectedPosition.position.name}
          </p>
          {selectedPosition.position.userId !== null ? (
            <Link className="organization-directory__profile-link" to={`/dashboard/members/${selectedPosition.position.userId}`}>
              查看个人主页 <span aria-hidden="true">↗</span>
            </Link>
          ) : null}
          <p className="organization-directory__duty">{organizationPositionDuty(selectedPosition.position.id, selectedPosition.categoryId)}</p>
        </section>
      ) : null}
    </main>
  );
}
