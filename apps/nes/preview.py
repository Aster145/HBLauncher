from pathlib import Path
import sys
from PIL import Image
for name in sys.argv[1:]:
 p=Path(name)
 data=p.read_bytes()
 if len(data)!=1920*1080*4:raise ValueError('Unexpected RGBA length')
 Image.frombytes('RGBA',(1920,1080),data).save(p.with_suffix('.png'))
 print(p.with_suffix('.png'))
