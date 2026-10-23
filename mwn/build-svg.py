#!/usr/bin/env python3
"""Wrap mwn.svg as mwn-svg.js so the widget works from file:// as well as http.

Browsers refuse fetch() on file:// pages, but <script> tags load fine.
Run after changing mwn.svg:   python3 build-svg.py
"""
import json
import pathlib

here = pathlib.Path(__file__).parent
svg = (here / "mwn.svg").read_text()
(here / "mwn-svg.js").write_text("window.MWN_SVG = " + json.dumps(svg) + ";\n")
print("wrote mwn-svg.js", len(svg), "chars")
