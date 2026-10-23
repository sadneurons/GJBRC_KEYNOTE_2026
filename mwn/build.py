#!/usr/bin/env python3
"""Build mwn/index.html as a single self-contained file.

The diagram is mwn.png, a 300 dpi render of the Foresight PDF (pdftoppm -r 300).
It is wrapped in a one-element SVG whose viewBox is the PDF's point coordinate
system (1190.55 x 841.89), so the widget's viewpoints are expressed in PDF points
and the raster is simply the picture inside.  A bitmap renders identically in
every browser; vector conversions of this PDF (pdftocairo, Inkscape) produce
filter chains that Firefox and most non-Chrome renderers draw as blank.

Inlines mwn.css, the wrapped image and mwn.js into index.src.html so the page
works from disk, through a sandboxed browser's document portal (which exposes
only the one file), or served over http.  Run after editing any source:

    python3 build.py
"""
import base64
import json
import pathlib

here = pathlib.Path(__file__).parent
W, H = 1190.55, 841.89

src = (here / "index.src.html").read_text()
css = (here / "mwn.css").read_text()
js = (here / "mwn.js").read_text()
png = base64.b64encode((here / "mwn.png").read_bytes()).decode()

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
       f'<image x="0" y="0" width="{W}" height="{H}" preserveAspectRatio="none" '
       f'href="data:image/png;base64,{png}"/></svg>')

# </script> inside a JSON string would end the script block early
svg_js = "window.MWN_SVG = " + json.dumps(svg).replace("</", "<\\/") + ";"

out = (src
       .replace("<!-- BUILD:CSS -->", "<style>\n" + css + "\n</style>")
       .replace("<!-- BUILD:JS -->", "<script>" + svg_js + "</script>\n<script>\n" + js + "\n</script>"))
(here / "index.html").write_text(out)
print("wrote index.html", round(len(out) / 1e6, 2), "MB")
