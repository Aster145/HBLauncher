#ifndef NES_PPU_GLSL
#define NES_PPU_GLSL
// Include nes.glsl first. Addresses and palette/OAM/CHR values are bytes held
// in uint atlas words. R_MIRROR: 0 = horizontal, 1 = vertical, 2 = four-screen.
// Only CHR RAM is writable. No function accesses CPU state except the pending
// NMI latch: enabling PPUCTRL.NMI during vblank sets R_NMI to one.
//
// The frame driver owns vblank/NMI timing and sprite-zero status timing. Call
// ppuBeginFrame at pre-render, then ppuSnapshot(y) before executing visible
// scanline y, and ppuEndLine after that line. ppuSpriteZeroX(y) returns the first
// collision pixel, or -1; the driver sets STATUS.6 when CPU timing reaches it.
// It does not set STATUS.6 early. This is a scanline renderer: register writes
// during a line affect later snapshots, not already captured pixels. PPUDATA
// uses the configured 1/32 increment; rendering-time bus races, dot-exact
// sprite evaluation, open-bus decay and the hardware overflow bug are omitted.
//
// Snapshot contract, N_LINE + y * N_LINE_STRIDE (128 words, y in 0..239):
//   0: PPUMASK, 1: fine X (0..7), 2: PPUCTRL, 3: sprite count (0..8)
//   4..7: reserved, zero
//   8..39: 32 resolved palette entries, including $3F10 mirroring
//   40..72: 33 background tiles for this row, low plane bits 0..7,
//           high plane bits 8..15, attribute palette bits 16..17
//   80..111: eight OAM-order sprites, four words each: X, low plane, high
//            plane, attributes (OAM attribute byte, bit 8 marks sprite zero)
//   73..79 and 112..127: reserved, never read. Unused sprite entries are zero.
// Pattern bytes already account for fine Y and vertical flip; pixel.glsl
// applies fine X, horizontal flip, clipping, transparency and priority.

uint ppuNtIndex(uint a) {
    uint n = (a - 0x2000u) & 0x0fffu;
    uint table = n >> 10u;
    uint mode = NR(R_MIRROR);
    if (mode == 0u) table >>= 1u;
    else if (mode == 1u) table &= 1u;
    return (table << 10u) | (n & 0x03ffu);
}

uint ppuPalIndex(uint a) {
    uint p = a & 0x1fu;
    if ((p & 0x13u) == 0x10u) p &= 0x0fu;
    return p;
}

uint ppuRead(uint a) {
    a &= 0x3fffu;
    if (a < 0x2000u) return nesChr(a);
    if (a < 0x3f00u) return c.atlas[N_NT + ppuNtIndex(a)] & 255u;
    return c.atlas[N_PAL + ppuPalIndex(a)] & 63u;
}

void ppuWrite(uint a, uint value) {
    a &= 0x3fffu;
    value &= 255u;
    if (a < 0x2000u) {
        if (NR(R_CHRRAM) != 0u) c.atlas[N_CHR + a] = value;
    } else if (a < 0x3f00u) {
        c.atlas[N_NT + ppuNtIndex(a)] = value;
    } else {
        c.atlas[N_PAL + ppuPalIndex(a)] = value & 63u;
    }
}

void ppuDataIncrement() {
    NR(R_V) = (NR(R_V) + (((NR(R_CTRL) & 4u) != 0u) ? 32u : 1u)) & 0x7fffu;
}

uint ppuReadReg(uint reg) {
    reg &= 7u;
    uint result = NR(R_OPENBUS) & 255u;
    if (reg == 2u) {
        result = (NR(R_STATUS) & 0xe0u) | (result & 0x1fu);
        NR(R_STATUS) &= 0x7fu;
        NR(R_W) = 0u;
    } else if (reg == 4u) {
        uint a = NR(R_OAMADDR) & 255u;
        result = c.atlas[N_OAM + a] & 255u;
        if ((a & 3u) == 2u) result &= 0xe3u;
    } else if (reg == 7u) {
        uint a = NR(R_V) & 0x3fffu;
        if (a >= 0x3f00u) {
            result = ppuRead(a);
            if ((NR(R_MASK) & 1u) != 0u) result &= 0x30u;
            result |= NR(R_OPENBUS) & 0xc0u;
            NR(R_READBUF) = ppuRead(a - 0x1000u);
        } else {
            result = NR(R_READBUF);
            NR(R_READBUF) = ppuRead(a);
        }
        ppuDataIncrement();
    }
    NR(R_OPENBUS) = result & 255u;
    return result & 255u;
}

void ppuWriteReg(uint reg, uint value) {
    reg &= 7u;
    value &= 255u;
    NR(R_OPENBUS) = value;
    if (reg == 0u) {
        uint old = NR(R_CTRL);
        NR(R_CTRL) = value;
        NR(R_T) = (NR(R_T) & 0x73ffu) | ((value & 3u) << 10u);
        if ((old & 0x80u) == 0u && (value & NR(R_STATUS) & 0x80u) != 0u)
            NR(R_NMI) = 1u;
    } else if (reg == 1u) {
        NR(R_MASK) = value;
    } else if (reg == 3u) {
        NR(R_OAMADDR) = value;
    } else if (reg == 4u) {
        c.atlas[N_OAM + (NR(R_OAMADDR) & 255u)] = value;
        NR(R_OAMADDR) = (NR(R_OAMADDR) + 1u) & 255u;
    } else if (reg == 5u) {
        if (NR(R_W) == 0u) {
            NR(R_T) = (NR(R_T) & 0x7fe0u) | (value >> 3u);
            NR(R_FINE_X) = value & 7u;
        } else {
            NR(R_T) = (NR(R_T) & 0x0c1fu) | ((value & 7u) << 12u) | ((value & 0xf8u) << 2u);
        }
        NR(R_W) ^= 1u;
    } else if (reg == 6u) {
        if (NR(R_W) == 0u) {
            NR(R_T) = (NR(R_T) & 0x00ffu) | ((value & 0x3fu) << 8u);
        } else {
            NR(R_T) = (NR(R_T) & 0x7f00u) | value;
            NR(R_V) = NR(R_T);
        }
        NR(R_W) ^= 1u;
    } else if (reg == 7u) {
        ppuWrite(NR(R_V), value);
        ppuDataIncrement();
    }
}

void ppuReset() {
    NR(R_CTRL) = 0u; NR(R_MASK) = 0u; NR(R_STATUS) = 0u;
    NR(R_OAMADDR) = 0u; NR(R_V) = 0u; NR(R_T) = 0u;
    NR(R_FINE_X) = 0u; NR(R_W) = 0u;
    NR(R_READBUF) = 0u; NR(R_OPENBUS) = 0u; NR(R_NMI) = 0u;
    for (uint i = 0u; i < 4096u; ++i) c.atlas[N_NT + i] = 0u;
    for (uint i = 0u; i < 32u; ++i) c.atlas[N_PAL + i] = 0x0fu;
    for (uint i = 0u; i < 256u; ++i) c.atlas[N_OAM + i] = 255u;
}

void ppuBeginFrame() {
    NR(R_STATUS) &= 0x1fu;
    if ((NR(R_MASK) & 0x18u) != 0u) NR(R_V) = NR(R_T);
}

void ppuEndLine() {
    if ((NR(R_MASK) & 0x18u) == 0u) return;
    uint v = NR(R_V);
    if ((v & 0x7000u) != 0x7000u) {
        v += 0x1000u;
    } else {
        v &= 0x0fffu;
        uint cy = (v >> 5u) & 31u;
        if (cy == 29u) { cy = 0u; v ^= 0x0800u; }
        else if (cy == 31u) cy = 0u;
        else ++cy;
        v = (v & 0x7c1fu) | (cy << 5u);
    }
    NR(R_V) = (v & 0x7be0u) | (NR(R_T) & 0x041fu);
}

uint ppuHorizontalOffset(uint v, uint tiles) {
    uint cx = (v & 31u) + tiles;
    if (cx >= 32u) v ^= 0x0400u;
    return (v & 0x7fe0u) | (cx & 31u);
}

uint ppuBackgroundTile(uint v) {
    uint tile = ppuRead(0x2000u | (v & 0x0fffu));
    uint attr = ppuRead(0x23c0u | (v & 0x0c00u) | ((v >> 4u) & 0x38u) | ((v >> 2u) & 7u));
    uint shift = ((v >> 4u) & 4u) | (v & 2u);
    uint palette = (attr >> shift) & 3u;
    uint a = (((NR(R_CTRL) & 0x10u) != 0u) ? 0x1000u : 0u) + tile * 16u + ((v >> 12u) & 7u);
    return nesChr(a) | (nesChr(a + 8u) << 8u) | (palette << 16u);
}

uint ppuSpritePattern(uint tile, uint attr, uint row) {
    bool tall = (NR(R_CTRL) & 0x20u) != 0u;
    if ((attr & 0x80u) != 0u) row ^= tall ? 15u : 7u;
    uint a;
    if (tall) a = ((tile & 1u) << 12u) + (tile & 0xfeu) * 16u + (row & 7u) + ((row & 8u) << 1u);
    else a = (((NR(R_CTRL) & 8u) != 0u) ? 0x1000u : 0u) + tile * 16u + row;
    return nesChr(a) | (nesChr(a + 8u) << 8u);
}

void ppuSnapshot(uint y) {
    if (y >= 240u) return;
    uint base = N_LINE + y * N_LINE_STRIDE;
    uint mask = NR(R_MASK), ctrl = NR(R_CTRL), v = NR(R_V);
    uint mirror = NR(R_MIRROR);
    c.atlas[base] = mask;
    c.atlas[base + 1u] = NR(R_FINE_X) & 7u;
    c.atlas[base + 2u] = ctrl;
    for (uint i = 4u; i < 8u; ++i) c.atlas[base + i] = 0u;
    for (uint i = 0u; i < 32u; ++i) c.atlas[base + 8u + i] = ppuRead(0x3f00u + i);
    // A row crosses at most one horizontal nametable boundary. Derive its two
    // physical bases once, and reuse each attribute byte across four tiles.
    uint table0 = (v >> 10u) & 3u, table1 = table0 ^ 1u;
    if (mirror == 0u) { table0 >>= 1u; table1 >>= 1u; }
    else if (mirror == 1u) { table0 &= 1u; table1 &= 1u; }
    uint nt0 = N_NT + (table0 << 10u), nt1 = N_NT + (table1 << 10u);
    uint coarseX = v & 31u, tileRow = v & 0x03e0u;
    uint attrRow = 0x03c0u | ((v >> 4u) & 0x38u);
    uint attrYShift = (v >> 4u) & 4u;
    uint patternRow = (((ctrl & 0x10u) != 0u) ? 0x1000u : 0u) | ((v >> 12u) & 7u);
    uint lastAttr = 0xffffffffu, attrByte = 0u;
    for (uint i = 0u; i < 33u; ++i) {
        uint x = coarseX + i, col = x & 31u;
        uint nt = (x < 32u) ? nt0 : nt1;
        uint attrAddr = nt + attrRow + (col >> 2u);
        if (attrAddr != lastAttr) {
            attrByte = c.atlas[attrAddr] & 255u;
            lastAttr = attrAddr;
        }
        uint tile = c.atlas[nt + tileRow + col] & 255u;
        uint palette = (attrByte >> (attrYShift | (col & 2u))) & 3u;
        uint a = patternRow + tile * 16u;
        c.atlas[base + 40u + i] = nesChr(a) | (nesChr(a + 8u) << 8u) | (palette << 16u);
    }
    uint found = 0u;
    int height = ((ctrl & 0x20u) != 0u) ? 16 : 8;
    for (uint i = 0u; i < 64u; ++i) {
        uint oam = N_OAM + i * 4u;
        int row = int(y) - int(c.atlas[oam] & 255u) - 1;
        if (row < 0 || row >= height) continue;
        if (found == 8u) {
            if ((mask & 0x18u) != 0u) NR(R_STATUS) |= 0x20u;
            break;
        }
        uint attr = c.atlas[oam + 2u] & 255u;
        uint pattern = ppuSpritePattern(c.atlas[oam + 1u] & 255u, attr, uint(row));
        uint dst = base + 80u + found * 4u;
        c.atlas[dst] = c.atlas[oam + 3u] & 255u;
        c.atlas[dst + 1u] = pattern & 255u;
        c.atlas[dst + 2u] = pattern >> 8u;
        c.atlas[dst + 3u] = attr | ((i == 0u) ? 0x100u : 0u);
        ++found;
    }
    for (uint i = found * 4u; i < 32u; ++i) c.atlas[base + 80u + i] = 0u;
    c.atlas[base + 3u] = found;
}

int ppuSpriteZeroX(uint y) {
    uint mask = NR(R_MASK);
    if (y >= 240u || (mask & 0x18u) != 0x18u || (NR(R_STATUS) & 0x40u) != 0u) return -1;
    int row = int(y) - int(c.atlas[N_OAM] & 255u) - 1;
    int height = ((NR(R_CTRL) & 0x20u) != 0u) ? 16 : 8;
    if (row < 0 || row >= height) return -1;
    uint attr = c.atlas[N_OAM + 2u] & 255u;
    uint pattern = ppuSpritePattern(c.atlas[N_OAM + 1u] & 255u, attr, uint(row));
    uint start = c.atlas[N_OAM + 3u] & 255u;
    for (uint i = 0u; i < 8u; ++i) {
        uint x = start + i;
        if (x >= 255u) break;
        if (x < 8u && (mask & 6u) != 6u) continue;
        uint bit = ((attr & 0x40u) != 0u) ? i : 7u - i;
        uint sp = ((pattern >> bit) & 1u) | ((pattern >> (bit + 7u)) & 2u);
        if (sp == 0u) continue;
        uint bx = (NR(R_FINE_X) & 7u) + x;
        uint bg = ppuBackgroundTile(ppuHorizontalOffset(NR(R_V), bx >> 3u));
        uint bbit = 7u - (bx & 7u);
        uint bp = ((bg >> bbit) & 1u) | ((bg >> (bbit + 7u)) & 2u);
        if (bp != 0u) return int(x);
    }
    return -1;
}
#endif
