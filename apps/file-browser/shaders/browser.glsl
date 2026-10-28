#ifndef FILE_BROWSER_GLSL
#define FILE_BROWSER_GLSL
// Offsets are absolute bytes in the shared buffer. atlas starts at byte 1024.
const uint FB_META=(0x280000u-1024u)/4u;
const uint FB_CTRL=(0x284000u-1024u)/4u;
const uint FB_MAGIC=0x46424331u,FB_METADATA_MAGIC=1178751537u;
const uint FC_MAGIC=0u,FC_SELECTION=1u,FC_PENDING=2u,FC_STARTED=3u;
const uint FC_NAV=4u,FC_REPEAT=5u,FC_MODE=6u,FC_RETURN_PAGE=7u;
const uint FC_RETURN_SELECTION=8u,FC_PAGE=9u,FC_HAVE_META=10u;
const uint FC_WAITING=11u,FC_ERROR=12u,FC_ACK=13u,FC_WAIT_FRAMES=14u,FC_CONNECTED=15u;
uint fbWord(uint index){return c.atlas[FB_CTRL+index];}
uint fbMeta(uint offset){return c.atlas[FB_META+offset/4u];}
uint fbMetaByte(uint offset){return (fbMeta(offset)>>((offset%4u)*8u))&255u;}
bool fbBusy(){return fbWord(FC_PENDING)!=0u;}
// 0 normal, 1 no compatible SDK yet, 2 request has waited over five seconds.
uint fbWaiting(){return fbWord(FC_WAITING);}
uint fbSelection(){return fbWord(FC_SELECTION);}
uint fbMode(){return fbWord(FC_MODE);}
uint fbError(){return fbWord(FC_ERROR)!=0u?fbWord(FC_ERROR):(fbWord(FC_HAVE_META)!=0u?fbMeta(12u):0u);}
uint fbStatus(){return fbError();}
uint fbRowCount(){return fbWord(FC_HAVE_META)!=0u&&fbError()==0u?min(fbMeta(28u),12u):0u;}
uint fbPage(){return fbWord(FC_HAVE_META)!=0u?fbMeta(16u):fbWord(FC_PAGE);}
uint fbTotalPages(){return fbWord(FC_HAVE_META)!=0u?max(fbMeta(20u),1u):1u;}
bool fbConnected(){return fbWord(FC_CONNECTED)!=0u;}
bool fbReady(){return fbWord(FC_HAVE_META)!=0u&&!fbBusy()&&fbError()==0u;}
#endif
