#!/usr/bin/env python3
"""Build mwn/index.html as a single self-contained file.

Inlines mwn.css, mwn.svg and mwn.js into index.src.html so the page works when
opened from disk, through a sandboxed browser's document portal (which exposes
only the one file), or served over http.  Run after editing any of those files:

    python3 build.py
"""
import json
import pathlib

here = pathlib.Path(__file__).parent
src = (here / "index.src.html").read_text()
css = (here / "mwn.css").read_text()
svg = (here / "mwn.svg").read_text()
js = (here / "mwn.js").read_text()

# </script> inside a JSON string would end the script block early
svg_js = "window.MWN_SVG = " + json.dumps(svg).replace("</", "<\\/") + ";"

out = (src
       .replace("<!-- BUILD:CSS -->", "<style>\n" + css + "\n</style>")
       .replace("<!-- BUILD:JS -->", "<script>" + svg_js + "</script>\n<script>\n" + js + "\n</script>"))
(here / "index.html").write_text(out)
print("wrote index.html", round(len(out) / 1e6, 2), "MB")
