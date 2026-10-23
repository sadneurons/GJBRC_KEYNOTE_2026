#!/usr/bin/env python3
"""Inline the PNG assets into gjbrc.scss as data URIs.

Run this after changing anything in assets/ or gjbrc.template.scss:
    python3 build-scss.py
"""
import base64
import pathlib
import re

here = pathlib.Path(__file__).parent
src = (here / "gjbrc.template.scss").read_text()


def inline(m):
    name = m.group(1)
    data = (here / "assets" / f"{name}.png").read_bytes()
    return 'url("data:image/png;base64,' + base64.b64encode(data).decode() + '")'


out = re.sub(r'url\("ASSET:([a-z0-9-]+)"\)', inline, src)
(here / "gjbrc.scss").write_text(out)
print("wrote", here / "gjbrc.scss", len(out), "bytes")
