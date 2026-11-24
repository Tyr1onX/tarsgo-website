#!/usr/bin/env python3
"""Extract reviewed, separately movable meshes from the pinned upstream CAD GLB.

Usage: python3 scripts/assets/extract_rmuc_mechanisms.py SOURCE.glb CORRECTED_OUTPOST.glb OUTPUT.glb
Then gltfpack -i OUTPUT.glb -o packed.glb -cc -kn -km -noq
Source release: hxyulin/rm-map-tools rmuc2027-simplified-glb-20261018.
Motion axes: rules/source-motion-rmuc2027.json, source product 1354629 / 2603236.
The outpost uses the reviewed source-face partition from rm-map-tools
fe859777e5ee7a311f2a7d7cd1ea9f798a585233. Rune hub/logo remains unresolved.
DJI / RoboMaster CAD remains subject to upstream CAD usage terms.
"""
import copy
import hashlib
import json
import struct
import sys
from pathlib import Path

source, corrected, output = map(Path, sys.argv[1:])
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "ef40412bae1324475aab47e908e150b7b21d66f233740561232df5adf7919882"
length = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20:20 + length])
binary = raw[28 + length:]
# Replace the old fused upper cluster with disjoint source-derived fixed
# and moving surfaces. Both occurrences share these two mesh definitions.
raw2 = corrected.read_bytes()
assert hashlib.sha256(raw2).hexdigest() == "6ce647b6262b040b8b816fb4eb1a8095626a6269d72423b76010ce79af5ce75f"
length2 = struct.unpack_from("<I", raw2, 12)[0]
fix = json.loads(raw2[20:20 + length2])
assert [n.get("name") for n in fix["nodes"]] == ["outpost-corrected-parts", "upper-cluster", "carrier"]
assert not any(fix.get(k) for k in ("textures", "images", "extensionsUsed"))
assert len(binary) % 4 == 0
offsets = {k: len(doc[k]) for k in ("bufferViews", "accessors", "materials", "meshes")}
for view in fix["bufferViews"]:
    assert view["buffer"] == 0
    view["byteOffset"] = view.get("byteOffset", 0) + len(binary)
for accessor in fix["accessors"]:
    accessor["bufferView"] += offsets["bufferViews"]
for mesh in fix["meshes"]:
    for primitive in mesh["primitives"]:
        primitive["attributes"] = {k: v + offsets["accessors"] for k, v in primitive["attributes"].items()}
        primitive["indices"] += offsets["accessors"]
        primitive["material"] += offsets["materials"]
for k in offsets:
    doc[k].extend(fix[k])
binary += raw2[28 + length2:]
doc["buffers"][0]["byteLength"] = len(binary)
fixed_mesh, carrier_mesh = [fix["nodes"][i]["mesh"] + offsets["meshes"] for i in (1, 2)]
nodes = doc["nodes"]
selected = []

def original(index, name):
    assert nodes[index]["name"] == name, (index, nodes[index]["name"], name)
    return nodes[index]

def node(**kwargs):
    nodes.append(kwargs)
    return len(nodes) - 1

def named(index, name):
    nodes[index]["name"] = name
    selected.append(index)

def pivot(index, name, origin, children):
    # The inspected groups have identity product-local placement.
    matrix = nodes[index].get("matrix")
    assert matrix == [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    nodes[index].pop("matrix")
    nodes[index]["translation"] = origin
    nodes[index]["children"] = [node(translation=[-x for x in origin], children=children)]
    named(index, name)

# Keep source Z-up coordinates. The website applies its existing field frame.
for side, parent, product, body, covers in [
    ("red",931,936,938,[946,947,948]), ("blue",1279,1284,1286,[1294,1295,1296]),
]:
    original(parent, side + "-base-with-footing")
    original(product, "base")
    original(body, "base/ico2")
    nodes[parent]["children"] = [product]
    named(product, side + "-base-assembly")
    for i, (index, source_id) in enumerate(zip(covers, [4314593,4353403,4392221])):
        original(index, "source-unit-" + str(source_id))
        assert index in nodes[body]["children"]
        named(index, side + "-cover-" + str(i))

for side, parent, product, fixed, upper, rotor in [
    ("red",1627,1632,1633,1666,1690), ("blue",1733,1738,1739,1772,1796),
]:
    original(parent, side + "-outpost-with-footing")
    original(product, "outpost")
    original(rotor, "rotor")
    nodes[parent]["children"] = [product]
    named(product, side + "-outpost-assembly")
    children = nodes[rotor]["children"]
    assert [nodes[i]["name"] for i in children] == [f"outpost/rotor/module-{i}" for i in range(3)]
    original(upper, "outpost/fixed/upper-cluster")
    assert upper in nodes[fixed]["children"]
    assert nodes[upper]["matrix"] == [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    nodes[upper] = {"mesh": fixed_mesh}
    named(upper, side + "-outpost-fixed-upper")
    for i, module in enumerate(children):
        named(module, f"{side}-outpost-module-{i}")
    carrier = node(mesh=carrier_mesh)
    named(carrier, side + "-outpost-carrier")
    pivot(rotor, side + "-outpost-rotor", [-.009437883451525,1.1374399976,-.0010455166794], children + [carrier])

original(2045, "rune")
named(2045, "rune-assembly")
for index, side in [(2162,"a"),(2323,"b")]:
    original(index, "bank-" + side)
    children = nodes[index]["children"]
    assert [nodes[i]["name"] for i in children[:5]] == [f"rune/banks/bank-{side}/arm-{i}" for i in range(5)]
    for i, arm in enumerate(children[:5]):
        named(arm, f"rune-arm-{side}-{i}")
    hub = children[5]
    assert nodes[hub]["name"] == f"rune/banks/bank-{side}/hub-cluster"
    # Keep the old combined hub/logo stationary; move all five source arms.
    moving = node(matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],children=children[:5])
    pivot(moving, "rune-bank-" + side, [-.4234287973876,.1215088436247,.093], children[:5])
    nodes[index]["children"] = [moving,hub]

doc["scenes"] = [{"nodes":[931,1279,1627,1733,2045]}]
doc["scene"] = 0
# Remove names/extras of unneeded descendants so gltfpack can merge fixed
# geometry by material inside each rigid part. Preserve only moving pivots
# and the five independent source assembly roots.
reachable = []
def visit(index):
    reachable.append(index)
    for child in nodes[index].get("children",[]):
        visit(child)
for i in doc["scenes"][0]["nodes"]:
    visit(i)
assert len(reachable) == len(set(reachable))
mapping = {old: new for new,old in enumerate(reachable)}
result = []
for index in reachable:
    n = copy.deepcopy(nodes[index])
    if index not in selected:
        n.pop("name",None)
    n.pop("extras",None)
    if "children" in n:
        n["children"] = [mapping[i] for i in n["children"]]
    result.append(n)
doc["nodes"] = result
doc["scenes"][0]["nodes"] = [mapping[i] for i in doc["scenes"][0]["nodes"]]
data = json.dumps(doc,separators=(",",":")).encode()
data += b" " * (-len(data) % 4)
output.write_bytes(struct.pack("<4sII",b"glTF",2,28+len(data)+len(binary))+struct.pack("<I4s",len(data),b"JSON")+data+struct.pack("<I4s",len(binary),b"BIN\x00")+binary)
