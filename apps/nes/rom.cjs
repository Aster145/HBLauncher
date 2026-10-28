'use strict';
const crypto=require('node:crypto');
const C={PRG:0,CHR:32768,RAM:65536,SRAM:67584,NT:75776,PAL:79872,OAM:80128,REG:80384,LINE:81920,LINE_STRIDE:128,UI:131072};
function parseRom(b){
 if(b.length<16||b.subarray(0,4).toString('hex')!=='4e45531a')throw Error('Not an iNES ROM');
 if((b[7]&12)===8)throw Error('NES 2.0 is not supported by this first version');
 const mapper=(b[6]>>4)|(b[7]&240),prg=b[4]*16384,chr=b[5]*8192;
 if(mapper!==0)throw Error(`Mapper ${mapper} unsupported; this version accepts NROM (mapper 0) only`);
 if(![16384,32768].includes(prg)||![0,8192].includes(chr))throw Error('Unsupported NROM PRG/CHR size');
 if(b[6]&12)throw Error('Trainer/four-screen ROMs are not supported');
 if(b[7]&3)throw Error('VS System / PlayChoice ROMs are not supported');
 if(b[9]&1)throw Error('PAL timing is not supported by this NTSC prototype');
 if(b.length!==16+prg+chr)throw Error('ROM length does not match its header');
 return {mapper,prgBytes:prg,chrBytes:chr,mirror:b[6]&1,sha256:crypto.createHash('sha256').update(b).digest('hex'),prg:b.subarray(16,16+prg),chr:b.subarray(16+prg)};
}
function dataImage(rom,ui=Buffer.alloc(1024*512)){
 const data=Buffer.alloc(C.UI*4+ui.length);
 for(let i=0;i<rom.prg.length;i++)data.writeUInt32LE(rom.prg[i],(C.PRG+i)*4);
 for(let i=0;i<rom.chr.length;i++)data.writeUInt32LE(rom.chr[i],(C.CHR+i)*4);
 data.writeUInt32LE(rom.prgBytes,(C.REG+40)*4);data.writeUInt32LE(rom.mirror,(C.REG+41)*4);data.writeUInt32LE(rom.chrBytes===0?1:0,(C.REG+42)*4);
 ui.copy(data,C.UI*4);return data;
}
module.exports={C,parseRom,dataImage};
