#!/usr/bin/env python3
"""Merge raw GitHub Search API dumps into a single ranked dataset for the web page."""
import json, os, glob, datetime, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "repos.json")

NOW = datetime.datetime.now(datetime.timezone.utc)   # 用真实当前时间，增速/年龄才不会停在写死的日期

WINDOWS = {
    "created_7d": 7, "created_30d": 30, "created_90d": 90,
    "created_1y": 365, "created_3y": 1095,
}


def parse(ts):
    return datetime.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)


def clean_text(s, limit=None):
    if not s:
        return ""
    s = re.sub(r"\s+", " ", s).strip()
    return s[:limit].rstrip() if limit and len(s) > limit else s


repos = {}
membership = {}

for path in sorted(glob.glob(os.path.join(RAW, "*.json"))):
    tag = os.path.basename(path)[:-5]
    payload = json.load(open(path))
    for it in payload.get("items", []):
        if it.get("fork") or it.get("archived"):
            continue
        fn = it["full_name"]
        membership.setdefault(fn, set()).add(tag)
        prev = repos.get(fn)
        if prev is None or it["stargazers_count"] > prev["stargazers_count"]:
            repos[fn] = it

out = []
for fn, it in repos.items():
    created = parse(it["created_at"])
    pushed = parse(it["pushed_at"])
    age_days = max((NOW - created).total_seconds() / 86400.0, 0.5)
    stars = it["stargazers_count"]
    forks = it["forks_count"]
    lic = (it.get("license") or {}).get("spdx_id") or ""
    if lic in ("NOASSERTION",):
        lic = ""
    tags = set(membership[fn])

    # which recency bucket the repo falls in
    bucket = "older"
    for b, days in sorted(WINDOWS.items(), key=lambda kv: kv[1]):
        if age_days <= days:
            bucket = b
            break

    spd = stars / age_days
    # momentum score: rewards recent star accumulation, damped for tiny/very new repos
    momentum = spd * (1.0 + min(age_days, 30) / 60.0)

    out.append({
        "id": it["id"],
        "full_name": fn,
        "owner": it["owner"]["login"],
        "owner_type": it["owner"]["type"],
        "avatar": it["owner"]["avatar_url"],
        "name": it["name"],
        "url": it["html_url"],
        "homepage": (it.get("homepage") or "").strip(),
        "description": clean_text(it.get("description"), 400),
        "stars": stars,
        "forks": forks,
        "issues": it.get("open_issues_count", 0),
        "watchers": it.get("subscribers_count", 0) or stars,
        "language": it.get("language") or "Other",
        "topics": (it.get("topics") or [])[:12],
        "license": lic,
        "created_at": it["created_at"],
        "pushed_at": it["pushed_at"],
        "updated_at": it["updated_at"],
        "age_days": round(age_days, 1),
        "stars_per_day": round(spd, 2),
        "momentum": round(momentum, 3),
        "bucket": bucket,
        "lists": sorted(tags),
        "default_branch": it.get("default_branch") or "main",
        "size_kb": it.get("size", 0),
        "has_pages": bool(it.get("has_pages")),
        "has_discussions": bool(it.get("has_discussions")),
    })

out.sort(key=lambda r: -r["stars"])
json.dump({
    "generated_at": NOW.isoformat().replace("+00:00", "Z"),
    "source": "GitHub Search API (unauthenticated)",
    "count": len(out),
    "repos": out,
}, open(OUT, "w"), ensure_ascii=False, indent=1)

print(f"merged {len(out)} unique repos -> {OUT}")
by_lang = {}
for r in out:
    by_lang[r["language"]] = by_lang.get(r["language"], 0) + 1
print("top languages:", sorted(by_lang.items(), key=lambda kv: -kv[1])[:12])
print("\nTop 8 by stars:")
for r in out[:8]:
    print(f"  {r['stars']:>7} {r['full_name']:<45} {r['age_days']:>7.0f}d  {r['stars_per_day']:>8.1f}/d")
print("\nTop 8 by stars/day:")
for r in sorted(out, key=lambda r: -r["stars_per_day"])[:8]:
    print(f"  {r['stars']:>7} {r['full_name']:<45} {r['age_days']:>7.0f}d  {r['stars_per_day']:>8.1f}/d  {r['bucket']}")
