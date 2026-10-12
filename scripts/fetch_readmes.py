#!/usr/bin/env python3
"""Fetch README excerpts for every repo straight from raw.githubusercontent.com
(no API rate limit). Stores cleaned markdown/text snippets used by the detail view."""
import json, os, re, sys, urllib.request, urllib.error, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SRC = os.path.join(DATA, "repos.json")
OUT = os.path.join(DATA, "readmes.json")

CANDIDATES = ["README.md", "readme.md", "README.rst", "README.txt", "README",
              "Readme.md", "docs/README.md", "README.markdown"]
UA = {"User-Agent": "dsh-github-trends/1.0"}


def clean(md):
    s = md.replace("\r\n", "\n")
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)              # html comments
    s = re.sub(r"\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)", " ", s)   # linked badges
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)                # images
    s = re.sub(r"<img[^>]*>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)                             # html tags
    s = re.sub(r"^\s*\[!\[.*$", " ", s, flags=re.M)
    s = re.sub(r"^\s*[-=*_]{3,}\s*$", "\n", s, flags=re.M)     # rules
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def fetch_one(repo):
    fn = repo["full_name"]
    for name in CANDIDATES:
        url = f"https://raw.githubusercontent.com/{fn}/HEAD/{name}"
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=15) as r:
                raw = r.read(400000).decode("utf-8", "replace")
        except Exception:
            continue
        text = clean(raw)
        if len(text) < 40:
            continue
        return fn, {"file": name, "text": text[:6000], "length": len(text)}
    return fn, None


def main():
    repos = json.load(open(SRC))["repos"]
    done = {}
    if os.path.exists(OUT):
        done = json.load(open(OUT)).get("readmes", {})
    todo = [r for r in repos if r["full_name"] not in done]
    print(f"fetching READMEs for {len(todo)} repos ({len(done)} cached)", flush=True)

    ok = 0
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for i, (fn, res) in enumerate(ex.map(fetch_one, todo), 1):
            if res:
                done[fn] = res
                ok += 1
            if i % 50 == 0:
                json.dump({"readmes": done}, open(OUT, "w"), ensure_ascii=False)
                print(f"  {i}/{len(todo)} ({ok} ok)", flush=True)

    json.dump({"readmes": done}, open(OUT, "w"), ensure_ascii=False)
    print(f"done: {len(done)} readmes, {ok} newly fetched -> {OUT}")


if __name__ == "__main__":
    main()
