"""
Genera los iconos PWA de ControlGuard: un glifo geométrico de escudo con un
punto de control (círculo) en el centro, en la paleta ink-950/action-400 del
sistema de diseño (ver src/index.css). Sobrio, sin gradientes ni clichés
decorativos, consistente con la identidad "centro de operaciones".
"""
from PIL import Image, ImageDraw
import os

INK_950 = (10, 11, 13, 255)
ACTION_400 = (232, 163, 61, 255)
INK_100 = (221, 224, 229, 255)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)


def shield_path(size, inset_ratio=0.16):
    """Puntos de un escudo geométrico simple (pentágono con base curva simulada por polígono)."""
    w = h = size
    inset = size * inset_ratio
    top = inset
    bottom = size - inset * 1.05
    left = inset
    right = size - inset
    mid_x = size / 2
    notch_y = top + (bottom - top) * 0.32
    return [
        (mid_x, top),
        (right, notch_y),
        (right, bottom * 0.62),
        (mid_x, bottom),
        (left, bottom * 0.62),
        (left, notch_y),
    ]


def make_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable:
        # Maskable: el fondo debe llenar todo el lienzo (zona segura ~40% central)
        draw.rectangle([0, 0, size, size], fill=INK_950)
        scale = 0.62
    else:
        draw.rounded_rectangle([0, 0, size, size], radius=size * 0.22, fill=INK_950)
        scale = 0.86

    # Escudo centrado, escalado
    pts = shield_path(size)
    cx, cy = size / 2, size / 2
    scaled = [(cx + (x - cx) * scale, cy + (y - cy) * scale) for x, y in pts]

    stroke_w = max(2, round(size * 0.035))
    draw.polygon(scaled, outline=ACTION_400, width=stroke_w)

    # Punto de control central (el "checkpoint" — núcleo conceptual del producto)
    r = size * 0.055
    draw.ellipse([cx - r, cy - r * 0.4, cx + r, cy + r * 1.6], fill=ACTION_400)

    return img


def make_favicon_svg():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="rgb{INK_950[:3]}"/>
  <polygon points="32,10 52,22 52,40 32,55 12,40 12,22"
    fill="none" stroke="rgb{ACTION_400[:3]}" stroke-width="2.4"/>
  <circle cx="32" cy="33" r="3.6" fill="rgb{ACTION_400[:3]}"/>
</svg>'''
    with open(os.path.join(OUT_DIR, "..", "favicon.svg"), "w") as f:
        f.write(svg)


# Iconos PWA estándar
make_icon(192).save(os.path.join(OUT_DIR, "icon-192.png"))
make_icon(512).save(os.path.join(OUT_DIR, "icon-512.png"))
# Maskable: Android recorta a un círculo/superellipse, por eso el fondo llena el lienzo
make_icon(512, maskable=True).save(os.path.join(OUT_DIR, "icon-512-maskable.png"))
# Apple touch icon
make_icon(180).save(os.path.join(OUT_DIR, "..", "apple-touch-icon.png"))
make_favicon_svg()

print("Iconos generados en", os.path.abspath(OUT_DIR))
