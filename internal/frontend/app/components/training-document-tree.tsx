import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { apiRequest } from "~/lib/api-client";

export type TrainingNode = {
  id: string;
  parentId: string;
  title: string;
  kind: "folder" | "document" | "reference";
  ref?: string;
  scope?: number;
};

export function trainingNodeHref(node: TrainingNode) {
  return node.kind === "reference" ? `?group=${node.ref}` : `?doc=${node.id}`;
}

export function orderedTrainingNodes(nodes: TrainingNode[]) {
  const result: { node: TrainingNode; depth: number }[] = [];
  function visit(parentId: string, depth: number) {
    for (const node of nodes) {
      if (node.parentId !== parentId) continue;
      result.push({ node, depth });
      visit(node.id, depth + 1);
    }
  }
  visit("", 0);
  return result;
}

type Action =
  | { mode: "create"; parentId: string; kind: "folder" | "document" }
  | { mode: "rename"; id: string };

export function TrainingDocumentTree({
  nodes, selectedId, canEdit, onTreeChange, canNavigate,
}: {
  nodes: TrainingNode[];
  selectedId: string;
  canEdit: boolean;
  onTreeChange: (nodes: TrainingNode[]) => void;
  canNavigate: () => boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["handbook", "foundation-folder", "archive"]));
  const [menu, setMenu] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = new Set<string>();
    let parentId = nodes.find((node) => node.id === selectedId)?.parentId;
    while (parentId) {
      next.add(parentId);
      parentId = nodes.find((node) => node.id === parentId)?.parentId;
    }
    if (next.size) {
      setExpanded((previous) => {
        if ([...next].every((id) => previous.has(id))) return previous;
        return new Set([...previous, ...next]);
      });
    }
  }, [nodes, selectedId]);

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function edit(next: Action) {
    setAction(next);
    setName(next.mode === "rename" ? nodes.find(({ id }) => id === next.id)?.title ?? "" : "");
    setError("");
    setMenu(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy) return;
    const title = name.trim();
    if (!title || title.length > 80) {
      setError("请输入 1–80 字的名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (action.mode === "create") {
        const result = await apiRequest<{ nodes: TrainingNode[]; id: string }>("/api/admin/training-documents/nodes", {
          method: "POST", body: { title, kind: action.kind, parentId: action.parentId },
        });
        onTreeChange(result.nodes);
        if (action.parentId) {
          setExpanded((previous) => new Set([...previous, action.parentId]));
        }
        if (action.kind === "document" && canNavigate()) {
          navigate(`?doc=${result.id}`);
        }
      } else {
        const result = await apiRequest<{ nodes: TrainingNode[] }>(`/api/admin/training-documents/nodes/${action.id}`, {
          method: "PATCH", body: { title },
        });
        onTreeChange(result.nodes);
      }
      setAction(null);
      setName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function form(depth: number) {
    return <form className="training-tree__form" style={{ paddingLeft: depth * 14 }} onSubmit={(event) => void submit(event)}>
      <input autoFocus aria-label="模块或文档名称" value={name} onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape") setAction(null); }}
        maxLength={80} placeholder={action?.mode === "rename" ? "新名称" : "输入名称"} disabled={busy} />
      <div className="training-tree__form-actions">
        <button type="submit" disabled={busy}>{busy ? "保存中…" : "确定"}</button>
        <button type="button" onClick={() => setAction(null)} disabled={busy}>取消</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>;
  }

  const ordered = orderedTrainingNodes(nodes);
  const visible = ordered.filter(({ node }) => {
    let parentId = node.parentId;
    while (parentId) {
      if (!expanded.has(parentId)) return false;
      parentId = nodes.find(({ id }) => id === parentId)?.parentId ?? "";
    }
    return true;
  });

  return <nav aria-label="培训文档目录" className="training-tree">
    <div className="training-tree__toolbar">
      <span>文档目录</span>
      {canEdit ? <div className="training-tree__tools">
        <button type="button" aria-label="新增根级模块或文档" title="新增" onClick={() => setMenu(menu === "root" ? null : "root")}>＋</button>
      </div> : null}
    </div>
    {menu === "root" ? <div className="training-tree__menu">
      <button type="button" onClick={() => edit({ mode: "create", parentId: "", kind: "folder" })}>新建模块</button>
      <button type="button" onClick={() => edit({ mode: "create", parentId: "", kind: "document" })}>新建文档</button>
    </div> : null}
    {action?.mode === "create" && action.parentId === "" ? form(0) : null}
    {visible.map(({ node, depth }) => {
      const children = nodes.some(({ parentId }) => parentId === node.id);
      const canParent = node.kind !== "reference";
      const current = node.id === selectedId;
      return <div key={node.id} className="training-tree__entry">
        <div className={`training-tree__row${current ? " is-current" : ""}`} style={{ paddingLeft: depth * 14 }}>
          {children || node.kind === "folder" ? <button type="button" className="training-tree__chevron"
            aria-label={expanded.has(node.id) ? `收起${node.title}` : `展开${node.title}`}
            aria-expanded={expanded.has(node.id)} onClick={() => toggle(node.id)}>{expanded.has(node.id) ? "⌄" : "›"}</button>
            : <span className="training-tree__chevron" aria-hidden="true" />}
          {node.kind === "folder"
            ? <button type="button" className="training-tree__title is-folder" onClick={() => toggle(node.id)}>{node.title}</button>
            : <Link className="training-tree__title" to={trainingNodeHref(node)}
              aria-current={current ? "page" : undefined}
              onClick={(event) => { if (!canNavigate()) event.preventDefault(); }}>{node.title}</Link>}
          {canEdit ? <div className="training-tree__tools">
            <button type="button" className="training-tree__more" aria-label={`管理${node.title}`}
              title="管理" onClick={() => setMenu(menu === node.id ? null : node.id)}>···</button>
          </div> : null}
        </div>
        {menu === node.id ? <div className="training-tree__menu" style={{ marginLeft: depth * 14 + 20 }}>
          {canParent ? <>
            <button type="button" onClick={() => edit({ mode: "create", parentId: node.id, kind: "folder" })}>新建子模块</button>
            <button type="button" onClick={() => edit({ mode: "create", parentId: node.id, kind: "document" })}>新建子文档</button>
          </> : null}
          <button type="button" onClick={() => edit({ mode: "rename", id: node.id })}>重命名</button>
        </div> : null}
        {action?.mode === "rename" && action.id === node.id ? form(depth + 1) : null}
        {action?.mode === "create" && action.parentId === node.id ? form(depth + 1) : null}
      </div>;
    })}
  </nav>;
}
