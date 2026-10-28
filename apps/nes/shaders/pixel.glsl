#ifndef NES_PIXEL_GLSL
#define NES_PIXEL_GLSL
// Include nes.glsl first. Read-only consumer of ppu.glsl's 128-word scanline
// contract. No access to live PPU/OAM/CHR state: an older line remains intact
// after scroll, palette, OAM or CHR RAM writes later in the emulated frame.
// Returns a six-bit NES palette code. PPUMASK grayscale is applied here;
// emphasis bits remain in snapshot word zero for the RGB display stage.
uint nesPixel(uint x, uint y) {
    if (x >= 256u || y >= 240u) return 0x0fu;
    uint base = N_LINE + y * N_LINE_STRIDE;
    uint mask = c.atlas[base];
    uint bgPixel = 0u;
    uint paletteIndex = 0u;
    if ((mask & 8u) != 0u && (x >= 8u || (mask & 2u) != 0u)) {
        uint bx = x + (c.atlas[base + 1u] & 7u);
        uint tile = c.atlas[base + 40u + (bx >> 3u)];
        uint bit = 7u - (bx & 7u);
        bgPixel = ((tile >> bit) & 1u) | ((tile >> (bit + 7u)) & 2u);
        if (bgPixel != 0u) paletteIndex = ((tile >> 16u) & 3u) * 4u + bgPixel;
    }
    if ((mask & 0x10u) != 0u && (x >= 8u || (mask & 4u) != 0u)) {
        uint count = c.atlas[base + 3u];
        for (uint i = 0u; i < 8u; ++i) {
            if (i >= count) break;
            uint sprite = base + 80u + i * 4u;
            uint sx = c.atlas[sprite] & 255u;
            if (x < sx || x >= sx + 8u) continue;
            uint attr = c.atlas[sprite + 3u];
            uint bit = ((attr & 0x40u) != 0u) ? x - sx : 7u - (x - sx);
            uint pixel = ((c.atlas[sprite + 1u] >> bit) & 1u) | (((c.atlas[sprite + 2u] >> bit) & 1u) << 1u);
            if (pixel == 0u) continue;
            if (bgPixel == 0u || (attr & 0x20u) == 0u)
                paletteIndex = 16u + (attr & 3u) * 4u + pixel;
            // The first opaque OAM sprite wins evaluation even if behind BG.
            break;
        }
    }
    uint color = c.atlas[base + 8u + paletteIndex] & 63u;
    return ((mask & 1u) != 0u) ? color & 0x30u : color;
}
#endif
