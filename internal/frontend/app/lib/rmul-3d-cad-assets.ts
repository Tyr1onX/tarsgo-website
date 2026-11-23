// Official 2027 STEP sources. GLBs are CAD-derived display meshes from
// hxyulin/rm-map-tools (rm2027-assets-20261015); geometry is not invented.
export const CAD_MODELS = {
  rmucField: {
    label: "RMUC 2027 完整场地",
    catalogName: "full-map",
    source: "RMUC2027_V1.0.0.stp（全场官方 CAD）",
  },
  base: {
    label: "RMUC 2027 基地",
    url: "/assets/pixel-jijia/rmuc-2027-base.glb.gz",
    sha256: "71bd1c25536938e5ae40635937e6a5d7f6ccd73fae46ad3dee814a417da143ee",
    source: "RMUC2027_V1.0.0.stp（基地总成）",
    sourceSha256: "a5ad3ede3b7674fc98f2e73b71717216383cb2b4b5dcdbe900c2038918bea8e0",
    triangles: 110761,
  },
  outpost: {
    label: "RMUC 2027 前哨站",
    catalogName: "centre-platform",
    // One source-matched outpost + footing. The CAD assembly has two distant
    // mirrored occurrences; framing both makes each appear tiny.
    sourceNodes: ["source_1800898_10", "source_2603236_11"],
    source: "RMUC2027_V1.0.0.stp（前哨站 #2603236、底座 #1800898）",
  },
  rune: {
    label: "RMUC 2027 能量机关（大风车）",
    catalogName: "centre-platform",
    sourceNodes: ["source_1354629_1"],
    source: "RMUC2027_V1.0.0.stp（能量机关产品 #1354629）",
  },
  field: {
    label: "RMUL 3V3 场地",
    url: "/assets/pixel-jijia/rmul-2027-3v3.glb.gz",
    sha256: "0f53f10a132730dcf11c9255d6696981fc40b3b637e7f48d8cbfcd17ec122f2d",
    source: "RMUL2027_3V3_V1.0.0.stp",
    sourceSha256: "7d47c1b6a6a0253a732e46cb122bb84410b11d5134bcb5658104299db4a48ca4",
    triangles: 3537,
  },
  energy: {
    label: "2027 能量单元",
    url: "/assets/pixel-jijia/energy-unit-2027.glb.gz",
    sha256: "30133aa9d044f7bc037b0316f1b6ba7a16c1ae93511fdd22aeea023c0953d926",
    source: "能量单元.stp（2027）",
    sourceSha256: "998c5b394dde349311359afb3a547d1ce64296c30c8e45b0aefb1d092860eca9",
    triangles: 7762,
  },
} as const;

export type CadModelId = keyof typeof CAD_MODELS;
export const DEFAULT_CAD_MODEL: CadModelId = "rmucField";

// GLTFLoader puts multi-primitive source meshes under a named parent node.
// Match the source occurrence and its primitive children, but not its sibling
// occurrence (for example, source_2603236_11 vs source_2603236_12).
export function cadSourceOccurrenceForMesh(
  meshName: string,
  sourceNodes: readonly string[],
): string | undefined {
  return sourceNodes.find((node) => meshName === node || meshName.startsWith(node + "_"));
}


// A 2027 release already publishes the unchanged source-rest-pose meshes.
// Resolve only these pinned RMUC product IDs; never substitute 2026 or
// generated proxy facilities when the source model is unavailable.
export const CAD_VIEWER_CATALOG = "https://hxyulin.github.io/rm-map-tools/models/2027/catalog.json";

export async function resolveCadModel(id: CadModelId): Promise<{ url: string; sha256: string }> {
  const model = CAD_MODELS[id];
  if ("url" in model) return { url: model.url, sha256: model.sha256 };

  const response = await fetch(CAD_VIEWER_CATALOG);
  if (!response.ok) throw new Error("2027 CAD catalog unavailable");
  const catalog: unknown = await response.json();
  if (!catalog || typeof catalog !== "object" || !("models" in catalog) ||
      !Array.isArray(catalog.models)) throw new Error("Invalid 2027 CAD catalog");

  const expectedFile = `rmuc2027/${model.catalogName}.glb.gz`;
  const expectedId = `rmuc2027-${model.catalogName}`;
  const entry = catalog.models.find((item: unknown) =>
    !!item && typeof item === "object" && "id" in item && item.id === expectedId
  );
  if (!entry || entry.file !== expectedFile ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Missing official RMUC 2027 CAD mesh");

  return {
    url: CAD_VIEWER_CATALOG.replace("catalog.json", expectedFile),
    sha256: entry.sha256,
  };
}
