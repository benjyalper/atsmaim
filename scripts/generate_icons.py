"""Generate home-screen icons for atsmaim. Run once; outputs go in public/."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\segoeuib.ttf',
    r'C:\Windows\Fonts\arialbd.ttf',
    r'C:\Windows\Fonts\david.ttf',
    r'C:\Windows\Fonts\arial.ttf',
]

def find_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    raise RuntimeError('No suitable font found')

def make_icon(size, out_path):
    img = Image.new('RGB', (size, size), (44, 62, 107))  # #2c3e6b
    draw = ImageDraw.Draw(img)

    # Subtle radial-ish lighter spot top-left for depth (use a simple ellipse)
    overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse(
        [-size * 0.3, -size * 0.4, size * 0.9, size * 0.6],
        fill=(255, 255, 255, 22)
    )
    img.paste(overlay, (0, 0), overlay)

    draw = ImageDraw.Draw(img)
    font_path = find_font()
    # Hebrew letter aleph
    text = 'א'
    font_size = int(size * 0.62)
    font = ImageFont.truetype(font_path, font_size)

    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]

    # subtle shadow
    draw.text((x + max(2, size // 200), y + max(2, size // 200)), text,
              fill=(0, 0, 0, 80), font=font)
    draw.text((x, y), text, fill=(255, 255, 255), font=font)

    img.save(out_path, 'PNG', optimize=True)
    print(f'wrote {out_path}')

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    make_icon(180, os.path.join(OUT_DIR, 'apple-touch-icon.png'))
    make_icon(192, os.path.join(OUT_DIR, 'icon-192.png'))
    make_icon(512, os.path.join(OUT_DIR, 'icon-512.png'))
    make_icon(32, os.path.join(OUT_DIR, 'favicon-32.png'))

if __name__ == '__main__':
    main()
