#!/usr/bin/env python3
"""Download the Foresight Mental Capital and Wellbeing (2008) publications.

The original site, www.foresight.gov.uk/Mental Capital/, is gone. Copies are in
the UK Government Web Archive (National Archives) and the Internet Archive.
This script takes a CDX listing (timestamp, original URL, length per line) and
fetches each file, National Archives first, Internet Archive as fallback, into
references/foresight/. It writes manifest.csv with the source used.

    python3 fetch_foresight.py cdx.txt
"""
import csv
import pathlib
import sys
import time
import urllib.parse
import urllib.request

here = pathlib.Path(__file__).parent
out = here / "foresight"
out.mkdir(exist_ok=True)

UA = {"User-Agent": "GJBRC-keynote-reference-fetch/1.0 (+ross.dunne research use)"}


def get(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if not data.startswith(b"%PDF"):
        raise ValueError("not a PDF (%d bytes)" % len(data))
    dest.write_bytes(data)
    return len(data)


rows = [l.split() for l in open(sys.argv[1]) if l.strip()]
manifest = []
for ts, orig, length in rows:
    name = urllib.parse.unquote(orig.rsplit("/", 1)[-1])
    dest = out / name
    if dest.exists() and dest.stat().st_size > 1000:
        manifest.append((name, "cached", orig, dest.stat().st_size))
        continue
    sources = [
        ("ukgwa", f"https://webarchive.nationalarchives.gov.uk/ukgwa/{ts}id_/{orig}"),
        ("wayback", f"https://web.archive.org/web/{ts}id_/{orig}"),
    ]
    ok = None
    for label, url in sources:
        try:
            n = get(url, dest)
            ok = (label, n)
            break
        except Exception as e:  # noqa: BLE001
            print(f"  {label} failed for {name}: {e}")
    if ok:
        print(f"{name}: {ok[1]} bytes from {ok[0]}")
        manifest.append((name, ok[0], orig, ok[1]))
    else:
        print(f"{name}: FAILED")
        manifest.append((name, "FAILED", orig, 0))
    time.sleep(0.5)

with open(here / "manifest.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["file", "source", "original_url", "bytes"])
    w.writerows(sorted(manifest))
failed = [m for m in manifest if m[1] == "FAILED"]
print(f"\n{len(manifest) - len(failed)} fetched, {len(failed)} failed")
