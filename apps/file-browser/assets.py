from pathlib import Path
import os
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parent
candidates=[os.environ.get('HB_BROWSER_FONT',''),'C:/Windows/Fonts/msyh.ttc',
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']
font=next((p for p in candidates if p and Path(p).is_file()),None)
if not font:
    raise SystemExit('Set HB_BROWSER_FONT to a font with Simplified Chinese glyphs.')
atlas=Image.new('L',(1024,2048));draw=ImageDraw.Draw(atlas);header=[];y=2
labels=[
    ('TITLE','文件浏览器',58), ('READONLY','只读',25),
    ('NAME','名称',22),('SIZE','类型 / 大小',22),
    ('LOADING','正在读取…',30),('WAITING','正在等待读取结果…',30),
    ('HOST','等待电脑端文件接口…',30),('ERROR','读取失败',34),
    ('PROTOCOL','读取结果不完整，请按 X 重试',28),
    ('UNSUPPORTED','请重启电脑端 HBLauncher，加载新的文件接口',28),
    ('LONGPATH','路径过长，无法打开；按 B 返回或 X 刷新',28),
    ('RETRY','按 X 重试    B 返回    − 退出',26),
    ('LIST_KEYS','↑↓ 选择   A 打开   B 上级   L/R 翻页   X 刷新   − 退出',24),
    ('FILE_KEYS','L/R 翻页   Y 文本/十六进制   B 返回   X 刷新   − 退出',24),
    ('DISCONNECTED','手柄未连接',24),
]
for name,label,size in labels:
    face=ImageFont.truetype(font,size);bounds=draw.textbbox((0,0),label,font=face)
    w,h=bounds[2]-bounds[0],bounds[3]-bounds[1]
    if w>1020 or y+h+10>2048:
        raise ValueError('Text atlas overflow')
    draw.text((2-bounds[0],y-bounds[1]),label,font=face,fill=255)
    header.append(f'const ivec4 TEXT_{name}=ivec4(2,{y},{w},{h});');y+=h+10
(root/'assets/text.bin').write_bytes(atlas.tobytes())
(root/'shaders/text.glsl').write_text('\n'.join(header)+'\n',encoding='utf-8')
im=Image.new('RGBA',(256,256),(15,25,38,255));d=ImageDraw.Draw(im)
d.rounded_rectangle((17,17,239,239),radius=46,fill=(25,43,60))
d.rounded_rectangle((43,67,118,125),radius=12,fill=(244,189,85))
d.rounded_rectangle((39,90,217,197),radius=18,fill=(255,205,112))
d.rounded_rectangle((153,144,201,193),radius=9,fill=(22,70,84))
d.line((164,164,173,173,190,156),fill=(148,235,227),width=6)
im.save(root/'assets/icon.png')
print(f'File browser static atlas: {y}/2048 rows.')
