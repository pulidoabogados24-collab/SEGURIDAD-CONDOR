"""
Genera los iconos PWA de Seguridad Cóndor a partir del logo real de marca
(escudo negro/dorado con el cóndor), no de un glifo genérico. Fuente:
public/brand/logo-condor.jpg (600x600, fondo negro sólido ya integrado al
diseño del logo, sin transparencia).

- icon-192 / icon-512: el logo tal cual, reescalado.
- icon-512-maskable: el logo con más margen interno, porque Android recorta
  maskable icons a un círculo/superellipse y el escudo del logo no debe
  quedar cortado en las puntas.
- apple-touch-icon: el logo reescalado a 180px (iOS ya redondea las esquinas
  solo, no hace falta redondear aquí).
- favicon: PNG del logo a 64px (se referencia como favicon.png; los
  navegadores modernos aceptan PNG sin problema).
"""
from PIL import Image
import os

BASE_DIR = os.path.join(os.path.dirname(__file__), "..")
LOGO_SRC = os.path.join(BASE_DIR, "..", "..", "condor-web", "public", "brand", "logo-condor.jpg")
OUT_DIR = os.path.join(BASE_DIR, "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

INK_950 = (10, 11, 13, 255)


def load_logo():
    img = Image.open(LOGO_SRC).convert("RGBA")
    return img


def square_canvas(size, bg=INK_950):
    return Image.new("RGBA", (size, size), bg)


def make_icon(logo, size):
    """Logo ocupando el lienzo completo (ya trae su propio fondo negro)."""
    resized = logo.resize((size, size), Image.LANCZOS)
    return resized


def make_maskable_icon(logo, size):
    """Deja ~20% de margen para que el recorte circular/superellipse de
    Android no corte las puntas del escudo ni el texto del logo."""
    canvas = square_canvas(size)
    inner = round(size * 0.72)
    resized = logo.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(resized, (offset, offset))
    return canvas


def make_favicon_png(logo, size=64):
    return logo.resize((size, size), Image.LANCZOS)


logo = load_logo()

make_icon(logo, 192).convert("RGB").save(os.path.join(OUT_DIR, "icon-192.png"))
make_icon(logo, 512).convert("RGB").save(os.path.join(OUT_DIR, "icon-512.png"))
make_maskable_icon(logo, 512).convert("RGB").save(os.path.join(OUT_DIR, "icon-512-maskable.png"))
make_icon(logo, 180).convert("RGB").save(os.path.join(BASE_DIR, "public", "apple-touch-icon.png"))
make_favicon_png(logo, 64).save(os.path.join(BASE_DIR, "public", "favicon.png"))

# También dejamos una copia del logo original a mayor resolución para usarlo
# dentro de la UI (login, sidebar), no solo como ícono de sistema.
logo.convert("RGB").resize((256, 256), Image.LANCZOS).save(
    os.path.join(BASE_DIR, "public", "logo-condor.png")
)

print("Iconos generados a partir del logo real en", os.path.abspath(OUT_DIR))
