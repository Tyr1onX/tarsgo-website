// Offline only: node pack_rmuc_field_normals.mjs ORIGINAL.glb OUTPUT.glb PATH_TO_MESHOPTIMIZER/index.js
// meshoptimizer 1.1.1 (already pinned transitively in frontend lockfile).
// Preserves original POSITION/index payloads and all node transforms.
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const [input,output,modulePath]=process.argv.slice(2);
const {MeshoptEncoder,MeshoptDecoder}=await import(pathToFileURL(resolve(modulePath)).href);
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const b=readFileSync(input),jsonLength=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+jsonLength)),bin=b.subarray(28+jsonLength);
assert.equal(b.readUInt32LE(0),0x46546c67);
const normalAccessors=new Set(g.meshes.flatMap(m=>m.primitives.map(p=>p.attributes.NORMAL)));
const views=new Set([...normalAccessors].map(i=>g.accessors[i].bufferView));
assert.equal(views.size,1);
const vi=[...views][0],view=g.bufferViews[vi],ext=view.extensions.EXT_meshopt_compression;
assert.equal(ext.mode,"ATTRIBUTES");assert.equal(ext.byteStride,12);assert.equal(ext.buffer,0);
const oldBytes=ext.byteLength,count=ext.count,decoded=new Uint8Array(count*12);
MeshoptDecoder.decodeGltfBuffer(decoded,count,12,bin.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),"ATTRIBUTES");
const xyz=new Float32Array(decoded.buffer),xyzw=new Float32Array(count*4);
for(let i=0;i<count;i++){xyzw[i*4]=xyz[i*3];xyzw[i*4+1]=xyz[i*3+1];xyzw[i*4+2]=xyz[i*3+2];}
const oct=MeshoptEncoder.encodeFilterOct(xyzw,count,8,12),encoded=MeshoptEncoder.encodeGltfBuffer(oct,count,8,"ATTRIBUTES");
const roundtrip=new Uint8Array(count*8);
MeshoptDecoder.decodeGltfBuffer(roundtrip,count,8,encoded,"ATTRIBUTES","OCTAHEDRAL");
const q=new Int16Array(roundtrip.buffer);let maxAngle=0,minLength=Infinity,maxLength=0;
for(let i=0;i<count;i++){const x=xyz[i*3],y=xyz[i*3+1],z=xyz[i*3+2],a=q[4*i]/32767,c=q[4*i+1]/32767,d=q[4*i+2]/32767;const len=Math.hypot(x,y,z);minLength=Math.min(minLength,len);maxLength=Math.max(maxLength,len);if(len>0){const cos=(x*a+y*c+z*d)/(len*Math.hypot(a,c,d));maxAngle=Math.max(maxAngle,Math.acos(Math.min(1,Math.max(-1,cos))));}}
for(const [i,a] of g.accessors.entries())if(a.bufferView===vi){assert(normalAccessors.has(i));assert.equal(a.componentType,5126);assert.equal(a.type,"VEC3");assert.equal((a.byteOffset??0)%12,0);a.byteOffset=(a.byteOffset??0)/12*8;a.componentType=5122;a.normalized=true;}
view.byteLength=count*8;view.byteStride=8;ext.byteStride=8;ext.filter="OCTAHEDRAL";
for(const key of ["extensionsUsed","extensionsRequired"]){g[key]??=[];if(!g[key].includes("KHR_mesh_quantization"))g[key].push("KHR_mesh_quantization");}
const chunks=[];let offset=0;
for(const [i,v] of g.bufferViews.entries()){
 const e=v.extensions.EXT_meshopt_compression;
 assert.equal(e.buffer,0);
 const data=i===vi?encoded:bin.subarray(e.byteOffset,e.byteOffset+e.byteLength);
 e.byteOffset=offset;e.byteLength=data.length;
 const padded=Buffer.alloc(Math.ceil(data.length/4)*4);padded.set(data);chunks.push(padded);offset+=padded.length;
}
g.buffers[0].byteLength=offset;
const text=Buffer.from(JSON.stringify(g)),jp=Buffer.alloc(Math.ceil(text.length/4)*4,0x20);jp.set(text);
const h=Buffer.alloc(12);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+offset,8);
const j=Buffer.alloc(8);j.writeUInt32LE(jp.length);j.writeUInt32LE(0x4e4f534a,4);
const k=Buffer.alloc(8);k.writeUInt32LE(offset);k.writeUInt32LE(0x004e4942,4);
writeFileSync(output,Buffer.concat([h,j,jp,k,...chunks]));
console.log({normals:count,oldBytes,encodedBytes:encoded.length,maxAngleDegrees:maxAngle*180/Math.PI,minLength,maxLength});
