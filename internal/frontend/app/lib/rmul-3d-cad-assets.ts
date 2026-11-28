// Official 2027 STEP sources. GLBs are CAD-derived display meshes from
// hxyulin/rm-map-tools (rm2027-assets-20261015); geometry is not invented.
// Only rmucField is loaded by the arena. Other retained assets are checked
// for integrity and provenance, including the offline pixel training fixtures.
export const CAD_MODELS = {
  rmucField: {
    label: "RMUC 2027 完整场地",
    // Official 2027 optimized visual GLB, then meshopt-encoded. Position/index streams and node
    // transforms stay exact; only shading normals use 12-bit oct encoding.
    url: "/assets/pixel-jijia/rmuc-2027-arena-5eb9e75a.glb.gz",
    bytes: 17067815,
    sha256: "5eb9e75ae24eb4bd9fbd2e79ede6affd48b2cd784c5cbf699509d06d2ae50608",
    source: "RMUC2027_V1.0.0.stp（全场官方 CAD）",
    triangles: 1106828,
    nodes: 69,
  },
  base: {
    label: "RMUC 2027 基地",
    url: "/assets/pixel-jijia/rmuc-2027-base.glb.gz",
    sha256: "71bd1c25536938e5ae40635937e6a5d7f6ccd73fae46ad3dee814a417da143ee",
    source: "RMUC2027_V1.0.0.stp（基地总成）",
    sourceSha256: "a5ad3ede3b7674fc98f2e73b71717216383cb2b4b5dcdbe900c2038918bea8e0",
    triangles: 110761,
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
