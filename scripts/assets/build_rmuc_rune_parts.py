#!/usr/bin/env python3
"""Usage: build_rmuc_rune_parts.py UPSTREAM_REPO HIERARCHY_DIR OUTPUT.glb."""
import json,sys,tempfile
from pathlib import Path
import subprocess
upstream, hierarchy, output = [Path(arg).resolve() for arg in sys.argv[1:]]
assert subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip() == "fe859777e5ee7a311f2a7d7cd1ea9f798a585233"
sys.path.insert(0,str(upstream/'python'))
from cad_document import CadDocument
from p21split import Splitter
from validate_parts import read_part
from mesh_parts import tessellate
from export_field_package import GlbWriter
report=json.loads((hierarchy/'hierarchy.json').read_text())
assert report['source_sha256']=='a5ad3ede3b7674fc98f2e73b71717216383cb2b4b5dcdbe900c2038918bea8e0'
ids=[f'rune/{group}/bank-{bank}/{part}' for bank in 'ab' for group,part in [('banks','hub'),('fixed','logo')]]
records=[next(c for c in report['components'] if c['id']==i) for i in ids]
assert [len(r['face_ids']) for r in records]==[2872,52,2920,52]
assert sum(len(r['face_ids']) for r in records)==len(set().union(*(set(r['face_ids']) for r in records)))
writer=GlbWriter('rune-corrected-parts',{'version':'2.0','copyright':'DJI / RoboMaster source CAD','generator':'rm-map-tools pinned source motion policy'})
with tempfile.TemporaryDirectory() as tmp:
    paths=[Path(tmp)/f'{bank}-{part}.step' for bank in 'ab' for part in ('hub','logo')]
    with CadDocument.from_step(hierarchy/'field.step',workers=1,intern_layers=True,expected_sha256=report['files_sha256']['field.step']) as doc:
        splitter=Splitter(doc.index,doc.model)
        for rec,path in zip(records,paths):
            mask,rewritten=splitter.closure_products([doc.index.r(rec['export_product_id'])])
            splitter.write_closure(mask,rewritten,path)
    for path in paths:
        doc,reader,error=read_part(str(path))
        assert not error,error
        stats={}
        p,t,c,keys=tessellate(doc,.35,.25,stats=stats)
        assert not stats.get('unmeshed_faces'),stats
        writer.add_node(path.stem,p/1000,t,[keys[int(x)] for x in c])
        print(path.stem,len(t),flush=True)
writer.write(output)
