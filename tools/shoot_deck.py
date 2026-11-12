#!/usr/bin/env python3
"""Step through a rendered reveal.js deck in ONE headless Chromium and screenshot every step.

    python3 tools/shoot_deck.py _site/index.html out_dir [max_steps]
            [--slides 3,7-9]   only these slides (0-based), jumping straight to each
            [--ids a,b]        only the slides with these ids (the heading slugs in the URL)
            [--eval "js"]      with --ids: run this JavaScript on each slide, then take a second shot
            [--scale 1.5]      device scale factor (1 = 1280x720 pixels)
            [--wait 1.7]       seconds to let a slide settle before the shot

Screenshots are the true slide size (1280x720 CSS pixels). Uses the DevTools protocol
over a fresh profile, closes the browser itself and removes the profile.
Never run two of these at once.
"""
import argparse
import asyncio
import base64
import json
import pathlib
import shutil
import subprocess
import time
import urllib.request

import websockets

ap = argparse.ArgumentParser()
ap.add_argument("html")
ap.add_argument("out")
ap.add_argument("max_steps", nargs="?", type=int, default=80)
ap.add_argument("--slides", default="")
ap.add_argument("--ids", default="")
ap.add_argument("--eval", default="")
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--wait", type=float, default=1.7)
ap.add_argument("--width", type=int, default=1280)
ap.add_argument("--height", type=int, default=720)
args = ap.parse_args()

html = pathlib.Path(args.html).resolve()
out = pathlib.Path(args.out); out.mkdir(parents=True, exist_ok=True)
port = 9600 + int(time.time()) % 300
profile = pathlib.Path.home() / "snap/chromium/common" / f"shoot-{port}"


def wanted(spec):
    idx = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-")
            idx.extend(range(int(a), int(b) + 1))
        else:
            idx.append(int(part))
    return idx


proc = subprocess.Popen(
    ["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
     f"--window-size={args.width},{args.height}", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
     f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def target():
    for _ in range(80):
        try:
            pages = [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json")) if t["type"] == "page"]
            if pages:
                return pages[0]
        except Exception:
            pass
        time.sleep(0.25)
    raise SystemExit("chromium did not start")


async def main():
    t = target()
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=2 ** 30) as ws:
        mid = 0
        logs = []

        async def call(method, **params):
            nonlocal mid
            mid += 1
            await ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("method") == "Runtime.consoleAPICalled":
                    a = m["params"]
                    if a.get("type") in ("warning", "error"):
                        logs.append(a["type"] + ": " + " ".join(str(x.get("value", x.get("description", ""))) for x in a.get("args", [])))
                if m.get("method") == "Runtime.exceptionThrown":
                    logs.append("exception: " + json.dumps(m["params"].get("exceptionDetails", {}))[:400])
                if m.get("id") == mid:
                    return m.get("result", m)

        async def js(expr):
            r = await call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
            return r.get("result", {}).get("value")

        async def shot(name):
            s = await call("Page.captureScreenshot", format="png")
            (out / name).write_bytes(base64.b64decode(s["data"]))

        await call("Page.enable")
        await call("Runtime.enable")
        await call("Emulation.setDeviceMetricsOverride", width=args.width, height=args.height,
                   deviceScaleFactor=args.scale, mobile=False)
        await call("Page.navigate", url=html.as_uri())
        await asyncio.sleep(4)
        await js("document.fonts && document.fonts.ready.then(function(){return 1})")
        only = wanted(args.slides)
        for sid in [x.strip() for x in args.ids.split(",") if x.strip()]:
            moved = await js("(function(){var e=document.getElementById(%s);if(!e)return false;var i=Reveal.getIndices(e);Reveal.slide(i.h,i.v,-1);return true})()" % json.dumps(sid))
            if not moved:
                print("no slide with id", sid)
                continue
            await asyncio.sleep(args.wait)
            await shot(f"{sid}.png")
            print(sid, await js("JSON.stringify(Reveal.getIndices())"))
            if args.eval:
                print("eval:", await js(args.eval))
                await asyncio.sleep(args.wait)
                await shot(f"{sid}-eval.png")
        if args.ids:
            pass
        elif only:
            for i in only:
                await js(f"Reveal.slide({i}, 0, -1)")
                await asyncio.sleep(args.wait)
                await shot(f"{i:02d}.png")
                print(i, await js("JSON.stringify(Reveal.getIndices())"))
                # fragments on this slide, one shot each
                f = 0
                while await js("(function(){var s=Reveal.getCurrentSlide();return !!(s&&s.querySelector('.fragment:not(.visible)'))})()"):
                    await js("Reveal.nextFragment()")
                    f += 1
                    await asyncio.sleep(args.wait)
                    await shot(f"{i:02d}-f{f}.png")
                    print(i, "fragment", f)
        else:
            for i in range(args.max_steps):
                await asyncio.sleep(args.wait if i else 0.2)
                idx = await js("JSON.stringify(Reveal.getIndices())")
                await shot(f"{i:02d}.png")
                print(i, idx)
                moved = await js("(function(){var b=JSON.stringify(Reveal.getIndices());Reveal.next();return JSON.stringify(Reveal.getIndices())!==b})()")
                if not moved:
                    break
        for line in logs[:40]:
            print("console", line)
        await call("Browser.close")


try:
    asyncio.run(main())
finally:
    try:
        proc.terminate()
        proc.wait(timeout=10)
    except Exception:
        pass
    shutil.rmtree(profile, ignore_errors=True)
