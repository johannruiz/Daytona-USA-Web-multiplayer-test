// BSD-3-Clause. Port of upstream src/app/gpu/m2.hlsl (Model 2 raster rules).
struct Screen { size: vec2f, pad: vec2f, origin: vec2f, unused: vec2f }
@group(0) @binding(0) var<uniform> screen: Screen;
@group(0) @binding(1) var<storage, read> texram: array<u32>;
@group(0) @binding(2) var<storage, read> lumaram: array<u32>;
@group(0) @binding(3) var<storage, read> xlat: array<u32>;
struct Night { base:vec4f, shape:vec4f, world:vec4f, sky:vec4f, lamp:vec4f, direction:vec4f, right:vec4f, up:vec4f, beam:vec4f }
@group(0) @binding(4) var<uniform> night:Night;
@group(0) @binding(5) var replacement_image:texture_2d<f32>;
@group(0) @binding(6) var replacement_sampler:sampler;
// Keep the original fade through 100%; blend into a long, continuous tail above it.
fn night_fade(distance:f32,start:f32,end:f32)->f32 {
 let compact=smoothstep(start,end,distance);
 let extra=night.shape.w;
 if(extra<=0.0){return compact;}
 let t=max(0.0,distance-start)/max(end-start,0.0001);
 let spread=1.0+extra;
 let extended=1.0-exp2(-4.0*t*t/(spread*spread));
 return mix(compact,extended,min(extra,1.0));
}
fn night_world(c:vec4f,oz:f32,p:vec2f)->vec4f {
 if(night.base.x<=0.0){return c;}
 // Use original reciprocal camera depth, not the synthetic draw-order Z.
 let ray=(p-screen.origin-screen.size*screen.pad.y*0.5)/(248.0*screen.pad.y);
 let depth=1.0/max(abs(oz),0.000001);

 let rgb=c.rgb*night.world.rgb;
 let luminance=dot(rgb,vec3f(0.2126,0.7152,0.0722));
 let graded=max(vec3f(0.0),mix(vec3f(luminance),rgb,night.shape.z));
 if(night.beam.x>0.5){
  let point=vec3f(ray.x,-ray.y,1.0)*depth;
  let delta=point-night.lamp.xyz;
  // Dip relative to the body, including pitch/roll on hills and banks.
  let direction=night.direction.xyz*night.right.w+night.up.xyz*night.direction.w;
  let up=night.up.xyz*night.right.w-night.direction.xyz*night.direction.w;
  let along=dot(delta,direction);
  let reach=max(along,0.0);
  let radius=vec2f(0.9,0.55)+reach*vec2f(night.beam.w,night.up.w);
  let cross=vec2f(dot(delta,night.right.xyz),dot(delta,up))/radius;
  let edge=1.0-smoothstep(night.beam.z,1.0,length(cross));
  let cone=edge*smoothstep(0.0,0.6,along)*(1.0-night_fade(reach,night.base.y,night.base.z))*night.lamp.w;
  let ambient=night.beam.y/(1.0+depth/max(night.base.z*2.0,1.0));
  let visibility=ambient+(1.0-ambient)*cone;
  return mix(c,vec4f(mix(vec3f(0.001,0.0015,0.003),graded,visibility),c.a),night.base.x);
 }
 let forward=night_fade(depth,night.base.y,night.base.z);
 let side=night_fade(abs(ray.x)*depth,night.shape.x*night.shape.y,night.shape.x);
 let fog=1.0-(1.0-forward)*(1.0-side);
 return mix(c,vec4f(mix(graded,vec3f(0.001,0.0015,0.003),fog),c.a),night.base.x);
}
// Only dedicated route meshes receive a neutral night contrast floor.
// Markers keep their original colors; day and all world geometry stay intact.
fn night_hud(c:vec4f,flags:u32)->vec4f {
 if((flags&(1u<<11u))==0u){return c;}
 return mix(c,vec4f(max(c.rgb,vec3f(0.4)),c.a),night.base.x);
}
struct In {
 @location(0) pos: vec2f, @location(1) depth: f32, @location(2) oz: vec3f,
 @location(3) color: vec4f, @location(4) info: vec4u, @location(5) more: vec2u,
 @location(6) previous: vec3f
}
struct Out {
 @builtin(position) pos: vec4f,
 @location(0) @interpolate(linear) oz: vec3f,
 @location(1) @interpolate(flat) color: vec4f,
 @location(2) @interpolate(flat) info: vec4u,
 @location(3) @interpolate(flat) more: vec2u
}
@vertex fn vs_poly(i: In) -> Out {
 var o: Out;
 var position=i.pos;
 var oz=i.oz;
 let alpha=screen.unused.x;
 if(alpha<1.0 && i.previous.z>0.0 && i.oz.x>0.0){
  // Lerp in view space, then project. Keep this tick's material and Z order.
  let denominator=mix(i.oz.x,i.previous.z,alpha);
  position=mix(i.previous.xy,i.pos,alpha*i.previous.z/denominator);
  oz*=i.previous.z/denominator;
 }
 o.pos=vec4f((position.x-screen.pad.x)/screen.size.x*2.0-1.0,1.0-position.y/screen.size.y*2.0,i.depth,1.0);
 o.oz=oz; o.color=i.color; o.info=i.info; o.more=i.more;
 return o;
}
const log_table=array<u32,128>(0,2,5,8,11,14,16,19,22,25,27,30,33,35,38,40,43,46,48,51,53,56,58,61,63,65,68,70,73,75,77,80,82,84,87,89,91,93,96,98,100,102,104,106,109,111,113,115,117,119,121,123,125,127,129,132,134,136,138,140,141,143,145,147,149,151,153,155,157,159,161,162,164,166,168,170,172,173,175,177,179,181,182,184,186,188,189,191,193,194,196,198,200,201,203,205,206,208,209,211,213,214,216,218,219,221,222,224,225,227,229,230,232,233,235,236,238,239,241,242,244,245,247,248,250,251,253,254);
fn fast_log2(value:f32)->i32 {
 if(value<0.0){return 0;}
 let iv=bitcast<u32>(value)>>16u;
 return ((i32(iv>>7u)-127)<<8u)|i32(log_table[iv&127u]);
}
fn to_s32(f:f32)->i32 {
 if(!(f>=-2147483648.0 && f<2147483648.0)){return bitcast<i32>(0x80000000u);}
 return i32(f);
}
fn lerp8(x:u32,y:u32,a:u32)->u32 {return (x+(((y-x)*a)>>8u))&0x00ff00ffu;}
fn get_texel(bx:u32,by:u32,x:i32,y:i32,sheet:u32)->u32 {
 var x2=i32(bx)+x; var y2=i32(by)+y;
 if(x2>=1024){x2-=1024;y2^=1024;}
 let off=u32((y2/2)*512+(x2/2));
 var t=texram[sheet*0x80000u+((off>>1u)&0x7ffffu)];
 if((off&1u)!=0u){t>>=16u;}
 if((y&1)==0){t>>=8u;}
 if((x&1)==0){t>>=4u;}
 return t&15u;
}
fn fetch_texel(info:vec4u,level:i32,uin:i32,vin:i32,trans:bool)->u32 {
 let flags=info.x; let swap=((flags>>10u)&1u)!=0u;
 var u=uin; var v=vin;
 var tw:u32; var th:u32; var tx:u32; var ty:u32; var sheet:u32;
 if(level == -1){
  tw=128u;th=128u;tx=info.z&65535u;ty=info.z>>16u;
  sheet=select(1u,0u,swap);
  let sh=1u<<((flags>>8u)&3u);u<<=sh;v<<=sh;
 }else{
  tw=(32u<<((flags>>17u)&7u))>>u32(level);
  th=(32u<<((flags>>20u)&7u))>>u32(level);
  tx=(((info.y&65535u)-2048u)>>u32(level))&2047u;
  ty=(( (info.y>>16u)-1024u)>>u32(level))&1023u;
  sheet=select(0u,1u,((level&1)!=0)!=swap);
  u>>=u32(level);v>>=u32(level);
 }
 if(((flags>>5u)&1u)!=0u && (u&i32(tw<<8u))!=0){u=~u;}
 if(((flags>>6u)&1u)!=0u && (v&i32(th<<8u))!=0){v=~v;}
 u-=128;v-=128;
 var uf=u32(u)&255u; var vf=u32(v)&255u;
 var u0=i32(u32(u>>8u)&(tw-1u));var u1=i32(u32(u0+1)&(tw-1u));
 var v0=i32(u32(v>>8u)&(th-1u));var v1=i32(u32(v0+1)&(th-1u));
 if(((flags>>3u)&1u)==0u && u1==0){
  if(uf>=128u){u0=u1;u1++;uf=0u;}else{u1=u0;u0--;uf=256u;}
 }
 if(((flags>>4u)&1u)==0u && v1==0){
  if(vf>=128u){v0=0;v1++;vf=0u;}else{v1=v0;v0--;vf=256u;}
 }
 var t00=get_texel(tx,ty,u0,v0,sheet)<<4u;
 var t01=get_texel(tx,ty,u1,v0,sheet)<<4u;
 var t10=get_texel(tx,ty,u0,v1,sheet)<<4u;
 var t11=get_texel(tx,ty,u1,v1,sheet)<<4u;
 if(trans){
  if(t00!=240u){t00|=0x00800000u;}if(t01!=240u){t01|=0x00800000u;}
  if(t10!=240u){t10|=0x00800000u;}if(t11!=240u){t11|=0x00800000u;}
  if(t00==240u){t00=t01&255u;}if(t01==240u){t01=t00&255u;}
  if(t10==240u){t10=t11&255u;}if(t11==240u){t11=t10&255u;}
 }
 var t0=lerp8(t00,t01,uf);var t1=lerp8(t10,t11,uf);
 if(trans){if(t0==240u){t0=t1&255u;}if(t1==240u){t1=t0&255u;}}
 return lerp8(t0,t1,vf);
}

fn replacement_axis(value:f32,mirror:bool)->f32 {
 let tile=floor(value);
 return select(fract(value),1.0-fract(value),mirror && (i32(tile)&1)!=0);
}

fn replacement_light(mode:u32,lb:u32,pl:u32)->f32 {
 let light=f32(pl&254u)/255.0;
 switch mode {
  case 1u: {return light*1.10;}
  case 2u,3u,4u: {
   let scale=select(select(1.30,1.50,mode==3u),2.0,mode==2u);
   // ElSemi uploads the 6-bit luma table as 8-bit luminance.
   let translated=min(lumaram[lb+(pl>>1u)]&65535u,63u)*4u;
   return f32(translated)/255.0*scale;
  }
  case 5u: {return light*1.35;}
  case 6u: {return light*1.36;}
  case 7u: {return light*2.40;}
  default: {return light*2.0;}
 }
}

@fragment fn ps_poly(i:Out)->@location(0) vec4f {
 let flags=i.info.x;
 if(((flags>>2u)&1u)!=0u){let p=vec2u(i.pos.xy);if(((p.x^p.y)&1u)==0u){discard;}}
 let renderer=flags&3u;
 if(renderer<2u){if((flags&(1u<<23u))!=0u){return night_hud(i.color,flags);}return night_world(i.color,i.oz.x,i.pos.xy);}
 let trans=renderer==3u;let maxlevel=i32((flags>>12u)&31u);
 let z=1.0/i.oz.x;let mml= -bitcast<i32>(i.more.x)+fast_log2(z);
 let level=clamp(mml>>7u,0,maxlevel);
 let u=to_s32(i.oz.y*z*256.0);let v=to_s32(i.oz.z*z*256.0);
 let lb=i.info.w&65535u;let pl=i.info.w>>16u;
 var t:u32;
 if(i.color.z<0.0){
  let replacement=u32(-i.color.z);
  let size=vec2f(f32(replacement>>4u),i.color.w);
  let tw=f32(32u<<((flags>>17u)&7u));
  let th=f32(32u<<((flags>>20u)&7u));
  let uv=vec2f(replacement_axis(f32(u)/(256.0*tw),(flags&32u)!=0u),
               replacement_axis(f32(v)/(256.0*th),(flags&64u)!=0u));
  let pixel=i.color.xy+clamp(uv*size,vec2f(0.5),size-vec2f(0.5));
  let texel=textureSampleLevel(replacement_image,replacement_sampler,pixel/vec2f(textureDimensions(replacement_image)),0.0);
  let mode=replacement&15u;
  if(trans && texel.a*select(1.0,select(4.0,1.5,mode==5u),mode>=5u&&mode<=7u)<0.5){discard;}
  if(mode!=0u){
   let result=vec4f(clamp(texel.rgb*replacement_light(mode,lb,pl),vec3f(0.0),vec3f(1.0)),1.0);
   if((flags&(1u<<23u))!=0u){return night_hud(result,flags);}
   return night_world(result,i.oz.x,i.pos.xy);
  }
  t=u32(texel.r*240.0+0.5);
 }else{
  t=fetch_texel(i.info,level,u,v,trans);
  if(mml>0 && level<maxlevel){t=lerp8(t,fetch_texel(i.info,level+1,u,v,trans),u32((mml&127)<<1u));}
  else if(((flags>>7u)&1u)!=0u && mml<0){t=lerp8(t,fetch_texel(i.info,-1,u,v,trans),u32(min((-mml)>>((flags>>8u)&3u),127)));}
  if(trans){if(t<0x00400000u){discard;}t&=255u;}
 }
 let luma=min(((lumaram[lb+(t>>1u)]&255u)*pl/256u)&255u,63u);
 let c=i.more.y;
 let result=vec4f(f32(xlat[((c&31u)<<8u)+luma]),f32(xlat[0x2000u+(((c>>5u)&31u)<<8u)+luma]),f32(xlat[0x4000u+(((c>>10u)&31u)<<8u)+luma]),255.0)/255.0;
 if((flags&(1u<<23u))!=0u){return night_hud(result,flags);}
 return night_world(result,i.oz.x,i.pos.xy);
}
