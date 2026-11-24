#!/usr/bin/env python3
"""Extract exact source geometry for the technology core.
Usage: in the pinned rm-map-tools Python environment:
  python build_rmuc_core_parts.py UPSTREAM HIERARCHY OUTPUT.glb
The shaft and its coaxial flange/tip are distinct original shells. Other
head and arm hardware stays at source rest pose; no certified arm rig.
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
records={c["id"].split("/")[-1]:c for c in report["components"] if c["id"].startswith("technology-core/")}
assert {k:v["face_count"] for k,v in records.items()}=={"arm-and-shared":628,"pedestal-and-shoulder":769,"tool-head":3495}
shaft=[1691318,1695772,1709000,1715740]
writer=GlbWriter("core-source-parts",{"version":"2.0","copyright":"DJI / RoboMaster source CAD","generator":"rm-map-tools source partition"})
with tempfile.TemporaryDirectory() as directory:
    folder=Path(directory)
    paths=[]
    with CadDocument.from_step(hierarchy/"field.step",workers=1,intern_layers=True,expected_sha256=report["files_sha256"]["field.step"]) as d:
        splitter=Splitter(d.index,d.model)
        for name in ["pedestal-and-shoulder","arm-and-shared","tool-head"]:
            c=records[name];path=folder/(name+".step")
            mask,rewrite=splitter.closure_products([d.index.r(c["export_product_id"])])
            splitter.write_closure(mask,rewrite,path)
            if name!="tool-head":paths.append(path)
    c=records["tool-head"];body=c["export_body_ids"]["1751911"]
    shells=c["shell_ids_by_body"]["1751911"]
    assert set(shaft)<=set(shells)
    with CadDocument.from_step(folder/"tool-head.step",workers=1,intern_layers=True) as d:
        splitter=Splitter(d.index,d.model)
        for name,group in [("head-fixed",[s for s in shells if s not in shaft]),("shaft",shaft)]:
            path=folder/(name+".step")
            mask,rewrite=splitter.closure_products([d.index.r(c["export_product_id"])],shell_ids_by_body={body:group})
            splitter.write_closure(mask,rewrite,path);paths.append(path)
    for path in paths:
        native,reader,error=read_part(str(path));assert not error,error
        stats={};mesh=tessellate(native,.35,.25,stats=stats)
        assert mesh is not None and not stats.get("unmeshed_faces"),stats
        p,t,c,keys=mesh
        writer.add_node(path.stem,p/1000,t,[keys[int(x)] for x in c])
        print(path.stem,len(t),flush=True)
writer.write(output)
