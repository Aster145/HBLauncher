"""Render a read-only browser response into an L8 atlas; JSON stdin, raw stdout."""
import json
import os
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 2048, 1024
VISIBLE = 1800
ROOT = Path(__file__).resolve().parents[2]


def font_path():
    candidates = [os.environ.get("HB_BROWSER_FONT"), r"C:\Windows\Fonts\msyh.ttc",
                  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                  os.environ.get("HB_FONT"), str(ROOT / "tools/fonts/DejaVuSans.ttf")]
    for value in candidates:
        if value and Path(value).is_file():
            return value
    raise RuntimeError("A browser text font is required")


FONT_PATH = font_path()
FONT = {size: ImageFont.truetype(FONT_PATH, size) for size in (20, 22, 24, 26, 28, 30, 34)}
image = Image.new("L", (WIDTH, HEIGHT), 0)
draw = ImageDraw.Draw(image)


def fit(value, font, width):
    if draw.textlength(value, font=font) <= width:
        return value
    suffix = "…"
    left, right = 0, len(value)
    while left < right:
        middle = (left + right + 1) // 2
        if draw.textlength(value[:middle] + suffix, font=font) <= width:
            left = middle
        else:
            right = middle - 1
    return value[:left] + suffix


def line(value, x, y, size=30, width=None):
    value = str(value)
    if width is not None:
        value = fit(value, FONT[size], width)
    draw.text((x, y), value, font=FONT[size], fill=255, anchor="lt")


def size_text(size):
    if size < 1024:
        return f"{size:,} B"
    for unit in ("KiB", "MiB", "GiB", "TiB", "PiB"):
        size /= 1024
        if size < 1024:
            return f"{size:,.2f} {unit}"
    return f"{size:,.2f} PiB"


def wrapped(text, font, width):
    result = []
    for original in text.replace("\r\n", "\n").replace("\r", "\n").expandtabs(4).split("\n"):
        if not original:
            result.append("")
            continue
        current = ""
        for char in original:
            if current and draw.textlength(current + char, font=font) > width:
                result.append(current)
                current = char
            else:
                current += char
        result.append(current)
    return result


def render(frame):
    line("可访问目录 /" if frame["path"] == "/" else frame["path"], 0, 8, 34, VISIBLE)
    if frame["status"]:
        line("读取失败", 0, 72, 30)
        for i, value in enumerate(wrapped(frame.get("error", ""), FONT[28], VISIBLE)[:8]):
            line(value, 32, 160 + i * 48, 28)
        line("读取失败，未保留旧目录内容。", 0, 936, 24, VISIBLE)
        return
    page, pages = frame["page"] + 1, frame["pageCount"]
    if frame["mode"] == 1:
        line(f"{frame['totalEntries']:,} 项    第 {page:,} / {pages:,} 页", 0, 72, 28, VISIBLE)
        if not frame["entries"]:
            line("此目录为空", 48, 152, 30)
        for i, entry in enumerate(frame["entries"]):
            y = 128 + 64 * i
            label = "文件夹" if entry["type"] == "dir" else size_text(entry["size"])
            if not entry["actionable"]:
                label = "路径过长"
            line(entry["name"], 48, y + 14, 26, 1390)
            w = draw.textlength(label, font=FONT[22])
            line(label, VISIBLE - 60 - w, y + 16, 22)
        line("只读浏览 SmileBASIC 可访问的目录。", 0, 936, 24, VISIBLE)
    else:
        offset, count = frame["previewOffset"], frame["previewLength"]
        kind = "UTF-8 文本" if frame["previewKind"] == 1 else "十六进制"
        end = offset + count
        line(f"{frame['fileSize']:,} 字节    {kind}    第 {page:,} / {pages:,} 页    [{offset:,}, {end:,})", 0, 72, 28, VISIBLE)
        if not count:
            line("空文件", 32, 152, 30)
        elif frame["previewKind"] == 1:
            rows = wrapped(frame.get("previewText", ""), FONT[20], VISIBLE - 64)
            for i, value in enumerate(rows[:32]):
                line(value, 32, 132 + 22 * i, 20)
            if len(rows) > 32:
                line("本页换行较多，按 Y 切换十六进制可查看全部字节。", 0, 936, 24, VISIBLE)
                return
        else:
            data = bytes.fromhex(frame["previewHex"])
            # Fixed cells avoid a proportional CJK font changing hex alignment.
            for i in range(0, len(data), 16):
                chunk, y = data[i:i + 16], 132 + (i // 16) * 22
                line(f"{offset + i:012X}", 32, y, 20)
                for j, byte in enumerate(chunk):
                    line(f"{byte:02X}", 230 + j * 49, y, 20)
                    line(chr(byte) if 32 <= byte <= 126 else ".", 1060 + j * 28, y, 20)
        line("只读预览，每页最多 512 字节。", 0, 936, 24, VISIBLE)


render(json.load(sys.stdin))
sys.stdout.buffer.write(image.tobytes())
