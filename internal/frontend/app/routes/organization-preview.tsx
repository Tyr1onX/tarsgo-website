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

type PositionAssignment = {
  id: string;
  title: string;
  categoryId: string | null;
  categoryTitle: string | null;
};

type OrganizationMember = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  positions: PositionAssignment[];
};

function positionAssignment(position: OrganizationPosition, categoryId: string | null, categoryTitle: string | null): PositionAssignment {
  return { id: position.id, title: position.title, categoryId, categoryTitle };
}

function collectMembers(data: OrganizationPreview) {
  const members = new Map<number, OrganizationMember>();
  const addPosition = (position: OrganizationPosition, categoryId: string | null, categoryTitle: string | null) => {
    if (position.userId === null) return;
    const member = members.get(position.userId) ?? {
      id: position.userId,
      name: position.name,
      avatarUrl: position.avatarUrl,
      positions: [],
    };
    if (!member.positions.some((item) => item.id === position.id)) {
      member.positions.push(positionAssignment(position, categoryId, categoryTitle));
    }
    members.set(position.userId, member);
  };

  addPosition(data.leader, null, null);
  for (const category of data.categories) {
    for (const position of category.positions) addPosition(position, category.id, category.title);
  }
  return members;
}

function MemberNode({ member, className = "" }: { member: OrganizationMember; className?: string }) {
  const initial = Array.from(member.name.trim())[0] ?? "吉";
  const positions = [...member.positions].sort((left, right) => (left.categoryTitle ?? "").localeCompare(right.categoryTitle ?? "", "zh-CN") || left.title.localeCompare(right.title, "zh-CN"));

  return (
    <div className={`organization-directory__member${className ? ` ${className}` : ""}`}>
      <Link
        to={`/dashboard/members/${member.id}`}
        className="organization-directory__member-link"
        aria-label={`查看 ${member.name} 的个人主页`}
      >
        <span className="organization-directory__avatar" aria-hidden="true">
          <span>{initial}</span>
          {member.avatarUrl ? <img src={member.avatarUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
        </span>
        <span className="organization-directory__member-name">{member.name}</span>
      </Link>
      <div className="organization-directory__member-tooltip" role="tooltip">
        <strong>{member.name}</strong>
        <span className="organization-directory__tooltip-label">岗位与分类</span>
        <ul>
          {positions.map((position) => <li key={position.id}><span>{position.title}</span>{position.categoryTitle ? <small>{position.categoryTitle}</small> : null}</li>)}
        </ul>
        {positions.length === 1 && positions[0].categoryId ? <p>{organizationPositionDuty(positions[0].id, positions[0].categoryId)}</p> : null}
      </div>
      <ul className="organization-directory__member-roles" aria-label={`${member.name} 的岗位`}>
        {positions.map((position) => <li key={position.id}>{position.title}{position.categoryTitle ? <span>{position.categoryTitle}</span> : null}</li>)}
      </ul>
    </div>
  );
}

function LeaderNode({ position, members }: { position: OrganizationPosition; members: Map<number, OrganizationMember> }) {
  if (position.userId === null) {
    return <div className="organization-directory__leader-vacancy"><span>负责人</span><strong>{position.name || "待确认"}</strong></div>;
  }

  const member = members.get(position.userId);
  return member ? <MemberNode member={member} className="is-leader" /> : null;
}

function CategoryBranch({
  category,
  members,
  expanded,
  onToggle,
}: {
  category: OrganizationCategory;
  members: Map<number, OrganizationMember>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const categoryMembers = [...new Set(category.positions.flatMap((position) => position.userId === null ? [] : [position.userId]))]
    .map((userId) => members.get(userId))
    .filter((member): member is OrganizationMember => Boolean(member));
  const vacancies = category.positions.filter((position) => position.userId === null);
  const panelID = `organization-category-${category.id}`;

  return (
    <section className={`organization-directory__category${expanded ? " is-expanded" : ""}`} aria-labelledby={`${panelID}-title`}>
      <button
        type="button"
        className="organization-directory__category-toggle"
        id={`${panelID}-title`}
        aria-expanded={expanded}
        aria-controls={panelID}
        onClick={onToggle}
      >
        <span className="organization-directory__category-title">{category.title}</span>
        <span className="organization-directory__category-meta">{category.positions.length} 个岗位 · {categoryMembers.length} 位成员</span>
        <span className="organization-directory__chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div className={`organization-directory__category-content${categoryMembers.length ? " has-members" : ""}`} id={panelID}>
          {categoryMembers.length ? <div className="organization-directory__members">
            {categoryMembers.map((member) => <MemberNode key={member.id} member={member} />)}
          </div> : null}
          {vacancies.length ? <ul className="organization-directory__vacancies" aria-label="待确认岗位">
            {vacancies.map((position) => <li key={position.id}><span>{position.title}</span><small>待确认</small></li>)}
          </ul> : null}
          {!category.positions.length ? <p className="organization-directory__empty">暂无岗位</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export default function OrganizationPreviewPage() {
  const [data, setData] = useState<OrganizationPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [expandedIDs, setExpandedIDs] = useState<Set<string>>(() => new Set());
  const members = data ? collectMembers(data) : new Map<number, OrganizationMember>();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const result = await apiRequest<OrganizationPreview>("/api/team/organization-preview");
      setData(result);
      setExpandedIDs(new Set());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取成员与岗位");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggleCategory(categoryId: string) {
    setExpandedIDs((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
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
        <div><p className="organization-directory__eyebrow">吉甲大师战队</p><h1 id="organization-directory-title">成员与岗位</h1></div>
      </header>

      <section className="organization-directory__leader" aria-labelledby="organization-leader-title">
        <h2 className="organization-directory__section-label" id="organization-leader-title">负责人</h2>
        <LeaderNode position={data.leader} members={members} />
      </section>

      <section className="organization-directory__groups" aria-labelledby="organization-groups-title">
        <h2 className="organization-directory__section-label" id="organization-groups-title">岗位分类</h2>
        <div className="organization-directory__category-list">
          {data.categories.map((category) => (
            <CategoryBranch
              key={category.id}
              category={category}
              members={members}
              expanded={expandedIDs.has(category.id)}
              onToggle={() => toggleCategory(category.id)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
