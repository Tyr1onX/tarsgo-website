#!/usr/bin/env python3
"""Extract reviewed dart-station and base-carriage partitions from the pinned source.
Usage: python build_rmuc_dart_parts.py UPSTREAM HIERARCHY OUTPUT.glb
Existing core, rune, outpost and base armor assets are not regenerated.
"""
import json, subprocess, sys, tempfile
from pathlib import Path
upstream, hierarchy, output = map(lambda x: Path(x).resolve(), sys.argv[1:])
assert subprocess.check_output(["git","-C",str(upstream),"rev-parse","HEAD"],text=True).strip()=="fe859777e5ee7a311f2a7d7cd1ea9f798a585233"
sys.path.insert(0,str(upstream/"python"))
from cad_document import CadDocument
from p21split import Splitter
from validate_parts import read_part
from mesh_parts import tessellate
from export_field_package import GlbWriter
report=json.loads((hierarchy/"hierarchy.json").read_text())
assert report["source_sha256"]=="a5ad3ede3b7674fc98f2e73b71717216383cb2b4b5dcdbe900c2038918bea8e0"
records={c["id"]:c for c in report["components"]}
parts={
    "dart-deck": ("dart-station/deck-and-shared-hardware",10599),
    "dart-door": ("dart-station/door",3544),
    "dart-frame": ("dart-station/frame",10231),
    "dart-guides": ("dart-station/guide-rails",716),
    "base-fixed": ("base/fixed/source-remainder",8922),
    "base-rail": ("base/dart-target/rail",2965),
    "base-carriage": ("base/dart-target/carriage",2014),
}
writer=GlbWriter("dart-source-parts",{"version":"2.0","copyright":"DJI / RoboMaster source CAD","generator":"rm-map-tools source partition"})
with tempfile.TemporaryDirectory() as directory:
    folder=Path(directory)
    with CadDocument.from_step(hierarchy/"field.step",workers=1,intern_layers=True,expected_sha256=report["files_sha256"]["field.step"]) as d:
        splitter=Splitter(d.index,d.model)
        for name,(component,count) in parts.items():
            c=records[component]
            assert c["face_count"]==count
            mask,rewrite=splitter.closure_products([d.index.r(c["export_product_id"])])
            splitter.write_closure(mask,rewrite,folder/(name+".step"))
    for name in parts:
        native,reader,error=read_part(str(folder/(name+".step")));assert not error,error
        stats={};mesh=tessellate(native,.35,.25,stats=stats)
        assert mesh is not None and not stats.get("unmeshed_faces"),stats
        p,t,c,keys=mesh
        writer.add_node(name,p/1000,t,[keys[int(x)] for x in c])
        print(name,len(t),flush=True)
writer.write(output)
