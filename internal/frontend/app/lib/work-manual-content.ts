export type ManualLink = { label: string; href: string };

export type ManualBlock =
  | { type: "paragraph"; text: string }
  | { type: "step"; title: string; items: string[]; completion?: string; links?: ManualLink[] }
  | { type: "list"; label?: string; items: string[] }
  | { type: "note"; text: string }
  | { type: "download"; label: string; href: string }
  | { type: "links"; items: ManualLink[] };

export type ManualSection = { id: string; title: string; blocks: ManualBlock[] };
export type ManualDocument = { slug: string; title: string; sections: ManualSection[] };
export type OperationsCatalogue = { documents: ManualDocument[] };

export function resolveManualDocument(documents: ManualDocument[], selectedSlug: string): ManualDocument | undefined {
  return documents.find((document) => document.slug === selectedSlug) ?? documents[0];
}
