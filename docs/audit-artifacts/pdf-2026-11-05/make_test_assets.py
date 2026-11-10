from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parent
font_path = 'C:/Windows/Fonts/arialbd.ttf'
specs = [
    ('firma-qa.png', (720, 180), '#157A36', ['QA FIRMA', 'SOLO PRUEBA 1105']),
    ('sello-qa.png', (360, 360), '#1651B8', ['QA SELLO', 'SOLO PRUEBA', '1105']),
    ('recibo-stamp-qa.png', (600, 240), '#BD2020', ['QA RECIBO', 'SOLO PRUEBA 1105']),
]
for name, size, color, lines in specs:
    im = Image.new('RGBA', size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((6, 6, size[0]-7, size[1]-7), radius=18, outline=color, width=10)
    font_size = 48 if name != 'sello-qa.png' else 38
    font = ImageFont.truetype(font_path, font_size)
    step = size[1] / (len(lines) + 1)
    for n, line in enumerate(lines, 1):
        draw.text((size[0]/2, step*n), line, font=font, fill=color, anchor='mm')
    im.save(out / name, format='PNG')
    with Image.open(out / name) as check:
        check.verify()
    print(f'{name}: PNG {size[0]}x{size[1]}, {(out/name).stat().st_size} bytes')
