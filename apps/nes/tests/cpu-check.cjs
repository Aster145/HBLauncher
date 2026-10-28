// Runs the actual cpu.glsl as Vulkan 1.0 SPIR-V on the desktop GPU.
// Does not connect to a console and does not load any commercial ROM.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {tool}=require('../build.cjs');
const root=path.resolve(__dirname,'../../..'),out=path.join(__dirname,'generated-cpu');
fs.mkdirSync(out,{recursive:true});
const compiler=tool('GLSLANG','tools/glslang/mingw64/bin/glslangValidator.exe','glslangValidator');
const validator=tool('SPIRV_VAL','tools/spirv-tools/mingw64/bin/spirv-val.exe','spirv-val');
const runner=tool('HB_COMPUTE_CHECK','tools/glslang/desktop-tests/game-compute-check.exe','game-compute-check');
const spv=path.join(out,'cpu-test.spv');
execFileSync(compiler,['-V','--target-env','vulkan1.0','-S','comp','-o',spv,path.join(__dirname,'cpu-test.comp')],{stdio:'inherit'});
execFileSync(validator,['--target-env','vulkan1.0',spv],{stdio:'inherit'});
const R={A:1,X:2,Y:3,S:4,P:5,PC:6,DEBT:7,CYCLES:8,NMI:9,DMA:10,FAULT:11,BADPC:12,OAMADDR:19,JOY:26,JOYSHIFT:27,STROBE:28};
const fixtures=[];
function fixture(name,code,{regs={},patches=[],probes=[],expected={},cycles,pc,mode=0,steps=1,budget=0,secondBudget=0,prgSize=32768}={}){
 const initial={A:0x55,X:1,Y:2,S:0xfd,P:0x24,PC:0x8000,...regs};
 const codePatches=code.map((v,i)=>[initial.PC+i,v]);
 fixtures.push({name,regs:initial,patches:[...codePatches,...patches],probes,expected:{FAULT:0,...expected},cycles,pc,mode,amount:mode===0?steps:budget,secondBudget,prgSize});
}
// Fixed opcode matrix from the NMOS 6502 instruction set. These fixtures
// check each official opcode's acceptance, operand length and base timing.
const matrix=`
BRK:h:7 ORA:ix:6 . . . ORA:z:3 ASL:z:5 . PHP:h:3 ORA:n:2 ASL:a:2 . . ORA:b:4 ASL:b:6 .
BPL:r:2 ORA:iy:5 . . . ORA:xz:4 ASL:xz:6 . CLC:h:2 ORA:yb:4 . . . ORA:xb:4 ASL:xb:7 .
JSR:b:6 AND:ix:6 . . BIT:z:3 AND:z:3 ROL:z:5 . PLP:h:4 AND:n:2 ROL:a:2 . BIT:b:4 AND:b:4 ROL:b:6 .
BMI:r:2 AND:iy:5 . . . AND:xz:4 ROL:xz:6 . SEC:h:2 AND:yb:4 . . . AND:xb:4 ROL:xb:7 .
RTI:h:6 EOR:ix:6 . . . EOR:z:3 LSR:z:5 . PHA:h:3 EOR:n:2 LSR:a:2 . JMP:b:3 EOR:b:4 LSR:b:6 .
BVC:r:2 EOR:iy:5 . . . EOR:xz:4 LSR:xz:6 . CLI:h:2 EOR:yb:4 . . . EOR:xb:4 LSR:xb:7 .
RTS:h:6 ADC:ix:6 . . . ADC:z:3 ROR:z:5 . PLA:h:4 ADC:n:2 ROR:a:2 . JMP:ind:5 ADC:b:4 ROR:b:6 .
BVS:r:2 ADC:iy:5 . . . ADC:xz:4 ROR:xz:6 . SEI:h:2 ADC:yb:4 . . . ADC:xb:4 ROR:xb:7 .
. STA:ix:6 . . STY:z:3 STA:z:3 STX:z:3 . DEY:h:2 . TXA:h:2 . STY:b:4 STA:b:4 STX:b:4 .
BCC:r:2 STA:iy:6 . . STY:xz:4 STA:xz:4 STX:yz:4 . TYA:h:2 STA:yb:5 TXS:h:2 . . STA:xb:5 . .
LDY:n:2 LDA:ix:6 LDX:n:2 . LDY:z:3 LDA:z:3 LDX:z:3 . TAY:h:2 LDA:n:2 TAX:h:2 . LDY:b:4 LDA:b:4 LDX:b:4 .
BCS:r:2 LDA:iy:5 . . LDY:xz:4 LDA:xz:4 LDX:yz:4 . CLV:h:2 LDA:yb:4 TSX:h:2 . LDY:xb:4 LDA:xb:4 LDX:yb:4 .
CPY:n:2 CMP:ix:6 . . CPY:z:3 CMP:z:3 DEC:z:5 . INY:h:2 CMP:n:2 DEX:h:2 . CPY:b:4 CMP:b:4 DEC:b:6 .
BNE:r:2 CMP:iy:5 . . . CMP:xz:4 DEC:xz:6 . CLD:h:2 CMP:yb:4 . . . CMP:xb:4 DEC:xb:7 .
CPX:n:2 SBC:ix:6 . . CPX:z:3 SBC:z:3 INC:z:5 . INX:h:2 SBC:n:2 NOP:h:2 . CPX:b:4 SBC:b:4 INC:b:6 .
BEQ:r:2 SBC:iy:5 . . . SBC:xz:4 INC:xz:6 . SED:h:2 SBC:yb:4 . . . SBC:xb:4 INC:xb:7 .`.trim().split(/\s+/);
assert.equal(matrix.length,256);
let officialCount=0;
matrix.forEach((entry,opcode)=>{
 if(entry==='.')return;officialCount++;
 const [name,mode,baseCycles]=entry.split(':');
 const length=['h','a'].includes(mode)?1:['b','xb','yb','ind'].includes(mode)?3:2;
 let pc=0x8000+length,cycles=Number(baseCycles);
 if(['BPL','BVC','BCC','BNE'].includes(name)){pc=0x8012;cycles++;}
 if(['BRK','RTI'].includes(name)||mode==='ind')pc=0;
 if(name==='RTS')pc=1;
 if(name==='JSR'||(name==='JMP'&&mode==='b'))pc=0x210;
 fixture(`official ${opcode.toString(16).padStart(2,'0')} ${name} ${mode}`,[opcode,0x10,0x02],{cycles,pc});
});
assert.equal(officialCount,151);
fixture('ADC carry and zero',[0x69,1],{regs:{A:255},expected:{A:0,P:0x27},cycles:2});
fixture('ADC signed overflow',[0x69,1],{regs:{A:127},expected:{A:128,P:0xe4},cycles:2});
fixture('SBC borrow',[0xe9,1],{regs:{A:0,P:0x25},expected:{A:255,P:0xa4},cycles:2});
fixture('SBC signed overflow',[0xe9,1],{regs:{A:128,P:0x25},expected:{A:127,P:0x65},cycles:2});
fixture('2A03 ignores decimal arithmetic',[0x69,1],{regs:{A:9,P:0x2c},expected:{A:10,P:0x2c},cycles:2});
fixture('indexed indirect zero-page pointer wraps',[0xa1,255],{regs:{X:0},patches:[[255,0x34],[0,2],[0x234,0xab]],expected:{A:0xab,P:0xa4},cycles:6});
fixture('indirect indexed pointer wraps and crosses page',[0xb1,255],{regs:{Y:1},patches:[[255,255],[0,2],[0x300,0x67]],expected:{A:0x67},cycles:6});
fixture('absolute indexed read adds page cycle',[0xbd,255,2],{patches:[[0x300,0x7f]],expected:{A:0x7f},cycles:5});
fixture('absolute indexed store has fixed cycles',[0x9d,255,2],{probes:[[0x300,0x55]],cycles:5});
fixture('zero-page indexing wraps',[0xb5,255],{patches:[[0,0x72]],expected:{A:0x72},cycles:4});
fixture('indirect JMP reproduces page-wrap bug',[0x6c,255,2],{patches:[[0x2ff,0x34],[0x200,0x12],[0x300,0xab]],pc:0x1234,cycles:5});
fixture('branch backwards crosses page',[0xd0,0xfd],{regs:{PC:0x8100},pc:0x80ff,cycles:4});
fixture('branch forwards wraps address space',[0xd0,2],{regs:{PC:0xfffc},pc:0,cycles:4});
fixture('JSR pushes address of last operand',[0x20,0,0x90],{probes:[[0x1fd,0x80],[0x1fc,2]],expected:{S:0xfb},pc:0x9000,cycles:6});
fixture('RTS pulls and increments return address',[0x60],{regs:{S:0xfb},patches:[[0x1fc,0x34],[0x1fd,0x12]],expected:{S:0xfd},pc:0x1235,cycles:6});
fixture('BRK pushes PC plus two and B bit',[0,0xea],{patches:[[0xfffe,0x34],[0xffff,0x12]],probes:[[0x1fd,0x80],[0x1fc,2],[0x1fb,0x34]],expected:{S:0xfa,P:0x24},pc:0x1234,cycles:7});
fixture('RTI restores flags without physical B',[0x40],{regs:{S:0xfa},patches:[[0x1fb,0xff],[0x1fc,0x34],[0x1fd,0x12]],expected:{P:0xef,S:0xfd},pc:0x1234,cycles:6});
fixture('NMI consumed once and stack B clear',[0xea],{regs:{NMI:1},patches:[[0xfffa,0],[0xfffb,0x90],[0x9000,0xea]],probes:[[0x1fb,0x24],[0x1fc,0],[0x1fd,0x80]],expected:{NMI:0,S:0xfa},pc:0x9001,cycles:9,steps:2});
fixture('stack wraps at zero',[0x48],{regs:{S:0,A:0xab},probes:[[0x100,0xab]],expected:{S:255},cycles:3});
fixture('ASL sets zero carry',[0x0a],{regs:{A:128},expected:{A:0,P:0x27},cycles:2});
fixture('ROL consumes old carry',[0x2a],{regs:{A:128,P:0x25},expected:{A:1,P:0x25},cycles:2});
fixture('ROR consumes old carry',[0x6a],{regs:{A:1,P:0x25},expected:{A:128,P:0xa5},cycles:2});
fixture('BIT copies NV and computes Z',[0x24,0x10],{regs:{A:1},patches:[[0x10,0xc0]],expected:{P:0xe6},cycles:3});
fixture('INC wraps memory and sets zero',[0xe6,0x10],{patches:[[0x10,255]],probes:[[0x10,0]],expected:{P:0x26},cycles:5});
fixture('DEC wraps memory and sets negative',[0xc6,0x10],{probes:[[0x10,255]],expected:{P:0xa4},cycles:5});
fixture('CPX comparison does not change X',[0xe0,0x80],{regs:{X:0x80},expected:{X:0x80,P:0x27},cycles:2});
fixture('RAM mirror write',[0x8d,0x10,0x18],{probes:[[0x10,0x55]],cycles:4});
fixture('SRAM write',[0x8d,0x10,0x60],{probes:[[0x6010,0x55]],cycles:4});
fixture('PRG writes ignored',[0x8d,0,0x90],{patches:[[0x9000,0xab]],probes:[[0x9000,0xab]],cycles:4});
fixture('16 KiB NROM bank mirrors',[0xad,0,0xc0],{prgSize:16384,expected:{A:0xad},cycles:4});
fixture('unmapped APU status has no IRQ',[0xad,0x15,0x40],{expected:{A:0,P:0x26},cycles:4});
fixture('controller shifts A B select start up down left right',[0xea],{regs:{JOY:0xa5},mode:3,expected:{STROBE:0},probes:[]});
fixtures.at(-1).serial=[0x41,0x40,0x41,0x40,0x40,0x41,0x40,0x41,0x41,0x41];
fixture('controller high strobe reads current A',[0xad,0x16,0x40],{regs:{JOY:1,STROBE:1,JOYSHIFT:0},expected:{A:0x41,JOYSHIFT:0},cycles:4});
fixture('instruction debt survives short call',[0xa9,0x34,0xe8],{mode:1,budget:1,expected:{A:0x34,X:1,DEBT:1,CYCLES:1},pc:0x8002});
fixture('debt consumed before next instruction',[0xa9,0x34,0xe8],{mode:5,budget:1,secondBudget:1,expected:{A:0x34,X:1,DEBT:0,CYCLES:2},pc:0x8002});
fixture('next instruction starts only after debt',[0xa9,0x34,0xe8],{mode:5,budget:1,secondBudget:2,expected:{A:0x34,X:2,DEBT:1,CYCLES:3},pc:0x8003});
fixture('OAM DMA copies and wraps destination',[0x8d,0x14,0x40,0xe8],{regs:{A:2,OAMADDR:0xfe},mode:4,budget:4,expected:{DEBT:513,CYCLES:4,OAMADDR:0xfe,X:1},probes:[[0x100fe,0],[0x100ff,1],[0x10000,2],[0x100fd,255]],pc:0x8003});
fixture('odd-cycle DMA adds alignment cycle',[0x8d,0x14,0x40],{regs:{A:2,CYCLES:1},mode:4,budget:4,expected:{DEBT:514,CYCLES:5},pc:0x8003});
fixture('DMA stalls following instruction across calls',[0x8d,0x14,0x40,0xe8],{regs:{A:2},mode:5,budget:4,secondBudget:513,expected:{DEBT:0,CYCLES:517,X:1},pc:0x8003});
fixture('CPU reset reads mirrored reset vector',[0xea],{prgSize:16384,patches:[[0xbffc,0x34],[0xbffd,0x12]],mode:2,expected:{A:0,X:0,Y:0,S:0xfd,P:0x24,DEBT:0,NMI:0,DMA:0,CYCLES:0},pc:0x1234});
fixture('unsupported opcode latches explicit fault',[0x02],{expected:{FAULT:3,BADPC:0x8000},pc:0x8001,cycles:0});
fixture('stable unofficial immediate NOP',[0x89,0x7f],{expected:{A:0x55,P:0x24},pc:0x8002,cycles:2});
fixture('stable unofficial indexed NOP crossing',[0x1c,255,2],{expected:{A:0x55,P:0x24},pc:0x8003,cycles:5});

const atlasOffset=16,CASE=100000,STRIDE=192,RESULT=250000,RESULT_STRIDE=64;
const state=Buffer.alloc((RESULT+fixtures.length*RESULT_STRIDE+atlasOffset)*4);
function put(word,value){state.writeUInt32LE(value>>>0,(word+atlasOffset)*4);}
put(90000,fixtures.length);
fixtures.forEach((f,index)=>{
 assert.ok(f.patches.length<=64,`${f.name}: patch capacity`);assert.ok(f.probes.length<=24);
 const b=CASE+index*STRIDE;
 put(b,f.mode);put(b+1,f.amount);put(b+2,f.secondBudget);put(b+4,f.prgSize);put(b+5,f.patches.length);put(b+6,f.probes.length);
 for(const [reg,value] of Object.entries(f.regs))put(b+8+R[reg],value);
 f.patches.forEach(([address,value],i)=>{put(b+40+i*2,address);put(b+41+i*2,value);});
 f.probes.forEach(([address],i)=>put(b+168+i,address));
});
const initial=path.join(out,'initial.bin'),result=path.join(out,'result.bin'),inputs=path.join(out,'input.bin');
fs.writeFileSync(initial,state);fs.writeFileSync(inputs,Buffer.alloc(64));
execFileSync(runner,[initial,result,spv,inputs,'1'],{stdio:'inherit',env:{...process.env,HB_FULL_OUTPUT:'1'}});
const actual=fs.readFileSync(result);let assertions=0;
fixtures.forEach((f,index)=>{
 const b=atlasOffset+RESULT+index*RESULT_STRIDE;
 function check(word,value,label){assert.equal(actual.readUInt32LE((b+word)*4),value,`${f.name}: ${label}`);assertions++;}
 for(const [reg,value] of Object.entries(f.expected))check(R[reg],value,reg);
 if(f.pc!==undefined)check(R.PC,f.pc,'PC');if(f.cycles!==undefined)check(32,f.cycles,'cycles');
 f.probes.forEach(([,value],i)=>check(40+i,value,`probe ${i}`));
 if(f.serial)f.serial.forEach((value,i)=>check(40+i,value,`controller bit ${i}`));
});
console.log(JSON.stringify({fixtures:fixtures.length,officialOpcodes:officialCount,assertions,desktopVulkan:true,consoleExecuted:false},null,2));
