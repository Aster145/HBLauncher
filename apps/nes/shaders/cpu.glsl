#ifndef NES_CPU_GLSL
#define NES_CPU_GLSL
// Ricoh 2A03: all 151 official NMOS 6502 opcodes; decimal flag is stored,
// but ADC/SBC always use binary arithmetic. One invocation owns CPU state.
const uint CPU_C=1u,CPU_Z=2u,CPU_I=4u,CPU_D=8u;
const uint CPU_B=16u,CPU_U=32u,CPU_V=64u,CPU_N=128u;
// Offset of a write from the start of the current instruction, for DMA parity.
uint cpuWriteCycle=0u;
// CPU scalars stay private across an execution budget. PPU/controller state
// and the NMI latch stay in the atlas so PPU writes remain visible immediately.
bool cpuCached=false;
uint cpuA,cpuX,cpuY,cpuS,cpuP,cpuPC,cpuDebt,cpuCycles,cpuDma,cpuFault,cpuBadPC,cpuPrgSize;
void cpuLoad(){
 cpuA=NR(R_A);cpuX=NR(R_X);cpuY=NR(R_Y);cpuS=NR(R_S);cpuP=NR(R_P);cpuPC=NR(R_PC);
 cpuDebt=NR(R_DEBT);cpuCycles=NR(R_CYCLES);cpuDma=NR(R_DMA);
 cpuFault=NR(R_FAULT);cpuBadPC=NR(R_BADPC);cpuPrgSize=NR(R_PRGSIZE);cpuCached=true;
}
void cpuSave(){
 NR(R_A)=cpuA;NR(R_X)=cpuX;NR(R_Y)=cpuY;NR(R_S)=cpuS;NR(R_P)=cpuP;NR(R_PC)=cpuPC;
 NR(R_DEBT)=cpuDebt;NR(R_CYCLES)=cpuCycles;NR(R_DMA)=cpuDma;
 NR(R_FAULT)=cpuFault;NR(R_BADPC)=cpuBadPC;cpuCached=false;
}
uint ppuReadReg(uint reg);
void ppuWriteReg(uint reg,uint value);

uint cpuRead(uint address){
 uint a=address&65535u;
 if(a<8192u)return c.atlas[N_RAM+(a&2047u)]&255u;
 if(a<16384u)return ppuReadReg(a&7u)&255u;
 if(a==16406u){
  if(NR(R_STROBE)!=0u)return 64u|(NR(R_JOY)&1u);
  uint value=64u|(NR(R_JOYSHIFT)&1u);
  NR(R_JOYSHIFT)=(NR(R_JOYSHIFT)>>1u)|128u;
  return value;
 }
 if(a==16407u)return 64u;
 if(a<24576u)return 0u; // APU status, disabled expansion and unmapped bus.
 if(a<32768u)return c.atlas[N_SRAM+a-24576u]&255u;
 uint size=cpuCached?cpuPrgSize:NR(R_PRGSIZE);
 if(size!=16384u&&size!=32768u)return 0u;
 return c.atlas[N_PRG+((a-32768u)&(size-1u))]&255u;
}
void cpuWrite(uint address,uint value){
 uint a=address&65535u,v=value&255u;
 if(a<8192u){c.atlas[N_RAM+(a&2047u)]=v;return;}
 if(a<16384u){ppuWriteReg(a&7u,v);return;}
 if(a==16404u){
  uint base=v<<8u,first=NR(R_OAMADDR)&255u;
  for(uint i=0u;i<256u;i++)c.atlas[N_OAM+((first+i)&255u)]=cpuRead(base+i);
  // DMA starts after the writing instruction. No CPU instructions execute
  // during this stall, including when it straddles several scanline calls.
  uint stall=513u+(((cpuCached?cpuCycles:NR(R_CYCLES))+cpuWriteCycle)&1u);
  if(cpuCached)cpuDma=stall;else NR(R_DMA)=stall;
  return;
 }
 if(a==16406u){
  if((v&1u)!=0u||NR(R_STROBE)!=0u)NR(R_JOYSHIFT)=NR(R_JOY)&255u;
  NR(R_STROBE)=v&1u;return;
 }
 if(a>=24576u&&a<32768u)c.atlas[N_SRAM+a-24576u]=v;
 // Mapper 0 has no PRG writes. APU is intentionally silent.
}
uint cpuFetch(){uint v=cpuRead(cpuPC);cpuPC=(cpuPC+1u)&65535u;return v;}
uint cpuWord(){uint lo=cpuFetch();return lo|(cpuFetch()<<8u);}
uint cpuReadWord(uint a){uint lo=cpuRead(a);return lo|(cpuRead((a+1u)&65535u)<<8u);}
// Zero-page pointers and stack accesses always address internal RAM. Keeping
// them off the general bus avoids duplicating PPU and DMA code when inlined.
uint cpuZpWord(uint a){uint lo=c.atlas[N_RAM+(a&255u)]&255u;return lo|((c.atlas[N_RAM+((a+1u)&255u)]&255u)<<8u);}
void cpuPush(uint v){c.atlas[N_RAM+256u+(cpuS&255u)]=v&255u;cpuS=(cpuS-1u)&255u;}
uint cpuPull(){cpuS=(cpuS+1u)&255u;return c.atlas[N_RAM+256u+cpuS]&255u;}
void cpuNZ(uint v){cpuP=(cpuP&~(CPU_N|CPU_Z))|(v&CPU_N)|((v&255u)==0u?CPU_Z:0u);}
void cpuFlag(uint flag,bool set){cpuP=set?(cpuP|flag):(cpuP&~flag);}
void cpuADC(uint v){
 uint a=cpuA,sum=a+v+(cpuP&CPU_C),result=sum&255u;
 cpuFlag(CPU_C,sum>255u);cpuFlag(CPU_V,((~(a^v)&(a^result))&128u)!=0u);
 cpuA=result;cpuNZ(result);
}
void cpuCompare(uint r,uint v){cpuFlag(CPU_C,r>=v);cpuNZ((r-v)&255u);}
uint cpuShift(uint kind,uint v){
 uint carry=cpuP&CPU_C,result;
 if(kind==0u){cpuFlag(CPU_C,(v&128u)!=0u);result=(v<<1u)&255u;}
 else if(kind==1u){cpuFlag(CPU_C,(v&128u)!=0u);result=((v<<1u)|carry)&255u;}
 else if(kind==2u){cpuFlag(CPU_C,(v&1u)!=0u);result=v>>1u;}
 else {cpuFlag(CPU_C,(v&1u)!=0u);result=(v>>1u)|(carry<<7u);}
 cpuNZ(result);return result;
}
uint cpuBranch(bool take){
 uint offset=cpuFetch(),old=cpuPC;
 if(!take)return 2u;
 int displacement=int(offset);if(offset>=128u)displacement-=256;
 uint dest=uint(int(old)+displacement)&65535u;cpuPC=dest;
 return 3u+((old&65280u)!=(dest&65280u)?1u:0u);
}
uint cpuInterrupt(uint vector){
 cpuPush(cpuPC>>8u);cpuPush(cpuPC);cpuPush((cpuP&~CPU_B)|CPU_U);
 cpuP|=CPU_I;cpuPC=cpuReadWord(vector);return 7u;
}
uint cpuStepCore(){
 if(cpuFault!=0u)return 0u;
 cpuWriteCycle=0u;
 if(NR(R_NMI)!=0u){NR(R_NMI)=0u;return cpuInterrupt(65530u);}
 uint pc=cpuPC,op=cpuFetch(),a=0u,v=0u,base=0u,cycles=0u;
 // Control, stack, branches, flags and irregular instructions.
 switch(op){
 case 0x00u: // BRK consumes its padding byte and pushes PC+2, with B set.
  cpuFetch();cpuPush(cpuPC>>8u);cpuPush(cpuPC);cpuPush(cpuP|CPU_B|CPU_U);
  cpuP|=CPU_I;cpuPC=cpuReadWord(65534u);return 7u;
 case 0x08u:cpuPush(cpuP|CPU_B|CPU_U);return 3u;
 case 0x10u:return cpuBranch((cpuP&CPU_N)==0u);
 case 0x18u:cpuFlag(CPU_C,false);return 2u;
 case 0x20u:a=cpuWord();base=(cpuPC-1u)&65535u;cpuPush(base>>8u);cpuPush(base);cpuPC=a;return 6u;
 case 0x24u:case 0x2cu:
  a=op==0x24u?cpuFetch():cpuWord();v=cpuRead(a);
  cpuP=(cpuP&~(CPU_N|CPU_V|CPU_Z))|(v&(CPU_N|CPU_V))|((cpuA&v)==0u?CPU_Z:0u);
  return op==0x24u?3u:4u;
 case 0x28u:cpuP=(cpuPull()&~CPU_B)|CPU_U;return 4u;
 case 0x30u:return cpuBranch((cpuP&CPU_N)!=0u);
 case 0x38u:cpuFlag(CPU_C,true);return 2u;
 case 0x40u:cpuP=(cpuPull()&~CPU_B)|CPU_U;a=cpuPull();cpuPC=a|(cpuPull()<<8u);return 6u;
 case 0x48u:cpuPush(cpuA);return 3u;
 case 0x4cu:cpuPC=cpuWord();return 3u;
 case 0x50u:return cpuBranch((cpuP&CPU_V)==0u);
 case 0x58u:cpuFlag(CPU_I,false);return 2u;
 case 0x60u:a=cpuPull();base=a|(cpuPull()<<8u);cpuPC=(base+1u)&65535u;return 6u;
 case 0x68u:cpuA=cpuPull();cpuNZ(cpuA);return 4u;
 case 0x6cu: // Original 6502 indirect JMP wraps the high-byte read in-page.
  a=cpuWord();v=cpuRead(a);cpuPC=v|(cpuRead((a&65280u)|((a+1u)&255u))<<8u);return 5u;
 case 0x70u:return cpuBranch((cpuP&CPU_V)!=0u);
 case 0x78u:cpuFlag(CPU_I,true);return 2u;
 case 0x84u:case 0x8cu:case 0x94u:
  if(op==0x8cu){a=cpuWord();cycles=4u;}
  else {a=cpuFetch();cycles=3u;if(op==0x94u){a=(a+cpuX)&255u;cycles=4u;}}
  cpuWriteCycle=cycles;cpuWrite(a,cpuY);return cycles;
 case 0x88u:cpuY=(cpuY-1u)&255u;cpuNZ(cpuY);return 2u;
 case 0x8au:cpuA=cpuX;cpuNZ(cpuA);return 2u;
 case 0x90u:return cpuBranch((cpuP&CPU_C)==0u);
 case 0x98u:cpuA=cpuY;cpuNZ(cpuA);return 2u;
 case 0x9au:cpuS=cpuX;return 2u;
 case 0xa0u:cpuY=cpuFetch();cpuNZ(cpuY);return 2u;
 case 0xa4u:case 0xacu:case 0xb4u:case 0xbcu:
  if(op==0xacu||op==0xbcu){base=cpuWord();a=(base+(op==0xbcu?cpuX:0u))&65535u;cycles=4u+((a&65280u)!=(base&65280u)?1u:0u);}
  else {a=(cpuFetch()+(op==0xb4u?cpuX:0u))&255u;cycles=op==0xb4u?4u:3u;}
  cpuY=cpuRead(a);cpuNZ(cpuY);return cycles;
 case 0xa8u:cpuY=cpuA;cpuNZ(cpuY);return 2u;
 case 0xaau:cpuX=cpuA;cpuNZ(cpuX);return 2u;
 case 0xb0u:return cpuBranch((cpuP&CPU_C)!=0u);
 case 0xb8u:cpuFlag(CPU_V,false);return 2u;
 case 0xbau:cpuX=cpuS;cpuNZ(cpuX);return 2u;
 case 0xc0u:case 0xe0u:cpuCompare(op==0xc0u?cpuY:cpuX,cpuFetch());return 2u;
 case 0xc4u:case 0xccu:case 0xe4u:case 0xecu:
  a=(op&8u)!=0u?cpuWord():cpuFetch();cpuCompare(op<0xe0u?cpuY:cpuX,cpuRead(a));return (op&8u)!=0u?4u:3u;
 case 0xc8u:cpuY=(cpuY+1u)&255u;cpuNZ(cpuY);return 2u;
 case 0xcau:cpuX=(cpuX-1u)&255u;cpuNZ(cpuX);return 2u;
 case 0xd0u:return cpuBranch((cpuP&CPU_Z)==0u);
 case 0xd8u:cpuFlag(CPU_D,false);return 2u;
 case 0xe8u:cpuX=(cpuX+1u)&255u;cpuNZ(cpuX);return 2u;
 case 0xf0u:return cpuBranch((cpuP&CPU_Z)!=0u);
 case 0xf8u:cpuFlag(CPU_D,true);return 2u;
 case 0xeau: // Official NOP, plus stable unofficial NOP encodings.
 case 0x1au:case 0x3au:case 0x5au:case 0x7au:case 0xdau:case 0xfau:return 2u;
 case 0x80u:case 0x82u:case 0x89u:case 0xc2u:case 0xe2u:cpuFetch();return 2u;
 case 0x04u:case 0x44u:case 0x64u:cpuRead(cpuFetch());return 3u;
 case 0x14u:case 0x34u:case 0x54u:case 0x74u:case 0xd4u:case 0xf4u:cpuRead((cpuFetch()+cpuX)&255u);return 4u;
 case 0x0cu:cpuRead(cpuWord());return 4u;
 case 0x1cu:case 0x3cu:case 0x5cu:case 0x7cu:case 0xdcu:case 0xfcu:
  base=cpuWord();a=(base+cpuX)&65535u;cpuRead(a);return 4u+((base&65280u)!=(a&65280u)?1u:0u);
 default:break;
 }
 // xx...01 group: ORA AND EOR ADC STA LDA CMP SBC.
 if((op&3u)==1u){
  uint operation=op>>5u,mode=(op>>2u)&7u;bool store=operation==4u;
  switch(mode){
  case 0u:a=cpuZpWord((cpuFetch()+cpuX)&255u);cycles=6u;break;
  case 1u:a=cpuFetch();cycles=3u;break;
  case 2u:v=cpuFetch();cycles=2u;break;
  case 3u:a=cpuWord();cycles=4u;break;
  case 4u:base=cpuZpWord(cpuFetch());a=(base+cpuY)&65535u;cycles=store?6u:5u+((base&65280u)!=(a&65280u)?1u:0u);break;
  case 5u:a=(cpuFetch()+cpuX)&255u;cycles=4u;break;
  default:base=cpuWord();a=(base+(mode==6u?cpuY:cpuX))&65535u;cycles=store?5u:4u+((base&65280u)!=(a&65280u)?1u:0u);break;
  }
  if(store){cpuWriteCycle=cycles;cpuWrite(a,cpuA);return cycles;}
  if(mode!=2u)v=cpuRead(a);
  switch(operation){
  case 0u:cpuA|=v;cpuNZ(cpuA);break;
  case 1u:cpuA&=v;cpuNZ(cpuA);break;
  case 2u:cpuA^=v;cpuNZ(cpuA);break;
  case 3u:cpuADC(v);break;
  case 5u:cpuA=v;cpuNZ(v);break;
  case 6u:cpuCompare(cpuA,v);break;
  case 7u:cpuADC(v^255u);break;
  default:break;
  }
  return cycles;
 }
 // xx...10 group, with explicit validity checks before fetching operands.
 if((op&3u)==2u){
  uint operation=op>>5u,mode=(op>>2u)&7u;
  bool shift=operation<4u,store=operation==4u,load=operation==5u;
  bool valid=(mode==1u||mode==3u||mode==5u)||(mode==7u&&!store)||(mode==2u&&shift)||(mode==0u&&load);
  if(valid){
   if(mode==2u){cpuA=cpuShift(operation,cpuA);return 2u;}
   if(mode==0u){cpuX=cpuFetch();cpuNZ(cpuX);return 2u;}
   bool indexed=mode==5u||mode==7u;uint index=(store||load)?cpuY:cpuX;
   if(mode==1u||mode==5u){a=(cpuFetch()+(indexed?index:0u))&255u;cycles=indexed?4u:3u;}
   else {base=cpuWord();a=(base+(indexed?index:0u))&65535u;cycles=4u+(indexed&&load&&(base&65280u)!=(a&65280u)?1u:0u);}
   if(store){cpuWriteCycle=cycles;cpuWrite(a,cpuX);return cycles;}
   v=cpuRead(a);
   if(load){cpuX=v;cpuNZ(v);return cycles;}
   cycles=mode==7u?7u:cycles+2u;
   // NMOS read/modify/write exposes the original value on its penultimate
   // write cycle, then the new value. This also preserves PPU side effects.
   cpuWriteCycle=cycles-1u;cpuWrite(a,v);
   if(shift)v=cpuShift(operation,v);
   else {v=(v+(operation==6u?255u:1u))&255u;cpuNZ(v);}
   cpuWriteCycle=cycles;cpuWrite(a,v);return cycles;
  }
 }
 cpuFault=op+1u;cpuBadPC=pc;return 0u;
}
uint cpuStep(){cpuLoad();uint cycles=cpuStepCore();cpuSave();return cycles;}
void cpuRun(uint requestedCycles){
 if(requestedCycles==0u)return;
 cpuLoad();uint remaining=requestedCycles;
 // Even a 1-cycle call is bounded; all implemented instructions take >=2.
 for(uint guard=0u;guard<requestedCycles+8u&&remaining!=0u;guard++){
  if(cpuFault!=0u)break;
  if(cpuDebt==0u){
   uint cycles=cpuStepCore();if(cycles==0u)break;
   cpuDebt=cycles+cpuDma;cpuDma=0u;
  }
  uint consume=min(remaining,cpuDebt);
  remaining-=consume;cpuDebt-=consume;cpuCycles+=consume;
 }
 cpuSave();
}
void cpuReset(){
 cpuLoad();
 cpuA=0u;cpuX=0u;cpuY=0u;cpuS=253u;cpuP=CPU_I|CPU_U;
 cpuPC=cpuReadWord(65532u);cpuDebt=0u;cpuCycles=0u;
 NR(R_NMI)=0u;cpuDma=0u;cpuFault=0u;cpuBadPC=0u;
 NR(R_JOYSHIFT)=0u;NR(R_STROBE)=0u;cpuWriteCycle=0u;cpuSave();
}
#endif
