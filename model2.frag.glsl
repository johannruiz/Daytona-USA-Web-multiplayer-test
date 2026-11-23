#version 300 es
// BSD-3-Clause. Same Model 2 raster rules as model2.wgsl; integer texture RAM.
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D uTexram;
uniform sampler2D uReplacementImage;
uniform usampler2D uLuma;
uniform usampler2D uXlat;
uniform float uOutputHeight;
uniform vec4 uNight;
uniform vec4 uNightShape;
uniform vec4 uNightWorld;
uniform vec4 uNightLamp;
uniform vec4 uNightDirection;
uniform vec4 uNightRight;
uniform vec4 uNightUp;
uniform vec4 uNightBeam;
uniform vec4 uView;
uniform vec2 uOutput;
uniform float uTop;
float night_fade(float distance,float start,float end){
 float compact=smoothstep(start,end,distance);
 float extra=uNightShape.w;
 if(extra<=0.0)return compact;
 float t=max(0.0,distance-start)/max(end-start,0.0001);
 float spread=1.0+extra;
 float extended=1.0-exp2(-4.0*t*t/(spread*spread));
 return mix(compact,extended,min(extra,1.0));
}
vec4 night_world(vec4 c,float oz){
 if(uNight.x<=0.0)return c;
 vec2 pixel=vec2(gl_FragCoord.x,uOutputHeight-gl_FragCoord.y);
 vec2 ray=(pixel-vec2(0.0,uTop)-vec2(uOutput.x,uView.y*uView.w)*0.5)/(248.0*uView.w);
 float depth=1.0/max(abs(oz),0.000001);

 vec3 rgb=c.rgb*uNightWorld.rgb;
 float luminance=dot(rgb,vec3(0.2126,0.7152,0.0722));
 vec3 graded=max(vec3(0.0),mix(vec3(luminance),rgb,uNightShape.z));
 if(uNightBeam.x>0.5){
  vec3 point=vec3(ray.x,-ray.y,1.0)*depth;
  vec3 delta=point-uNightLamp.xyz;
  vec3 direction=uNightDirection.xyz*uNightRight.w+uNightUp.xyz*uNightDirection.w;
  vec3 up=uNightUp.xyz*uNightRight.w-uNightDirection.xyz*uNightDirection.w;
  float along=dot(delta,direction);
  float reach=max(along,0.0);
  vec2 radius=vec2(0.9,0.55)+reach*vec2(uNightBeam.w,uNightUp.w);
  vec2 crossSection=vec2(dot(delta,uNightRight.xyz),dot(delta,up))/radius;
  float edge=1.0-smoothstep(uNightBeam.z,1.0,length(crossSection));
  float cone=edge*smoothstep(0.0,0.6,along)*(1.0-night_fade(reach,uNight.y,uNight.z))*uNightLamp.w;
  float ambient=uNightBeam.y/(1.0+depth/max(uNight.z*2.0,1.0));
  float visibility=ambient+(1.0-ambient)*cone;
  return mix(c,vec4(mix(vec3(0.001,0.0015,0.003),graded,visibility),c.a),uNight.x);
 }
 float forward=night_fade(depth,uNight.y,uNight.z);
 float side=night_fade(abs(ray.x)*depth,uNightShape.x*uNightShape.y,uNightShape.x);
 float fog=1.0-(1.0-forward)*(1.0-side);
 return mix(c,vec4(mix(graded,vec3(0.001,0.0015,0.003),fog),c.a),uNight.x);
}
vec4 night_hud(vec4 c,uint flags){
 if((flags&(1u<<11u))==0u)return c;
 return mix(c,vec4(max(c.rgb,vec3(0.4)),c.a),uNight.x);
}
in vec3 vOz;
flat in vec4 vColor;
flat in uvec4 vInfo;
flat in uvec2 vMore;
layout(location=0) out vec4 outColor;
uint texram(uint i){return texelFetch(uTexram,ivec2(int(i&1023u),int(i>>10u)),0).r;}
uint lumaram(uint i){return texelFetch(uLuma,ivec2(int(i&255u),int(i>>8u)),0).r;}
uint xlat(uint i){return texelFetch(uXlat,ivec2(int(i&255u),int(i>>8u)),0).r;}
const uint log_table[128]=uint[128](0u,2u,5u,8u,11u,14u,16u,19u,22u,25u,27u,30u,33u,35u,38u,40u,43u,46u,48u,51u,53u,56u,58u,61u,63u,65u,68u,70u,73u,75u,77u,80u,82u,84u,87u,89u,91u,93u,96u,98u,100u,102u,104u,106u,109u,111u,113u,115u,117u,119u,121u,123u,125u,127u,129u,132u,134u,136u,138u,140u,141u,143u,145u,147u,149u,151u,153u,155u,157u,159u,161u,162u,164u,166u,168u,170u,172u,173u,175u,177u,179u,181u,182u,184u,186u,188u,189u,191u,193u,194u,196u,198u,200u,201u,203u,205u,206u,208u,209u,211u,213u,214u,216u,218u,219u,221u,223u,224u,225u,227u,229u,230u,232u,233u,235u,236u,238u,239u,241u,242u,244u,245u,247u,248u,250u,251u,253u,254u);
int fast_log2(float value){
 if(value<0.0)return 0;
 uint iv=floatBitsToUint(value)>>16u;
 return ((int(iv>>7u)-127)<<8)|int(log_table[iv&127u]);
}
int to_s32(float f){if(!(f>=-2147483648.0&&f<2147483648.0))return int(0x80000000u);return int(f);}
uint lerp8(uint x,uint y,uint a){return (x+(((y-x)*a)>>8u))&0x00ff00ffu;}
uint get_texel(uint bx,uint by,int x,int y,uint sheet){
 int x2=int(bx)+x,y2=int(by)+y;
 if(x2>=1024){x2-=1024;y2^=1024;}
 uint off=uint((y2/2)*512+(x2/2));
 uint t=texram(sheet*0x80000u+((off>>1u)&0x7ffffu));
 if((off&1u)!=0u)t>>=16u;
 if((y&1)==0)t>>=8u;
 if((x&1)==0)t>>=4u;
 return t&15u;
}
uint fetch_texel(uvec4 info,int level,int uin,int vin,bool trans){
 uint flags=info.x;bool swap=((flags>>10u)&1u)!=0u;
 int u=uin,v=vin;uint tw,th,tx,ty,sheet;
 if(level==-1){
  tw=128u;th=128u;tx=info.z&65535u;ty=info.z>>16u;sheet=swap?0u:1u;
  uint sh=1u<<((flags>>8u)&3u);u<<=sh;v<<=sh;
 }else{
  tw=(32u<<((flags>>17u)&7u))>>uint(level);th=(32u<<((flags>>20u)&7u))>>uint(level);
  tx=(((info.y&65535u)-2048u)>>uint(level))&2047u;
  ty=(((info.y>>16u)-1024u)>>uint(level))&1023u;
  sheet=(((level&1)!=0)!=swap)?1u:0u;u>>=uint(level);v>>=uint(level);
 }
 if(((flags>>5u)&1u)!=0u&&(u&int(tw<<8u))!=0)u=~u;
 if(((flags>>6u)&1u)!=0u&&(v&int(th<<8u))!=0)v=~v;
 u-=128;v-=128;
 uint uf=uint(u)&255u,vf=uint(v)&255u;
 int u0=int(uint(u>>8)&(tw-1u)),u1=int(uint(u0+1)&(tw-1u));
 int v0=int(uint(v>>8)&(th-1u)),v1=int(uint(v0+1)&(th-1u));
 if(((flags>>3u)&1u)==0u&&u1==0){if(uf>=128u){u0=u1;u1++;uf=0u;}else{u1=u0;u0--;uf=256u;}}
 if(((flags>>4u)&1u)==0u&&v1==0){if(vf>=128u){v0=0;v1++;vf=0u;}else{v1=v0;v0--;vf=256u;}}
 uint t00=get_texel(tx,ty,u0,v0,sheet)<<4u,t01=get_texel(tx,ty,u1,v0,sheet)<<4u;
 uint t10=get_texel(tx,ty,u0,v1,sheet)<<4u,t11=get_texel(tx,ty,u1,v1,sheet)<<4u;
 if(trans){
  if(t00!=240u)t00|=0x00800000u;if(t01!=240u)t01|=0x00800000u;
  if(t10!=240u)t10|=0x00800000u;if(t11!=240u)t11|=0x00800000u;
  if(t00==240u)t00=t01&255u;if(t01==240u)t01=t00&255u;
  if(t10==240u)t10=t11&255u;if(t11==240u)t11=t10&255u;
 }
 uint t0=lerp8(t00,t01,uf),t1=lerp8(t10,t11,uf);
 if(trans){if(t0==240u)t0=t1&255u;if(t1==240u)t1=t0&255u;}
 return lerp8(t0,t1,vf);
}

float replacementAxis(float value,bool mirror){
 return mirror&&(int(floor(value))&1)!=0?1.0-fract(value):fract(value);
}

float replacementLight(uint mode,uint lb,uint pl){
 float light=float(pl&254u)/255.0;
 switch(mode){
  case 1u:return light*1.10;
  case 2u:case 3u:case 4u:{
   float scale=mode==2u?2.0:mode==3u?1.50:1.30;
   // ElSemi uploads the 6-bit luma table as 8-bit luminance.
   uint translated=min(lumaram(lb+(pl>>1u))&65535u,63u)*4u;
   return float(translated)/255.0*scale;
  }
  case 5u:return light*1.35;
  case 6u:return light*1.36;
  case 7u:return light*2.40;
  default:return light*2.0;
 }
}

void main(){
 uint flags=vInfo.x;
 if(((flags>>2u)&1u)!=0u){uvec2 p=uvec2(gl_FragCoord.x,uOutputHeight-gl_FragCoord.y);if(((p.x^p.y)&1u)==0u)discard;}
 uint renderer=flags&3u;if(renderer<2u){outColor=(flags&(1u<<23u))!=0u?night_hud(vColor,flags):night_world(vColor,vOz.x);return;}
 bool trans=renderer==3u;int maxlevel=int((flags>>12u)&31u);
 float z=1.0/vOz.x;int mml=-int(vMore.x)+fast_log2(z),level=clamp(mml>>7,0,maxlevel);
 int u=to_s32(vOz.y*z*256.0),v=to_s32(vOz.z*z*256.0);
 uint lb=vInfo.w&65535u,pl=vInfo.w>>16u;
 uint t;
 if(vColor.z<0.0){
  uint replacement=uint(-vColor.z);
  vec2 size=vec2(float(replacement>>4u),vColor.w);
  float tw=float(32u<<((flags>>17u)&7u)),th=float(32u<<((flags>>20u)&7u));
  vec2 uv=vec2(replacementAxis(float(u)/(256.0*tw),(flags&32u)!=0u),
               replacementAxis(float(v)/(256.0*th),(flags&64u)!=0u));
  vec2 pixel=vColor.xy+clamp(uv*size,vec2(0.5),size-vec2(0.5));
  vec4 texel=textureLod(uReplacementImage,pixel/vec2(textureSize(uReplacementImage,0)),0.0);
  uint mode=replacement&15u;
  if(trans&&texel.a*(mode==5u?1.5:mode==6u||mode==7u?4.0:1.0)<0.5)discard;
  if(mode!=0u){
   vec4 result=vec4(clamp(texel.rgb*replacementLight(mode,lb,pl),0.0,1.0),1.0);
   outColor=(flags&(1u<<23u))!=0u?night_hud(result,flags):night_world(result,vOz.x);
   return;
  }
  t=uint(texel.r*240.0+0.5);
 }else{
  t=fetch_texel(vInfo,level,u,v,trans);
  if(mml>0&&level<maxlevel)t=lerp8(t,fetch_texel(vInfo,level+1,u,v,trans),uint((mml&127)<<1));
  else if(((flags>>7u)&1u)!=0u&&mml<0)t=lerp8(t,fetch_texel(vInfo,-1,u,v,trans),uint(min((-mml)>>((flags>>8u)&3u),127)));
  if(trans){if(t<0x00400000u)discard;t&=255u;}
 }
 uint luma=min(((lumaram(lb+(t>>1u))&255u)*pl/256u)&255u,63u),c=vMore.y;
 outColor=vec4(float(xlat(((c&31u)<<8u)+luma)),float(xlat(0x2000u+(((c>>5u)&31u)<<8u)+luma)),float(xlat(0x4000u+(((c>>10u)&31u)<<8u)+luma)),255.0)/255.0;
 if((flags&(1u<<23u))!=0u){outColor=night_hud(outColor,flags);return;}
 outColor=night_world(outColor,vOz.x);
}
