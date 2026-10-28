#version 450
#extension GL_GOOGLE_include_directive : require
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "nes.glsl"
#include "pixel.glsl"
#include "ui.glsl"
layout(location=0) out vec4 outColor;
// Fixed approximate RGB palette; no claims of analog NTSC color accuracy.
const uint RGB[64]=uint[64](
 0x666666u,0x002a88u,0x1412a7u,0x3b00a4u,0x5c007eu,0x6e0040u,0x6c0600u,0x561d00u,
 0x333500u,0x0b4800u,0x005200u,0x004f08u,0x00404du,0x000000u,0x000000u,0x000000u,
 0xadadadu,0x155fd9u,0x4240ffu,0x7527feu,0xa01accu,0xb71e7bu,0xb53120u,0x994e00u,
 0x6b6d00u,0x388700u,0x0c9300u,0x008f32u,0x007c8du,0x000000u,0x000000u,0x000000u,
 0xfffeffu,0x64b0ffu,0x9290ffu,0xc676ffu,0xf36affu,0xfe6eccu,0xfe8170u,0xea9e22u,
 0xbcbe00u,0x88d800u,0x5ce430u,0x45e082u,0x48cddeu,0x4f4f4fu,0x000000u,0x000000u,
 0xfffeffu,0xc0dfffu,0xd3d2ffu,0xe8c8ffu,0xfbc2ffu,0xfec4eau,0xfeccc5u,0xf7d8a5u,
 0xe4e594u,0xcfef96u,0xbdf4abu,0xb3f3ccu,0xb5ebf2u,0xb8b8b8u,0x000000u,0x000000u);
vec3 nesColor(uint index){uint p=RGB[index&63u];return vec3((p>>16u)&255u,(p>>8u)&255u,p&255u)/255.0;}
float label(ivec2 p,ivec2 origin,ivec4 rect){
 ivec2 q=p-origin;if(any(lessThan(q,ivec2(0)))||any(greaterThanEqual(q,rect.zw)))return 0.0;
 uint i=uint((q.y+rect.y)*1024+q.x+rect.x);
 return float((c.atlas[131072u+i/4u]>>((i&3u)*8u))&255u)/255.0;
}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);vec3 color=vec3(.035,.050,.073);
 ivec2 q=p-ivec2(448,60);
 if(all(greaterThanEqual(q,ivec2(0)))&&all(lessThan(q,ivec2(1024,960)))){
  color=nesColor(nesPixel(uint(q.x/4),uint(q.y/4)));
  if(NR(R_PAUSED)!=0u||NR(R_FAULT)!=0u)color*=.30;
 }
 float ink=label(p,ivec2(48,20),UI_TITLE);
 ink=max(ink,label(p,ivec2(48,240),UI_MOVE));
 ink=max(ink,label(p,ivec2(48,290),UI_JUMP));
 ink=max(ink,label(p,ivec2(48,340),UI_RUN));
 ink=max(ink,label(p,ivec2(48,390),UI_START));
 ink=max(ink,label(p,ivec2(48,440),UI_SELECT));
 ink=max(ink,label(p,ivec2(48,490),UI_PAUSE));
 ink=max(ink,label(p,ivec2(48,540),UI_RESET));
 ink=max(ink,label(p,ivec2(48,590),UI_EXIT));
 ink=max(ink,label(p,ivec2(48,1038),UI_FOOTER));
 color=mix(color,vec3(.80,.85,.92),ink);
 if(NR(R_PAUSED)!=0u)color=mix(color,vec3(.98,.82,.36),label(p,ivec2(835,510),UI_PAUSED));
 if(NR(R_FAULT)!=0u)color=mix(color,vec3(1,.4,.4),label(p,ivec2(650,560),UI_FAULT));
 outColor=vec4(color,1);
}
