#!/usr/bin/env python3
"""Rebuild outpost parts from the reviewed rm-map-tools STEP hierarchy.

Usage (in the upstream pinned CAD Python environment):
  python build_rmuc_outpost_parts.py UPSTREAM_REPO HIERARCHY_DIR OUTPUT.glb
Upstream commit: fe859777e5ee7a311f2a7d7cd1ea9f798a585233.
Generate the motion-reviewed hierarchy from the official STEP using upstream
cad_hierarchy.py; see docs/cad-source-motion.md there.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

upstream, hierarchy, output = [Path(arg).resolve() for arg in sys.argv[1:]]
assert subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip() == "fe859777e5ee7a311f2a7d7cd1ea9f798a585233"
sys.path.insert(0, str(upstream / "python"))
from cad_document import CadDocument
from p21split import Splitter
from validate_parts import read_part
from mesh_parts import tessellate
from export_field_package import GlbWriter

report = json.loads((hierarchy / "hierarchy.json").read_text())
assert report["source_sha256"] == "a5ad3ede3b7674fc98f2e73b71717216383cb2b4b5dcdbe900c2038918bea8e0"
ids = ["outpost/fixed/upper-cluster", "outpost/rotor/carrier"]
records = [next(c for c in report["components"] if c["id"] == i) for i in ids]
assert [len(r["face_ids"]) for r in records] == [3289, 2901]
assert not set(records[0]["face_ids"]) & set(records[1]["face_ids"])
writer = GlbWriter("outpost-corrected-parts", {"version": "2.0", "copyright": "DJI / RoboMaster source CAD", "generator": "rm-map-tools pinned source motion policy"})
with tempfile.TemporaryDirectory() as directory:
    paths = [Path(directory) / (r["id"].split("/")[-1] + ".step") for r in records]
    with CadDocument.from_step(hierarchy / "field.step", workers=1, intern_layers=True, expected_sha256=report["files_sha256"]["field.step"]) as doc:
        splitter = Splitter(doc.index, doc.model)
        for rec, path in zip(records, paths):
            mask, rewritten = splitter.closure_products([doc.index.r(rec["export_product_id"])])
            splitter.write_closure(mask, rewritten, path)
    # The three planar detection faces are original STEP faces, not proxies.
    # #2059823 is the recessed detector in the reviewed module-0 cover;
    # #2032941 and #2039671 are its two equal-size, 120-degree counterparts.
    # Figure 4-34 and §5.1.1 of the official RMUC 2027 V1.0.0 rulebook
    # distinguish the middle armor detection surfaces from the housing.
    armor_faces = [2059823, 2032941, 2039671]
    carrier = records[1]
    body = carrier["export_body_ids"]["2101579"]
    carrier_faces = set(carrier["face_ids"])
    assert set(armor_faces) <= carrier_faces
    parts = [("carrier-frame", sorted(carrier_faces - set(armor_faces)))]
    parts += [(f"armor-{i}", [face]) for i, face in enumerate(armor_faces)]
    with CadDocument.from_step(paths[1], workers=1, intern_layers=True) as doc:
        splitter = Splitter(doc.index, doc.model)
        for name, faces in parts:
            path = Path(directory) / (name + ".step")
            mask, rewritten = splitter.closure_products(
                [doc.index.r(carrier["export_product_id"])], face_ids_by_body={body: faces}
            )
            splitter.write_closure(mask, rewritten, path)
            with CadDocument.from_step(path, workers=1) as part:
                assert {int(part.index.ids[f]) for f in part.model.body_faces(part.index.r(body))} == set(faces)
    paths = [paths[0], *[Path(directory) / (name + ".step") for name, _ in parts]]
    for path in paths:
        doc, reader, error = read_part(str(path))
        assert not error, error
        stats = {}
        mesh = tessellate(doc, .35, .25, stats=stats)
        assert mesh is not None and not stats.get("unmeshed_faces"), stats
        p, t, c, keys = mesh
        writer.add_node(path.stem, p / 1000, t, [keys[int(x)] for x in c])
        print(path.stem, len(t), "triangles")
writer.write(output)
