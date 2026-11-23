// The native vertex format carries mesh provenance in the top byte of flags
// and the top half of the palette word. A source can have many instances.
const VERTEX_WORDS = 16;
const TRIANGLE_WORDS = VERTEX_WORDS * 3;
const HUD = 1 << 23;
const MAX_CANDIDATES = 32;
const MAX_MOVE = 32;
const UNMATCHED = -1;
const hash = (a,b) => Math.imul(a^b,16777619);
const sourceAt = (words,i) => ((words[i+10]>>>24)<<16)|(words[i+15]>>>16);
// Beginner's animated billboard swaps both its ROM model address and its
// texture slot for each pose of the eyes, while the panel geometry is shared.
const BILLBOARD_SOURCE=0x8d5c9b;
const BILLBOARD_FRAMES=new Map([
  [0x8d5c9b,0x01000300],[0x8d5cc4,0x01000380],[0x8d5ced,0x01800300],
]);

function billboardPart(words,i) {
  const source=sourceAt(words,i);
  const panelSlot=BILLBOARD_FRAMES.get(source);
  if(panelSlot===undefined)return 0;
  const flags=words[i+10]&0x00ffffff, position=words[i+11];
  if(flags===0x246102 && position===panelSlot)return 1;
  if(flags===0x004103 && position===0x03c00280)return 2;
  return 0;
}

function trackSource(words,i) {
  return billboardPart(words,i) ? BILLBOARD_SOURCE : sourceAt(words,i);
}

function texturePosition(words,i) {
  return billboardPart(words,i)===1 ? 0 : words[i+11];
}

function views(bytes) {
  return {
    words: new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
    floats: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
  };
}

function key({words, floats}, i) {
  const flags = words[i + 10];
  if (flags & HUD) return null;
  const source = trackSource(words,i);
  if (source === 0 || source === 0xffffff) return null;
  let key = hash(hash(hash(hash(source,flags & 0x007fffff),texturePosition(words,i)),words[i+12]),words[i+15]&32767);
  if (flags & 2) {
    for (let v = i; v < i + TRIANGLE_WORDS; v += VERTEX_WORDS) {
      const q = floats[v + 3];
      if (!(q > 0)) return null;
      // Geometry clipping can create new UVs. Keep such triangles on the
      // native step unless their topology and vertex order still agree.
      key = hash(hash(key,Math.round(floats[v+4]/q*16)),Math.round(floats[v+5]/q*16));
    }
  }
  return key;
}

function compatible(current, i, previous, p) {
  const a=current.words,b=previous.words;
  if(a[i+10]!==b[p+10] || a[i+12]!==b[p+12] || (a[i+15]&32767)!==(b[p+15]&32767) ||
     trackSource(a,i)!==trackSource(b,p) || texturePosition(a,i)!==texturePosition(b,p))return false;
  if(!(a[i+10]&2))return true;
  const x=current.floats,y=previous.floats;
  for(let v=0;v<TRIANGLE_WORDS;v+=VERTEX_WORDS){
    const q=x[i+v+3],r=y[p+v+3];
    if(Math.abs(x[i+v+4]/q-y[p+v+4]/r)>0.063 ||
       Math.abs(x[i+v+5]/q-y[p+v+5]/r)>0.063)return false;
  }
  return true;
}

function distance(current, a, previous, b) {
  let score = 0;
  for (let v = 0; v < TRIANGLE_WORDS; v += VERTEX_WORDS) {
    const x = current[a+v] - previous[b+v], y = current[a+v+1] - previous[b+v+1];
    const q = current[a+v+3], p = previous[b+v+3];
    if (!(q > 0 && p > 0) || Math.abs(x) > MAX_MOVE || Math.abs(y) > MAX_MOVE) return Infinity;
    const depth = (q - p) / Math.max(q, p);
    if (Math.abs(depth) > 0.25) return Infinity;
    score += x*x + y*y + 12000*depth*depth;
  }
  return score;
}

function vertexKey({words, floats}, i) {
  return Math.imul(Math.round(floats[i]*32),73856093) ^
    Math.imul(Math.round(floats[i+1]*32),19349663) ^
    Math.imul(words[i+3]>>>6,83492791);
}

function findVertex(current, vertex, entry) {
  while(entry&&!sameVertex(current,vertex,entry.vertex))entry=entry.next;
  return entry;
}

function sameVertex({words,floats}, a,b) {
  return (words[a+3]>>>6)===(words[b+3]>>>6) &&
    Math.round(floats[a]*32)===Math.round(floats[b]*32) &&
    Math.round(floats[a+1]*32)===Math.round(floats[b+1]*32);
}

// A clipped billboard can get new vertices with new UVs. Its previous
// position is still recoverable from any non-degenerate triangle on its plane.
function billboardPlane(floats,i) {
  const points=[i,i+VERTEX_WORDS,i+2*VERTEX_WORDS].map(v=>{
    const z=1/floats[v+3];
    return [floats[v+4]*z,floats[v+5]*z,floats[v]*z,floats[v+1]*z,z];
  });
  const [a,b,c]=points;
  const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1];
  const determinant=ux*vy-uy*vx;
  if(!Number.isFinite(determinant)||Math.abs(determinant)<0.01)return null;
  return {a,b,c,ux,uy,vx,vy,determinant};
}

function projectBillboard(plane,floats,v) {
  const {a,b,c,ux,uy,vx,vy,determinant}=plane;
  const q=floats[v+3],u=floats[v+4]/q-a[0], w=floats[v+5]/q-a[1];
  const s=(u*vy-w*vx)/determinant,t=(ux*w-uy*u)/determinant;
  const x=a[2]+s*(b[2]-a[2])+t*(c[2]-a[2]);
  const y=a[3]+s*(b[3]-a[3])+t*(c[3]-a[3]);
  const z=a[4]+s*(b[4]-a[4])+t*(c[4]-a[4]);
  return [x/z,y/z,1/z];
}

function continueBillboard(previous,current,output) {
  const planes=[null,null,null];
  for(let i=0;i<previous.words.length;i+=TRIANGLE_WORDS){
    const part=billboardPart(previous.words,i);
    if(!part)continue;
    const p=billboardPlane(previous.floats,i);
    if(p&&Math.abs(p.determinant)>Math.abs(planes[part]?.determinant??0))planes[part]=p;
  }
  // The same ROM mesh could be instanced twice. Reject a plane unless it
  // explains all previous vertices for that part of the billboard.
  const before=previous.floats;
  for(let i=0;i<before.length;i+=TRIANGLE_WORDS){
    const part=billboardPart(previous.words,i), plane=planes[part];
    if(!plane)continue;
    for(let v=i;v<i+TRIANGLE_WORDS;v+=VERTEX_WORDS){
      const [x,y,q]=projectBillboard(plane,before,v);
      if(!(q>0)||Math.abs(x-before[v])+Math.abs(y-before[v+1])>0.5||
         Math.abs(q-before[v+3])>q*0.005){planes[part]=null;break;}
    }
  }
  const now=current.floats, poses=[null,[],[]];
  for(let i=0;i<now.length;i+=TRIANGLE_WORDS){
    const part=billboardPart(current.words,i), plane=planes[part];
    if(!plane)continue;
    for(let v=i;v<i+TRIANGLE_WORDS;v+=VERTEX_WORDS){
      const pose=projectBillboard(plane,now,v);
      const [x,y,q]=pose;
      if(!(q>0)||Math.abs(x-now[v])>MAX_MOVE||Math.abs(y-now[v+1])>MAX_MOVE||
         Math.abs(q-now[v+3])>Math.max(q,now[v+3])*0.25){planes[part]=null;break;}
      poses[part].push([v/VERTEX_WORDS*3,pose]);
    }
  }
  let continued=0;
  for(const part of [1,2]){
    if(!planes[part]||!poses[part].some(([dst])=>!output[dst+2]))continue;
    for(const [dst,pose] of poses[part]){
      if(!output[dst+2])continued++;
      output.set(pose,dst);
    }
  }
  return continued;
}

const CELL_SIZE=24;
const cellKey=(x,y)=>x+65536*y;

function cameraAnchors(before, now, shared) {
  const cells=new Map();
  for(const head of shared.values()){
    for(let entry=head;entry;entry=entry.next){
      if(entry.from===UNMATCHED)continue;
      const i=entry.vertex,p=entry.from;
      const x=now[i],y=now[i+1],q=now[i+3];
      const dx=before[p]-x,dy=before[p+1]-y;
      if(Math.abs(dx)>24 || Math.abs(dy)>24)continue;
      const id=cellKey(Math.floor(x/CELL_SIZE),Math.floor(y/CELL_SIZE));
      let points=cells.get(id);
      if(!points)cells.set(id,points=[]);
      if(points.length<12)points.push({x,y,q,dx,dy,depthRatio:before[p+3]/q});
    }
  }
  return cells;
}

function estimateCamera(cells,x,y,q) {
  const col=Math.floor(x/CELL_SIZE),row=Math.floor(y/CELL_SIZE);
  let weight=0, dx=0, dy=0, depth=0, count=0;
  let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity,qMin=Infinity,qMax=-Infinity;
  for(let cy=row-1;cy<=row+1;cy++){
    for(let cx=col-1;cx<=col+1;cx++){
      const points=cells.get(cellKey(cx,cy));
      if(!points)continue;
      for(const p of points){
        if(Math.abs(p.q-q)>q*0.18)continue;
        const distance=(p.x-x)**2+(p.y-y)**2;
        if(distance>32*32)continue;
        const w=1/(16+distance);
        weight+=w;dx+=p.dx*w;dy+=p.dy*w;depth+=p.depthRatio*w;count++;
        xMin=Math.min(xMin,p.dx);xMax=Math.max(xMax,p.dx);
        yMin=Math.min(yMin,p.dy);yMax=Math.max(yMax,p.dy);
        qMin=Math.min(qMin,p.depthRatio);qMax=Math.max(qMax,p.depthRatio);
      }
    }
  }
  // Small untracked faces only inherit motion when nearby geometry at a
  // similar depth agrees. Large shifts, cuts and depth edges stay native.
  if(count<3 || xMax-xMin>4 || yMax-yMin>4 || qMax-qMin>0.04)return null;
  if(Math.abs(dx)+Math.abs(dy)<weight*0.5)return null;
  return [x+dx/weight,y+dy/weight,q*depth/weight];
}

function inheritCameraMotion(previous,current,output,shared,previousSources) {
  const now=current.floats;
  const cells=cameraAnchors(previous.floats,now,shared);
  let estimates=0,inferred=0;
  for(let i=0;i<now.length;i+=TRIANGLE_WORDS){
    const flags=current.words[i+10];
    if(flags&HUD || billboardPart(current.words,i) || !previousSources.has(trackSource(current.words,i)))continue;
    const a=i,b=i+VERTEX_WORDS,c=b+VERTEX_WORDS;
    const out=a/VERTEX_WORDS*3;
    if(output[out+2] && output[out+5] && output[out+8])continue;
    const spanX=Math.max(now[a],now[b],now[c])-Math.min(now[a],now[b],now[c]);
    const spanY=Math.max(now[a+1],now[b+1],now[c+1])-Math.min(now[a+1],now[b+1],now[c+1]);
    const q=Math.min(now[a+3],now[b+3],now[c+3]);
    if(!(q>0) || spanX>24 || spanY>24 || Math.max(now[a+3],now[b+3],now[c+3])>q*1.18)continue;
    for(let v=i;v<i+TRIANGLE_WORDS;v+=VERTEX_WORDS){
      const dst=v/VERTEX_WORDS*3;
      const id=vertexKey(current,v),head=shared.get(id);
      if(output[dst+2] || findVertex(current,v,head))continue;
      const pose=estimateCamera(cells,now[v],now[v+1],now[v+3]);
      if(!pose)continue;
      shared.set(id,{vertex:v,from:UNMATCHED,pose,next:head});
      estimates++;
    }
  }
  // Reuse the estimate on every copy of a shared position, including faces
  // too large to qualify as a source of estimates themselves.
  if(!estimates)return 0;
  for(let i=0;i<now.length;i+=TRIANGLE_WORDS){
    if(current.words[i+10]&HUD)continue;
    for(let v=i;v<i+TRIANGLE_WORDS;v+=VERTEX_WORDS){
      const entry=findVertex(current,v,shared.get(vertexKey(current,v)));
      if(entry?.pose){
        output.set(entry.pose,v/VERTEX_WORDS*3);
        inferred++;
      }
    }
  }
  return inferred;
}

// The rasterizer publishes an unindexed triangle list. Resolve shared
// positions once so different faces can't move a common edge independently.
function weldPose(previous, current, pairs, uses, output, previousSources) {
  const shared=new Map();
  const before=previous.floats, now=current.floats;
  let matched=0, moving=0, conflicts=0;
  output.fill(0);
  for(let i=0;i<pairs.length;i++){
    const start=pairs[i];
    if(start===UNMATCHED || uses[start/TRIANGLE_WORDS]!==1)continue;
    matched++;
    for(let v=0;v<TRIANGLE_WORDS;v+=VERTEX_WORDS){
      const vertex=i*TRIANGLE_WORDS+v, id=vertexKey(current,vertex), from=start+v;
      const head=shared.get(id);
      const entry=findVertex(current,vertex,head);
      if(!entry){shared.set(id,{vertex,from,next:head});continue;}
      if(entry.from===UNMATCHED)continue;
      const at=entry.from;
      if(Math.abs(before[at]-before[from])+Math.abs(before[at+1]-before[from+1])>0.5 ||
         Math.abs(before[at+3]-before[from+3])>Math.max(before[at+3],before[from+3])*0.003){
        entry.from=UNMATCHED;
        conflicts++;
      }
    }
  }
  // Low coverage indicates a discontinuity, such as a sharp camera cut.
  if(matched<Math.max(3,pairs.length*0.25))return null;
  for(let i=0;i<current.words.length;i+=TRIANGLE_WORDS){
    if(current.words[i+10]&HUD)continue;
    for(let v=i;v<i+TRIANGLE_WORDS;v+=VERTEX_WORDS){
      const entry=findVertex(current,v,shared.get(vertexKey(current,v)));
      if(!entry || entry.from===UNMATCHED)continue;
      const p=entry.from, dst=v/VERTEX_WORDS*3;
      output[dst]=before[p];
      output[dst+1]=before[p+1];
      output[dst+2]=before[p+3];
      if(Math.abs(before[p]-now[v])+Math.abs(before[p+1]-now[v+1])>0.15)moving++;
    }
  }
  const billboard=previousSources.has(BILLBOARD_SOURCE)?continueBillboard(previous,current,output):0;
  if(!moving&&!billboard)return null;
  const inferred=inheritCameraMotion(previous,current,output,shared,previousSources);
  return {matched,moving:moving+inferred+billboard,conflicts,inferred,billboard};
}

function bridgePose(previous, current, output) {
  const groups = new Map();
  const previousSources=new Set();
  for (let i = 0; i < previous.words.length; i += TRIANGLE_WORDS) {
    const id = key(previous, i);
    if (id === null) continue;
    previousSources.add(trackSource(previous.words,i));
    let group = groups.get(id);
    if (!group) groups.set(id, group = []);
    if (group.length <= MAX_CANDIDATES) group.push(i);
  }
  const pairs = new Int32Array(current.words.length / TRIANGLE_WORDS).fill(UNMATCHED);
  const uses = new Uint8Array(previous.words.length / TRIANGLE_WORDS);
  for (let i = 0; i < current.words.length; i += TRIANGLE_WORDS) {
    const group = groups.get(key(current, i));
    if (!group || group.length > MAX_CANDIDATES) continue;
    let best = Infinity, second = Infinity, candidate = UNMATCHED;
    for (const p of group) {
      const score = distance(current.floats, i, previous.floats, p);
      if (score < best) {second = best;best = score;candidate = p;}
      else if (score < second) second = score;
    }
    if (candidate === UNMATCHED || second <= best*1.35 + 2 || !compatible(current,i,previous,candidate)) continue;
    pairs[i/TRIANGLE_WORDS] = candidate;
    const index = candidate/TRIANGLE_WORDS;
    if (uses[index] < 2) uses[index]++;
  }
  return weldPose(previous,current,pairs,uses,output,previousSources);
}

export function createGeometryInterpolation() {
  let latest = null, pose = null, result = null;
  let snapshot = new Uint8Array(0), positions = new Float32Array(0);
  return {
    reset() {latest = null;pose = null;result = null;},
    stats() {return result;},
    capture(owner, bytes, frame, view) {
      if (latest?.owner === owner && latest.frame === frame && latest.view === view) return pose;
      const count = bytes.byteLength / (VERTEX_WORDS*4);
      pose = null;
      result = null;
      if (count && latest?.owner === owner && latest.view === view && frame === latest.frame+1) {
        if (positions.length < count*3) positions = new Float32Array(Math.ceil(count*3/4096)*4096);
        const candidate = positions.subarray(0,count*3);
        result = bridgePose(views(snapshot.subarray(0,latest.bytes)),views(bytes),candidate);
        if (result) pose = candidate;
      }
      if (snapshot.length < bytes.length) snapshot = new Uint8Array(Math.ceil(bytes.length/65536)*65536);
      snapshot.set(bytes);
      latest = {owner,view,frame,bytes:bytes.length};
      return pose;
    },
  };
}
