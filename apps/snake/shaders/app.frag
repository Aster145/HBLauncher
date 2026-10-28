#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "game.glsl"
#include "text.glsl"
#include "draw.glsl"
const vec3 WHITE=vec3(.90,.95,.94), MUTED=vec3(.53,.65,.67);
const vec3 MINT=vec3(.49,.93,.64), CORAL=vec3(1,.46,.42);
const vec2 BOARD=vec2(90,245);
const float CELL=36.0;
float centered(vec2 p,float x,float y,ivec4 rect){return text(p,vec2(x-float(rect.z)*.5,y),rect);}
float number(vec2 p,vec2 origin,uint value,float scale){
 uint digits=1u,divisor=1u;
 for(uint v=value;v>=10u;v/=10u){digits++;divisor*=10u;}
 vec2 q=(p-origin)/scale;
 if(q.x<0.0||q.y<0.0||q.x>=float(digits)*56.0||q.y>=96.0)return 0.0;
 uint slot=uint(q.x/56.0);
 for(uint i=0u;i<slot;i++)divisor/=10u;
 uint digit=(value/divisor)%10u;
 return text(vec2(mod(q.x,56.0),q.y),vec2(0),ivec4(int(digit)*64,DIGITS_Y,64,96));
}
void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 color=mix(vec3(.043,.074,.102),vec3(.067,.12,.14),p.y/1080.0);
 color=mix(color,MINT,text(p,vec2(90,72),TEXT_TITLE));
 color=mix(color,MUTED,text(p,vec2(94,169),TEXT_SUBTITLE));
 // Board and side panel.
 color=mix(color,vec3(.18,.29,.30),fill(box(p,BOARD+vec2(540,360),vec2(547,367),15)));
 color=mix(color,vec3(.067,.111,.137),fill(box(p,BOARD+vec2(540,360),vec2(540,360),8)));
 color=mix(color,vec3(.088,.145,.17),fill(box(p,vec2(1530,605),vec2(300,360),24)));
 vec2 local=p-BOARD;ivec2 cell=ivec2(floor(local/CELL));
 if(all(greaterThanEqual(local,vec2(0)))&&all(lessThan(local,vec2(1080,720)))){
  uint id=uint(cell.y)*SNAKE_W+uint(cell.x);vec2 q=mod(local,CELL)-CELL*.5;
  if(((cell.x+cell.y)&1)==0)color=mix(color,vec3(.11,.17,.18),.24);
  color=mix(color,vec3(.23,.33,.33),fill(length(q)-1.1)*.3);
  if(snakeOccupied(cell)){
   bool head=id==snakeHeadCell();
   vec3 bodyColor=head?vec3(.74,1,.80):MINT;
   if(snakeStatus()==SNAKE_DEAD)bodyColor=mix(bodyColor,CORAL,.55);
   color=mix(color,bodyColor,fill(box(q,vec2(0),vec2(15.8),7)));
   if(head){
    uint dir=snakeDirection();
    vec2 forward=dir==0u?vec2(1,0):dir==1u?vec2(0,1):dir==2u?vec2(-1,0):vec2(0,-1);
    vec2 side=vec2(-forward.y,forward.x);
    float eyes=max(fill(length(q-forward*6.0-side*6.0)-2.7),fill(length(q-forward*6.0+side*6.0)-2.7));
    color=mix(color,vec3(.055,.17,.13),eyes);
   }
  }else if(id==snakeFoodCell()){
   color=mix(color,CORAL,fill(length(q-vec2(0,1))-11.5));
   color=mix(color,WHITE,fill(length(q-vec2(-3,-3))-2.2)*.65);
   color=mix(color,MINT,line(stroke(q,vec2(1,-10),vec2(6,-15)),1.9));
  }
 }
 color=mix(color,MUTED,text(p,vec2(1280,292),TEXT_SCORE));
 color=mix(color,WHITE,number(p,vec2(1276,342),snakeScore(),1.15));
 color=mix(color,MUTED,text(p,vec2(1280,473),TEXT_BEST));
 color=mix(color,MINT,number(p,vec2(1276,517),snakeBest(),.69));
 color=mix(color,MUTED,text(p,vec2(1570,473),TEXT_SPEED));
 color=mix(color,WHITE,number(p,vec2(1566,518),snakeSpeed(),.58));
 color=mix(color,MUTED,text(p,vec2(1650,538),TEXT_UNIT));
 color=mix(color,vec3(.22,.33,.35),fill(box(p,vec2(1530,636),vec2(250,1),0)));
 color=mix(color,WHITE,text(p,vec2(1280,683),TEXT_CONTROLS));
 color=mix(color,MUTED,text(p,vec2(1280,744),TEXT_MOVE));
 color=mix(color,MUTED,text(p,vec2(1280,801),TEXT_PAUSE_KEY));
 color=mix(color,MUTED,text(p,vec2(1280,858),TEXT_BACK_KEY));
 color=mix(color,MUTED,text(p,vec2(94,1008),TEXT_FOOTER));
 uint status=snakeStatus();
 if(status!=SNAKE_RUNNING){
  float shade=fill(box(p,BOARD+vec2(540,360),vec2(539,359),8));
  color=mix(color,vec3(.035,.06,.085),shade*.75);
  float panel=fill(box(p,vec2(630,605),vec2(400,155),22));
  color=mix(color,vec3(.11,.19,.21),panel);
  ivec4 heading=TEXT_READY,action=TEXT_START;
  if(status==SNAKE_PAUSED){heading=TEXT_PAUSED;action=TEXT_RESUME;}
  if(status==SNAKE_DEAD){heading=TEXT_DEAD;action=TEXT_RETRY;}
  if(status==SNAKE_WON){heading=TEXT_WON;action=TEXT_RETRY;}
  if(!snakeConnected()){heading=TEXT_DISCONNECTED;action=TEXT_RECONNECT;}
  color=mix(color,WHITE,centered(p,630,512,heading));
  color=mix(color,MINT,centered(p,630,603,action));
  if(status==SNAKE_READY&&snakeConnected())
   color=mix(color,MUTED,centered(p,630,675,TEXT_RULES));
 }
 outColor=vec4(color*(1.0-clamp(c.transition.x,0.0,1.0)),1);
}
