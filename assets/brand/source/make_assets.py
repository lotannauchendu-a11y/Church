"""Cut the Calvary Hill logo files into web assets (alpha masks + color files).

Usage (from the repo root):  python3 assets/brand/source/make_assets.py assets/brand
Reads the original logo files in assets/brand/source/ and writes the web assets next to them.
"""
import sys
from pathlib import Path
from PIL import Image
import numpy as np

OUT = Path(sys.argv[1])
SRC_BLACK = OUT / 'source/calvary-hill-badge-black.png'        # black circular badge
SRC_COLOR = OUT / 'source/calvary-hill-badge-watercolor.png'   # watercolor badge
SRC_HORIZ = OUT / 'source/calvary-hill-lockup-horizontal.png'  # horizontal lockup on cream

# ---------- sample brand colors from the watercolor badge ----------
c = np.asarray(Image.open(SRC_COLOR).convert('RGB')).astype(int)
def sample(x0, y0, x1, y1):
    p = c[y0:y1, x0:x1].reshape(-1, 3)
    lum = p.mean(1)
    p = p[lum < np.percentile(lum, 35)]  # darkest third = solid ink
    return '#%02X%02X%02X' % tuple(np.median(p, 0).astype(int))
print('cross green ', sample(615, 200, 650, 420))
print('hill bronze ', sample(250, 520, 330, 560))
print('cream bg    ', '#%02X%02X%02X' % tuple(c[300:320, 200:220].reshape(-1, 3).mean(0).astype(int)))

# ---------- alpha layers from the black badge ----------
L = np.asarray(Image.open(SRC_BLACK).convert('L')).astype(float)
H, W = L.shape
alpha = np.clip((255 - L - 6) / (255 - 6 - 30), 0, 1)
yy, xx = np.mgrid[0:H, 0:W]
dist = np.hypot(yy - H / 2, xx - W / 2)
inside = dist < 590

def interp(y, pts):
    ys, vs = zip(*pts)
    return np.interp(y, ys, vs)

xl = interp(yy, [(530, 598), (640, 606), (735, 618)])
xr = interp(yy, [(530, 656), (640, 648), (735, 640)])
mark_rows = (yy >= 140) & (yy < 742)
cross = inside & mark_rows & ((yy < 530) | ((xx >= xl) & (xx <= xr)))
hills = inside & mark_rows & (yy >= 530) & ~cross

def layer(mask):
    a = (alpha * mask * 255).astype(np.uint8)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 3] = a
    return Image.fromarray(rgba, 'RGBA')

cross_im, hills_im = layer(cross), layer(hills)
box = (92, 140, 1172, 742)  # union of cross + hills, padded
cross_im.crop(box).save(OUT / 'mark-cross.png', optimize=True)
hills_im.crop(box).save(OUT / 'mark-hills.png', optimize=True)
# cross alone, tight, for the hero landscape
# hero cross: drop the hill-stroke stubs where the bar passes through the hills
hero_cross = cross & ((yy < 575) | ((xx >= 611) & (xx <= 645)))
layer(hero_cross).crop((405, 140, 835, 742)).save(OUT / 'cross.png', optimize=True)
# hills alone, tight, used as a small ornament
hills_im.crop((92, 525, 1172, 742)).save(OUT / 'hills.png', optimize=True)

# full badge mask (ring + mark + wordmark) for one-color use
full = layer(np.ones_like(alpha, bool))
full.resize((640, 640), Image.LANCZOS).save(OUT / 'badge-mask.png', optimize=True)

# ---------- colored mark for favicons ----------
def tint(im, hexcol):
    r, g, b = (int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    arr = np.asarray(im).copy()
    arr[..., 0], arr[..., 1], arr[..., 2] = r, g, b
    return Image.fromarray(arr, 'RGBA')

PINE, BRONZE, PAPER = '#2F4229', '#A9793F', '#F6F1E6'
mark = Image.alpha_composite(tint(hills_im, BRONZE), tint(cross_im, PINE)).crop(box)
mark.save(OUT / 'mark-color.png', optimize=True)

def square(im, size, pad, bg=None):
    w, h = im.size
    s = (size - 2 * pad) / max(w, h)
    small = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    canvas.alpha_composite(small, ((size - small.width) // 2, (size - small.height) // 2))
    return canvas

# favicon: cross + hills, cropped tighter so it reads at 32px
fav_src = Image.alpha_composite(tint(hills_im, BRONZE), tint(cross_im, PINE)).crop((250, 140, 1015, 742))
square(fav_src, 64, 2).save(OUT / 'favicon-64.png', optimize=True)
square(fav_src, 180, 22, (246, 241, 230, 255)).convert('RGB').save(OUT / 'apple-touch-icon.png', optimize=True)

# ---------- watercolor badge with transparent corners ----------
col = Image.open(SRC_COLOR).convert('RGBA')
carr = np.asarray(col).astype(int)
mid = carr[H // 2]
nonwhite = np.where(mid[:, :3].sum(1) < 720)[0]
r = (W / 2) - nonwhite[0] + 1.5
print('watercolor badge radius', r)
d2 = np.hypot(yy - H / 2 + 0.5, xx - W / 2 + 0.5)
ca = np.clip(r - d2 + 0.5, 0, 1)
out = np.asarray(col).copy()
out[..., 3] = (ca * 255).astype(np.uint8)
Image.fromarray(out, 'RGBA').resize((720, 720), Image.LANCZOS).save(OUT / 'badge-watercolor.webp', quality=86, method=6)

# ---------- social share image ----------
hz = Image.open(SRC_HORIZ).convert('RGB')
bg = tuple(np.asarray(hz)[5:25, 5:25].reshape(-1, 3).mean(0).astype(int))
og = Image.new('RGB', (1200, 630), bg)
s = 1080 / hz.width
hz2 = hz.resize((1080, round(hz.height * s)), Image.LANCZOS)
og.paste(hz2, ((1200 - hz2.width) // 2, (630 - hz2.height) // 2))
og.save(OUT / 'og-image.jpg', quality=88)
print('done')
