from pathlib import Path
import os
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
candidates = [os.environ.get('SNAKE_FONT', ''), 'C:/Windows/Fonts/msyh.ttc',
              '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']
font = next((p for p in candidates if p and Path(p).is_file()), None)
if not font:
    raise SystemExit('Set SNAKE_FONT to a font that supports Simplified Chinese.')
atlas = Image.new('L', (1024, 2048))
draw = ImageDraw.Draw(atlas)
header, y = [], 2
labels = [
    ('TITLE', 'SNAKE', 72), ('SUBTITLE', '贪吃蛇 · 吃掉果实，保持前进', 28),
    ('SCORE', '当前得分', 26), ('BEST', '本次最高', 25),
    ('SPEED', '速度', 25), ('UNIT', '格 / 秒', 23),
    ('CONTROLS', '操作', 26), ('MOVE', '方向键 / 左摇杆    转向', 25),
    ('PAUSE_KEY', '+ / X    暂停与继续', 25), ('BACK_KEY', 'B / −    返回菜单', 25),
    ('FOOTER', '每个果实 +10 分  ·  撞到墙或自己即结束', 25),
    ('READY', '准备开饭', 48), ('START', '按 A 开始', 30),
    ('RULES', '控制方向，收集红色果实', 26),
    ('PAUSED', '休息一下', 48), ('RESUME', '按 A / + / X 继续', 28),
    ('DEAD', '再来一局？', 48), ('RETRY', '按 A 重新开始', 30),
    ('WON', '整个棋盘都是你的！', 44),
    ('DISCONNECTED', '手柄已断开', 40), ('RECONNECT', '连接手柄后，按 A 继续', 26),
]
for name, label, size in labels:
    face = ImageFont.truetype(font, size)
    bounds = draw.textbbox((0, 0), label, font=face)
    w, h = bounds[2]-bounds[0], bounds[3]-bounds[1]
    if w > 1020 or y+h+8 > 2048:
        raise ValueError('Text atlas overflow')
    draw.text((2-bounds[0], y-bounds[1]), label, font=face, fill=255)
    header.append(f'const ivec4 TEXT_{name}=ivec4(2,{y},{w},{h});')
    y += h+10
# One horizontal strip of equally sized digit cells.
face = ImageFont.truetype(font, 76)
for digit in range(10):
    bounds = draw.textbbox((0, 0), str(digit), font=face)
    width = bounds[2]-bounds[0]
    draw.text((digit*64+(64-width)//2-bounds[0], y-bounds[1]), str(digit), font=face, fill=255)
if y+96 > 2048:
    raise ValueError('Digit atlas overflow')
header.append(f'const int DIGITS_Y={y};')
used_rows = y+96
(root/'assets/text.bin').write_bytes(atlas.tobytes())
(root/'shaders/text.glsl').write_text('\n'.join(header)+'\n', encoding='utf-8')

# Procedural icon: the same green snake and coral fruit used on the board.
im=Image.new('RGBA',(256,256),(14,23,31,255)); d=ImageDraw.Draw(im)
d.rounded_rectangle((15,15,241,241),radius=44,fill=(22,39,47))
for x,y in [(65,177),(65,132),(65,87),(110,87),(155,87)]:
    d.rounded_rectangle((x-20,y-20,x+20,y+20),radius=11,fill=(125,236,163))
d.rounded_rectangle((135,67,175,107),radius=11,fill=(188,255,203))
d.ellipse((158,76,165,83),fill=(14,36,30));d.ellipse((158,91,165,98),fill=(14,36,30))
d.ellipse((167,157,201,191),fill=(255,118,108))
d.line((185,157,191,148),fill=(188,255,203),width=5)
im.save(root/'assets/icon.png')
print(f'Snake text atlas: {used_rows}/2048 rows; Chinese font: {font}')
