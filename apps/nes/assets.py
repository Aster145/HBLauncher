from pathlib import Path
import os
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent
candidates=[os.environ.get('NES_FONT'), os.environ.get('HB_FONT'),
            'C:/Windows/Fonts/msyh.ttc',
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc']
font=next((p for p in candidates if p and Path(p).is_file()),None)
if not font:
 raise SystemExit('Set NES_FONT to a font file with Simplified Chinese glyphs.')
(root/'assets').mkdir(exist_ok=True)
atlas=Image.new('L',(1024,512));d=ImageDraw.Draw(atlas);y=2;header=[]
labels=[('TITLE','FC / NES · 无声测试版',30),('MOVE','方向键 / 摇杆：移动',24),
 ('JUMP','A：跳跃',24),('RUN','B / Y：加速',24),('START','＋：开始',24),
 ('SELECT','L：选择',24),('PAUSE','X：暂停 / 继续',24),('RESET','R：重新启动游戏',24),
 ('EXIT','－：返回 HBLauncher',24),('FOOTER','按 ＋ 开始游戏；本版本暂时没有声音。',24),
 ('PAUSED','已暂停 · X 继续',32),('FAULT','遇到尚未支持的指令，请按 － 返回。',28)]
for name,text,size in labels:
 f=ImageFont.truetype(font,size);b=d.textbbox((0,0),text,font=f);w,h=b[2]-b[0],b[3]-b[1]
 if w>1020 or y+h+4>512:raise RuntimeError('UI atlas overflow')
 d.text((2-b[0],y-b[1]),text,font=f,fill=255)
 header.append(f'const ivec4 UI_{name}=ivec4(2,{y},{w},{h});');y+=h+6
(root/'assets/ui.bin').write_bytes(atlas.tobytes())
(root/'shaders/ui.glsl').write_text('\n'.join(header)+'\n',encoding='utf8')
icon=Image.new('RGBA',(256,256),(10,16,25,255));d=ImageDraw.Draw(icon)
d.rounded_rectangle((16,16,240,240),radius=36,fill=(24,38,55))
d.rounded_rectangle((36,108,220,195),radius=20,fill=(215,221,229))
d.rectangle((61,127,81,177),fill=(23,32,44));d.rectangle((46,142,96,162),fill=(23,32,44))
for x in (157,191):d.ellipse((x-11,140,x+11,162),fill=(225,64,71))
f=ImageFont.truetype(font,44);d.text((75,37),'NES',font=f,fill=(255,255,255))
icon.save(root/'assets/icon.png')
print('NES UI assets generated.')
