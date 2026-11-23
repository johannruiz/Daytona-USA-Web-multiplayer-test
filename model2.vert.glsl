#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 aPosition;
layout(location=1) in float aDepth;
layout(location=2) in vec3 aOz;
layout(location=3) in vec4 aColor;
layout(location=4) in uvec4 aInfo;
layout(location=5) in uvec2 aMore;
layout(location=6) in vec3 aPrevious;
uniform vec2 uOutput;
uniform vec4 uView; // native width, height, left offset, scale
uniform float uTop;
uniform float uGeometryAlpha;
out vec3 vOz;
flat out vec4 vColor;
flat out uvec4 vInfo;
flat out uvec2 vMore;
void main(){
 vec2 position=aPosition;
 vec3 oz=aOz;
 if(uGeometryAlpha<1.0&&aPrevious.z>0.0&&aOz.x>0.0){
  float denominator=mix(aOz.x,aPrevious.z,uGeometryAlpha);
  position=mix(aPrevious.xy,aPosition,uGeometryAlpha*aPrevious.z/denominator);
  oz*=aPrevious.z/denominator;
 }
 float y=1.0-position.y/uView.y*2.0;
 float viewportHeight=uView.y*uView.w;
 gl_Position=vec4((position.x-uView.z)/uView.x*2.0-1.0,
  y*(viewportHeight/uOutput.y)+(1.0-(2.0*uTop+viewportHeight)/uOutput.y),aDepth*2.0-1.0,1.0);
 vOz=oz;vColor=aColor;vInfo=aInfo;vMore=aMore;
}
