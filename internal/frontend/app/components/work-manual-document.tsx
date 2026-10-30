import type { ManualBlock, ManualDocument } from "~/lib/work-manual-content";

type TitleLevel = 1 | 2;

function ManualBlockView({ block }: { block: ManualBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="work-manual__paragraph">{block.text}</p>;
    case "step":
      return <section className="work-manual__step">
        <h3 className="work-manual__step-title">{block.title}</h3>
        <ol>{block.items.map((item) => <li key={item}>{item}</li>)}</ol>
        {block.completion ? <p className="work-manual__step-completion"><strong>完成标准：</strong>{block.completion}</p> : null}
        {block.links?.length ? <div className="work-manual__related-links">{block.links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</div> : null}
      </section>;
    case "list":
      return <div className="work-manual__list-block">
        {block.label ? <h3 className="work-manual__list-title">{block.label}</h3> : null}
        <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>;
    case "note":
      return <p className="work-manual__note">{block.text}</p>;
    case "download":
      return <a className="work-manual__download" href={block.href} download>{block.label}<span aria-hidden="true">↓</span></a>;
    case "links":
      return <div className="work-manual__related-links">{block.items.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</div>;
  }
}

export function WorkManualDocument({ document, titleLevel }: { document: ManualDocument; titleLevel: TitleLevel }) {
  return <article className="work-manual__article">
    {titleLevel === 1
      ? <h1 className="work-manual__document-title">{document.title}</h1>
      : <h2 className="work-manual__document-title">{document.title}</h2>}
    {document.sections.map((section) => <section className="work-manual__section" id={`${document.slug}-${section.id}`} key={section.id} aria-labelledby={`${document.slug}-${section.id}-title`}>
      <h2 className="work-manual__section-title" id={`${document.slug}-${section.id}-title`}>{section.title}</h2>
      <div className="work-manual__section-content">
        {section.blocks.map((block, index) => <ManualBlockView key={`${block.type}-${index}`} block={block} />)}
      </div>
    </section>)}
  </article>;
}
