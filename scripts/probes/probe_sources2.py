#!/usr/bin/env python3
"""Second probe round: more X mirrors, more vendor feeds, CORS proxies, HTML structure checks."""
import urllib.request, urllib.error, ssl, concurrent.futures as cf, re

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")

TARGETS = [
    # ---- X alternatives ----
    ("xcancel", "https://xcancel.com/sama/rss"),
    ("nitter-poast", "https://nitter.poast.org/sama/rss"),
    ("nitter-priv", "https://nitter.privacydev.net/sama/rss"),
    ("lightbrd", "https://lightbrd.com/sama/rss"),
    ("fxtwitter-user", "https://api.fxtwitter.com/sama"),
    ("vxtwitter-user", "https://api.vxtwitter.com/sama"),
    ("syndication2", "https://syndication.twimg.com/srv/timeline-profile/screen-name/sama"),
    ("twstalker", "https://twstalker.com/sama"),
    ("sotwe", "https://www.sotwe.com/sama"),
    # ---- more vendor sources ----
    ("meta-ai-blog", "https://ai.meta.com/blog/"),
    ("ms-source-ai", "https://news.microsoft.com/source/topics/ai/feed/"),
    ("azure-blog", "https://azure.microsoft.com/en-us/blog/feed/"),
    ("xai-news", "https://x.ai/news"),
    ("elevenlabs", "https://elevenlabs.io/blog/rss.xml"),
    ("runway", "https://runwayml.com/news/rss.xml"),
    ("perplexity", "https://www.perplexity.ai/hub/blog/rss.xml"),
    ("together", "https://www.together.ai/blog/rss.xml"),
    ("groq", "https://groq.com/feed/"),
    ("cursor", "https://cursor.com/blog/rss.xml"),
    ("bytedance-seed", "https://seed.bytedance.com/en/blog"),
    ("zhipu", "https://z.ai/blog"),
    ("moonshot", "https://moonshotai.github.io/"),
    ("minimax", "https://www.minimax.io/news"),
    ("nvidia-research", "https://research.nvidia.com/labs/feed"),
    ("allen-ai", "https://allenai.org/blog/rss.xml"),
    ("stability-rss", "https://stability.ai/news/rss.xml"),
    ("cohere-rss2", "https://cohere.com/blog/feed"),
    ("langchain", "https://blog.langchain.dev/rss/"),
    ("ollama", "https://ollama.com/blog/rss.xml"),
    # ---- CORS proxies (for optional in-browser live refresh) ----
    ("cors-allorigins", "https://api.allorigins.win/raw?url=https://huggingface.co/blog/feed.xml"),
    ("cors-corsproxy", "https://corsproxy.io/?https://huggingface.co/blog/feed.xml"),
    ("cors-codetabs", "https://api.codetabs.com/v1/proxy?quest=https://huggingface.co/blog/feed.xml"),
    ("cors-thingproxy", "https://thingproxy.freeboard.io/fetch/https://huggingface.co/blog/feed.xml"),
]


def probe(item):
    name, url = item
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*",
                                               "Accept-Language": "en-US,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read(400000)
            code, ctype = r.status, r.headers.get("Content-Type", "")
            acao = r.headers.get("Access-Control-Allow-Origin", "-")
    except urllib.error.HTTPError as e:
        return name, e.code, "", "", f"HTTP {e.code}"
    except Exception as e:
        return name, 0, "", "", f"{type(e).__name__}"
    txt = body.decode("utf-8", "replace")
    kind = ("rss" if re.search(r"<(rss|feed|rdf:RDF)", txt[:3000]) else
            "json" if txt.lstrip()[:1] in "{[" else "html")
    n = txt.count("<item") + txt.count("<entry")
    return name, code, f"{kind} items={n} len={len(txt)}", acao, ""


with cf.ThreadPoolExecutor(max_workers=12) as ex:
    for name, code, info, acao, err in ex.map(probe, TARGETS):
        flag = "OK " if code == 200 and not err else "-- "
        print(f"{flag}{name:<18} {code:>3}  {info or err:<36} ACAO={acao}")
