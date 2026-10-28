#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "browser.glsl"
#include "text.glsl"
#include "draw.glsl"
const vec3 WHITE=vec3(.89,.94,.97),MUTED=vec3(.52,.65,.73),CYAN=vec3(.40,.86,.84),GOLD=vec3(1,.79,.41);
const uint DYNAMIC_BASE=(0x300000u-1024u)/4u;
float dynamicText(vec2 p,vec2 origin,ivec4 rect){
 vec2 local=p-origin;ivec2 q=ivec2(floor(local));
 if(any(lessThan(local,vec2(0)))||any(greaterThanEqual(q,rect.zw)))return 0.0;
 uint at=uint((q.y+rect.y)*2048+q.x+rect.x),word=c.atlas[DYNAMIC_BASE+at/4u];
 return float((word>>((at%4u)*8u))&255u)/255.0;
}
float centered(vec2 p,float y,ivec4 rect){return text(p,vec2(960-float(rect.z)*.5,y),rect);}
float folder(vec2 p){return max(fill(box(p,vec2(0,2),vec2(12,8),2)),fill(box(p,vec2(-5,-6),vec2(7,4),2)));}
void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 color=mix(vec3(.042,.069,.10),vec3(.065,.11,.145),p.y/1080.0);
 color=mix(color,WHITE,text(p,vec2(60,48),TEXT_TITLE));
 color=mix(color,vec3(.10,.23,.27),fill(box(p,vec2(1798,76),vec2(62,24),24)));
 color=mix(color,CYAN,text(p,vec2(1798-float(TEXT_READONLY.z)*.5,62),TEXT_READONLY));
 bool have=fbWord(FC_HAVE_META)!=0u;
 if(have)color=mix(color,CYAN,dynamicText(p,vec2(60,135),ivec4(0,0,1800,60)));
 color=mix(color,vec3(.084,.13,.175),fill(box(p,vec2(960,555),vec2(900,363),18)));
 uint error=fbError();bool showData=have&&(error==0u||error==1u);
 if(showData&&fbMode()==1u&&error==0u){
  color=mix(color,MUTED,text(p,vec2(108,202),TEXT_NAME));
  color=mix(color,MUTED,text(p,vec2(1690,202),TEXT_SIZE));
  float y=p.y-232.0;int row=int(floor(y/56.0));
  if(p.x>=60.0&&p.x<1860.0&&y>=0.0&&row<12){
   uint count=fbRowCount();
   if(uint(row)<count){
    bool selected=uint(row)==fbSelection();
    if(selected){
     color=mix(color,vec3(.10,.27,.32),fill(box(p,vec2(960,260+float(row)*56.0),vec2(888,26),8)));
     color=mix(color,CYAN,fill(box(p,vec2(75,260+float(row)*56.0),vec2(2,15),2)));
    }else if((row&1)==1)color=mix(color,vec3(.11,.17,.21),.45);
    uint type=fbMeta(1024u+uint(row)*1024u);
    vec2 icon=p-vec2(88,260+float(row)*56.0);
    float shape=type==1u?folder(icon):line(box(icon,vec2(0),vec2(8,11),1),1.2);
    color=mix(color,type==1u?GOLD:MUTED,shape);
   }
   // Empty-directory status is also rendered in the first row by the host.
   color=mix(color,WHITE,dynamicText(p,vec2(60,232+float(row)*56.0),ivec4(0,128+row*64,1800,56)));
  }
 }else if(showData){
  color=mix(color,error==1u?vec3(1,.64,.55):WHITE,dynamicText(p,vec2(60,208),ivec4(0,128,1800,736)));
 }
 if(showData){
  color=mix(color,MUTED,dynamicText(p,vec2(60,910),ivec4(0,928,1800,48)));
  color=mix(color,MUTED,dynamicText(p,vec2(60,947),ivec4(0,64,1800,48)));
 }
 if(error==1u){
  color=mix(color,GOLD,text(p,vec2(92,196),TEXT_ERROR));
  color=mix(color,MUTED,centered(p,835,TEXT_RETRY));
 }
 // Keep button help available even if the host font renderer failed.
 ivec4 keys=fbMode()==1u?TEXT_LIST_KEYS:TEXT_FILE_KEYS;
 color=mix(color,MUTED,text(p,vec2(60,1020),keys));
 if(!fbConnected())color=mix(color,GOLD,text(p,vec2(1650,1020),TEXT_DISCONNECTED));
 bool overlay=fbBusy()||fbWaiting()!=0u||!have||error>=2u;
 if(overlay){
  color=mix(color,vec3(.035,.065,.09),fill(box(p,vec2(960,555),vec2(899,362),18))*.83);
  ivec4 message=TEXT_LOADING;
  if(fbWaiting()==1u)message=TEXT_HOST;
  if(fbWaiting()==2u)message=TEXT_WAITING;
  if(error==2u)message=TEXT_PROTOCOL;
  if(error==3u)message=TEXT_UNSUPPORTED;
  if(error==4u)message=TEXT_LONGPATH;
  color=mix(color,error>=2u?GOLD:CYAN,centered(p,510,message));
  if(error>=2u)color=mix(color,MUTED,centered(p,580,TEXT_RETRY));
 }
 outColor=vec4(color*(1.0-clamp(c.transition.x,0.0,1.0)),1);
}
