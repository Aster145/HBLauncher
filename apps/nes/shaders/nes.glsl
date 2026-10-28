#ifndef NES_COMMON_GLSL
#define NES_COMMON_GLSL
// App-private words inside binding-zero atlas. No writes to SDK ABI/extension.
const uint N_PRG=0u, N_CHR=32768u, N_RAM=65536u, N_SRAM=67584u;
const uint N_NT=75776u, N_PAL=79872u, N_OAM=80128u, N_REG=80384u;
const uint N_LINE=81920u, N_LINE_STRIDE=128u;
// CPU state, all stored as uint, with eight-bit values masked by the core.
const uint R_MAGIC=0u,R_A=1u,R_X=2u,R_Y=3u,R_S=4u,R_P=5u,R_PC=6u;
const uint R_DEBT=7u,R_CYCLES=8u,R_NMI=9u,R_DMA=10u,R_FAULT=11u,R_BADPC=12u;
// PPU registers; R_V and R_T follow the NES loopy-scroll encoding.
const uint R_CTRL=16u,R_MASK=17u,R_STATUS=18u,R_OAMADDR=19u,R_V=20u,R_T=21u;
const uint R_FINE_X=22u,R_W=23u,R_READBUF=24u,R_OPENBUS=25u;
const uint R_JOY=26u,R_JOYSHIFT=27u,R_STROBE=28u;
const uint R_FRAME=32u,R_PAUSED=33u,R_LASTBUTTONS=34u,R_RESET=35u;
const uint R_PRGSIZE=40u,R_MIRROR=41u,R_CHRRAM=42u,R_TEST=43u;
#define NR(i) c.atlas[N_REG+(i)]
uint nesChr(uint a){return c.atlas[N_CHR+(a&8191u)]&255u;}
#endif
