#!/usr/bin/env python3
"""Step through a rendered reveal.js deck in ONE headless Chrome and screenshot every step.

    python3 tools/shoot_deck.py _site/index.html out_dir [max_steps]

Uses the DevTools protocol over a fresh profile and closes the browser itself.
Never run two of these at once.
"""
import asyncio
import base64
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request

import websockets

html = pathlib.Path(sys.argv[1]).resolve()
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
max_steps = int(sys.argv[3]) if len(sys.argv) > 3 else 80
port = 9600 + int(time.time()) % 300
profile = pathlib.Path.home() / "snap/chromium/common" / f"shoot-{port}"

proc = subprocess.Popen(
    ["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
     "--window-size=1280,720", "--allow-file-access-from-files",
     f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def target():
    for _ in range(60):
        try:
            pages = [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json")) if t["type"] == "page"]
            if pages:
                return pages[0]
        except Exception:
            pass
        time.sleep(0.25)
    raise SystemExit("chrome did not start")


async def main():
    t = target()
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=2 ** 30) as ws:
        mid = 0

        async def call(method, **params):
            nonlocal mid
            mid += 1
            await ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("id") == mid:
                    return m.get("result", m)

        async def js(expr):
            r = await call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
            return r.get("result", {}).get("value")

        await call("Page.enable")
        await call("Page.navigate", url=html.as_uri())
        await asyncio.sleep(4)
        for i in range(max_steps):
            idx = await js("JSON.stringify(Reveal.getIndices())")
            shot = await call("Page.captureScreenshot", format="png")
            (out / f"{i:02d}.png").write_bytes(base64.b64decode(shot["data"]))
            print(i, idx)
            moved = await js("(function(){var b=JSON.stringify(Reveal.getIndices());Reveal.next();return JSON.stringify(Reveal.getIndices())!==b})()")
            if not moved:
                break
            await asyncio.sleep(0.9)
        await call("Browser.close")


try:
    asyncio.run(main())
finally:
    try:
        proc.terminate()
    except Exception:
        pass
