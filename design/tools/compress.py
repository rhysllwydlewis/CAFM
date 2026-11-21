"""Shrinks rendered PNGs by quantising to a 256-colour palette.

UI screenshots use few colours, so this keeps them visually identical while
cutting file size by roughly 65-75%. Run after tools/render.js.
Usage: python3 -I tools/compress.py mockups/png
"""
import sys
from pathlib import Path
from PIL import Image

folder = Path(sys.argv[1])
before = after = 0
for p in sorted(folder.glob("*.png")):
    before += p.stat().st_size
    img = Image.open(p).convert("RGB")
    q = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q.save(p, optimize=True)
    after += p.stat().st_size
print(f"{before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")
