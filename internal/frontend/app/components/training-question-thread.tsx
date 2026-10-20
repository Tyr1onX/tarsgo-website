import type { ReactNode } from "react";

import { formatQuestionDate, questionStatusLabel, type QuestionAttachment, type TrainingQuestionDetail } from "~/lib/training-question-client";

function renderBody(body: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const codeBlock = /```([\w+-]*)\r?\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = codeBlock.exec(body)) !== null) {
    if (match.index > cursor) {
      blocks.push(<p key={`text-${key++}`} className="whitespace-pre-wrap break-words">{body.slice(cursor, match.index)}</p>);
    }
    blocks.push(
      <pre key={`code-${key++}`} className="overflow-x-auto rounded-lg border border-[var(--admin-border-subtle)] bg-black/25 p-3 text-xs leading-5 text-[var(--admin-text)]">
        <code>{match[2]}</code>
      </pre>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length || blocks.length === 0) {
    blocks.push(<p key={`text-${key}`} className="whitespace-pre-wrap break-words">{body.slice(cursor)}</p>);
  }
  return blocks;
}

function Images({ files }: { files: QuestionAttachment[] }) {
  if (!files.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {files.map((file) => (
        <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-[var(--admin-border-subtle)] bg-black/10">
          <img src={file.url} alt={file.fileName} loading="lazy" className="aspect-video w-full object-contain" />
          <span className="block truncate px-2 py-1 text-xs text-[var(--admin-muted)]">{file.fileName}</span>
        </a>
      ))}
    </div>
  );
}

export function TrainingQuestionThread({ detail }: { detail: TrainingQuestionDetail }) {
  const { question, posts } = detail;
  return (
    <article className="space-y-4" aria-labelledby="training-question-detail-title">
      <section className="admin-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--admin-muted)]">{question.groupName} · {question.askerName} · {formatQuestionDate(question.createdAt)}</p>
            <h2 id="training-question-detail-title" className="mt-1 break-words text-xl font-semibold text-white">{question.title}</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[var(--admin-border-subtle)] px-2.5 py-1 text-[var(--admin-muted)]">{questionStatusLabel(question)}</span>
            <span className="rounded-full border border-[var(--admin-border-subtle)] px-2.5 py-1 text-[var(--admin-muted)]">{question.visibility === "private" ? "私密" : "公开"}</span>
            {question.isFaq ? <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-amber-200">FAQ</span> : null}
          </div>
        </div>
        <div className="space-y-3 text-sm leading-6 text-[var(--admin-text)]">{renderBody(question.body)}</div>
        <Images files={question.attachments} />
      </section>

      <section className="space-y-3" aria-labelledby="training-question-discussion-title">
        <h3 id="training-question-discussion-title" className="text-sm font-semibold text-white">讨论记录 · {posts.length}</h3>
        {posts.length ? posts.map((post) => (
          <article key={post.id} className="admin-panel space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--admin-muted)]">
              <strong className="text-[var(--admin-text)]">{post.authorName} · {post.kind === "follow_up" ? "追问" : "回答"}</strong>
              <time dateTime={post.createdAt}>{formatQuestionDate(post.createdAt)}</time>
            </div>
            <div className="space-y-3 text-sm leading-6 text-[var(--admin-text)]">{renderBody(post.body)}</div>
            <Images files={post.attachments} />
          </article>
        )) : <p className="rounded-lg border border-dashed border-[var(--admin-border-subtle)] px-4 py-5 text-sm text-[var(--admin-muted)]">暂时还没有回复</p>}
      </section>
    </article>
  );
}

export function QuestionActionBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
