#!/usr/bin/env python3
"""抓取 X（Twitter）领军人物的公开资料，并尽力快照最新推文。

现实约束（已在多台环境验证）：
  * X 官方 API 需付费鉴权；
  * nitter / rsshub 等镜像在本机网络不可达；
  * syndication 时间线接口按 IP 限流（429）。

因此本脚本：
  1. 用 api.fxtwitter.com/<handle>（公开、带 CORS）抓取账号资料：头像、粉丝数、简介、认证状态；
  2. 尝试 syndication 接口快照最近推文，成功就写入 tweets，失败则记录原因；
  3. 页面端在浏览器里按需载入官方时间线（iframe），作为拿不到正文时的替代路径。

每条人物还带 keywords，供页面把 ai_news 里提到该人物的报道关联出来。
"""
import json, os, re, ssl, html, datetime, urllib.request, urllib.error
import concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "x_leaders.json")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
CTX = ssl.create_default_context()

# handle, 姓名, 身份/机构, 关联关键词（用于匹配新闻）, 类型（person=人物 / org=机构官方）
LEADERS = [
    ("sama",           "Sam Altman",        "OpenAI 联合创始人 / CEO",      ["OpenAI", "Sam Altman", "Altman"], "person"),
    ("elonmusk",       "Elon Musk",         "xAI / Tesla / X",             ["xAI", "Grok", "Elon Musk", "Musk", "Tesla", "Neuralink", "SpaceX"], "person"),
    ("demishassabis",  "Demis Hassabis",    "Google DeepMind 联合创始人 / CEO", ["DeepMind", "Demis Hassabis", "Hassabis", "Gemini"], "person"),
    ("DarioAmodei",    "Dario Amodei",      "Anthropic 联合创始人 / CEO",   ["Anthropic", "Dario Amodei", "Amodei", "Claude"], "person"),
    ("karpathy",       "Andrej Karpathy",   "Eureka Labs 创始人 · 前 Tesla AI 总监", ["Karpathy", "Eureka Labs"], "person"),
    ("ylecun",         "Yann LeCun",        "Meta 首席 AI 科学家",          ["LeCun", "Meta AI", "FAIR", "Llama"], "person"),
    ("JeffDean",       "Jeff Dean",         "Google 首席科学家",            ["Jeff Dean", "Google Research", "Gemini"], "person"),
    ("DrJimFan",       "Jim Fan",           "NVIDIA 机器人 / 具身智能研究",  ["NVIDIA", "Jim Fan", "机器人", "robotics", "embodied"], "person"),
    ("AndrewYNg",      "Andrew Ng",         "DeepLearning.AI 创始人",       ["Andrew Ng", "吴恩达", "DeepLearning.AI", "Coursera"], "person"),
    ("fchollet",       "François Chollet",  "Keras 作者 / ARC-AGI",         ["Chollet", "Keras", "ARC-AGI"], "person"),
    ("drfeifei",       "Fei-Fei Li",        "斯坦福 HAI 联合主任 / World Labs", ["Fei-Fei Li", "李飞飞", "World Labs", "斯坦福"], "person"),
    ("sundarpichai",   "Sundar Pichai",     "Google / Alphabet CEO",        ["Sundar Pichai", "Pichai", "Google", "Gemini"], "person"),
    ("satyanadella",   "Satya Nadella",     "Microsoft CEO",                ["Satya Nadella", "Nadella", "Microsoft", "Copilot"], "person"),
    ("mustafasuleyman","Mustafa Suleyman",  "Microsoft AI CEO",             ["Mustafa Suleyman", "Suleyman", "Microsoft AI", "Copilot"], "person"),
    ("ClementDelangue","Clément Delangue",  "Hugging Face 联合创始人 / CEO", ["Hugging Face", "Delangue"], "person"),
    ("arthurmensch",   "Arthur Mensch",     "Mistral AI 联合创始人 / CEO",  ["Mistral", "Arthur Mensch", "Mensch"], "person"),
    ("AravSrinivas",   "Aravind Srinivas",  "Perplexity CEO",               ["Perplexity", "Aravind"], "person"),
    ("alexalbert__",   "Alex Albert",       "Anthropic 开发者关系",          ["Anthropic", "Claude"], "person"),
    ("simonw",         "Simon Willison",    "Django 联合创始人 · LLM 观察者", ["Simon Willison", "Datasette"], "person"),
    ("emollick",       "Ethan Mollick",     "Wharton 教授 · AI 应用研究",    ["Ethan Mollick", "Mollick", "Wharton"], "person"),
    ("rowancheung",    "Rowan Cheung",      "The Rundown AI 创始人",        ["Rowan Cheung", "Rundown"], "person"),
    ("swyx",           "Shawn Wang (swyx)", "AI Engineer / Latent Space",   ["swyx", "Latent Space", "AI Engineer"], "person"),
    # ---- 厂商 / 机构官方账号 ----
    ("OpenAI",         "OpenAI",            "OpenAI 官方账号",              ["OpenAI", "GPT", "Sora"], "org"),
    ("AnthropicAI",    "Anthropic",         "Anthropic 官方账号",           ["Anthropic", "Claude"], "org"),
    ("GoogleDeepMind", "Google DeepMind",   "Google DeepMind 官方账号",     ["DeepMind", "Gemini", "AlphaFold"], "org"),
    ("AIatMeta",       "AI at Meta",        "Meta AI 官方账号",             ["Meta AI", "Llama", "FAIR"], "org"),
    ("deepseek_ai",    "DeepSeek",          "DeepSeek 官方账号",            ["DeepSeek", "深度求索"], "org"),
    ("Alibaba_Qwen",   "Qwen",              "阿里通义千问官方账号",          ["Qwen", "通义", "阿里"], "org"),
    ("Kimi_Moonshot",  "Kimi",              "月之暗面 Kimi 官方账号",        ["Kimi", "月之暗面", "Moonshot"], "org"),
    ("MiniMax_AI",     "MiniMax",           "MiniMax 官方账号",             ["MiniMax", "海螺", "MiniMax"], "org"),
    ("MistralAI",      "Mistral AI",        "Mistral AI 官方账号",          ["Mistral"], "org"),
    ("huggingface",    "Hugging Face",      "Hugging Face 官方账号",        ["Hugging Face", "HF"], "org"),
    ("nvidia",         "NVIDIA",            "NVIDIA 官方账号",              ["NVIDIA", "英伟达", "GPU", "CUDA"], "org"),
    ("perplexity_ai",  "Perplexity",        "Perplexity 官方账号",          ["Perplexity"], "org"),
    ("ollama",         "Ollama",            "Ollama 官方账号",              ["Ollama"], "org"),
    ("Cursor_ai",      "Cursor",            "Cursor 官方账号",              ["Cursor", "AI 编辑器"], "org"),
]


def fetch(url, timeout=20, headers=None):
    h = {"User-Agent": UA, "Accept": "application/json, text/html, */*",
         "Accept-Language": "en-US,en;q=0.9"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, r.read(1200000)


def get_profile(handle):
    """公开资料接口，无需鉴权。"""
    code, body = fetch(f"https://api.fxtwitter.com/{handle}")
    data = json.loads(body.decode("utf-8", "replace"))
    user = data.get("user") or {}
    if not user.get("screen_name"):
        raise RuntimeError("no user payload")
    return {
        "handle": user.get("screen_name") or handle,
        "name": user.get("name") or handle,
        "avatar": (user.get("avatar_url") or "").replace("_normal", "_200x200"),
        "banner": user.get("banner_url") or "",
        "bio": re.sub(r"\s+", " ", user.get("description") or "").strip()[:240],
        "followers": user.get("followers") or 0,
        "following": user.get("following") or 0,
        "tweets_count": user.get("tweets") or 0,
        "joined": user.get("joined") or "",
        "location": user.get("location") or "",
        "url": user.get("url") or f"https://x.com/{handle}",
        "website": ((user.get("website") or {}) or {}).get("url") or "",
    }


TWEET_RE = re.compile(r'"full_text":"((?:[^"\\]|\\.)*)"')


def iter_tweet_objects(obj):
    """遍历内嵌 JSON，找出同时带 id_str 与 full_text 的“推文对象”。"""
    if isinstance(obj, dict):
        if "full_text" in obj and "id_str" in obj:
            yield obj
        for v in obj.values():
            yield from iter_tweet_objects(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from iter_tweet_objects(v)


def extract_embedded_json(txt):
    """取出 syndication 页面里内嵌的 JSON（__NEXT_DATA__ 或首个大对象）。"""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', txt, re.S)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    start = txt.find('{"')
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, min(len(txt), start + 3000000)):
        c = txt[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(txt[start:i + 1])
                    except Exception:
                        return None
    return None


def clean_tweet_text(t):
    t = html.unescape(t or "")
    t = re.sub(r"https://t\.co/\w+", "", t)
    return re.sub(r"\s+", " ", t).strip()


def plausible_tweet_id(tid):
    """推文 ID 为 15~20 位纯数字；用户 ID（如 1605、25073877）会被过滤掉。"""
    return bool(re.fullmatch(r"\d{15,20}", str(tid or "")))


def tweets_from_json(doc, handle):
    """高置信度解析：每个对象自带 id_str / full_text / user，不会张冠李戴。"""
    out, seen = [], set()
    for tw in iter_tweet_objects(doc):
        tid = str(tw.get("id_str") or "")
        text = clean_tweet_text(tw.get("full_text"))
        author = ((tw.get("user") or {}).get("screen_name") or "").lower()
        if not plausible_tweet_id(tid) or not text or tid in seen:
            continue
        if author and author != handle.lower():
            continue                       # 必须是本人发布，排除转发/推荐里的他人推文
        if text.startswith("RT @"):
            continue
        seen.add(tid)
        out.append({
            "needs_verify": not author,    # 载荷里没写作者时，展示前必须先核对
            "id": tid,
            "text": text[:400],
            "url": f"https://x.com/{handle}/status/{tid}",
            "created_at": tw.get("created_at") or "",
            "likes": tw.get("favorite_count") or 0,
            "replies": tw.get("reply_count") or 0,
            "retweets": tw.get("retweet_count") or 0,
        })
    out.sort(key=lambda x: -int(x["id"]))          # 雪花 ID 越大越新
    return out[:8]


def verify_tweet(handle, tweet):
    """低置信度路径的兜底：向公开接口核对推文确实存在且属于该账号，核对不了就不展示。"""
    try:
        code, body = fetch(f"https://api.fxtwitter.com/{handle}/status/{tweet['id']}")
        data = json.loads(body.decode("utf-8", "replace"))
        tw = data.get("tweet") or {}
        author = ((tw.get("author") or {}).get("screen_name") or "").lower()
        if not tw.get("id") or (author and author != handle.lower()):
            return None
        return {
            "id": str(tw.get("id")),
            "text": clean_tweet_text(tw.get("text"))[:400] or tweet["text"],
            "url": tw.get("url") or tweet["url"],
            "created_at": tw.get("created_at") or "",
            "likes": tw.get("likes") or 0,
            "replies": tw.get("replies") or 0,
            "retweets": tw.get("retweets") or 0,
        }
    except Exception:
        return None


def parse_regex_candidates(txt, handle):
    """兜底路径：正则只取候选（ID 必须 15 位以上），随后逐条核对。"""
    candidates, seen = [], set()
    for m in TWEET_RE.finditer(txt):
        raw = m.group(1)
        try:
            text = json.loads('"' + raw + '"')
        except Exception:
            text = raw.replace('\\n', ' ').replace('\\"', '"')
        text = clean_tweet_text(text)
        before = txt[max(0, m.start() - 4000):m.start()]
        author_m = re.findall(r'"screen_name"\s*:\s*"([A-Za-z0-9_]+)"', before)
        if author_m and author_m[-1].lower() != handle.lower():
            continue
        ids = re.findall(r'"id_str"\s*:\s*"(\d{15,20})"', before)
        if not ids or not text or text.startswith("RT @"):
            continue
        tid = ids[-1]
        if tid in seen:
            continue
        seen.add(tid)
        candidates.append({"id": tid, "text": text[:400], "url": f"https://x.com/{handle}/status/{tid}"})
    return candidates[:8]


def try_timeline(handle):
    """尽力快照时间线；被限流/网络策略拦截时返回 (None, 原因)。"""
    attempts = [
        ("syndication", f"https://cdn.syndication.twimg.com/timeline/profile?screen_name={handle}"
                        "&tweet_limit=12&with_replies=false&with_tweets=true&dnt=true"),
        ("srv", f"https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}?showReplies=false"),
    ]
    last = ""
    for kind, url in attempts:
        try:
            code, body = fetch(url, timeout=18, headers={"Referer": "https://platform.twitter.com/"})
        except urllib.error.HTTPError as e:
            last = f"{kind}: HTTP {e.code}"
            continue
        except Exception as e:  # noqa: BLE001
            last = f"{kind}: {type(e).__name__}"
            continue
        if code != 200 or not body:
            last = f"{kind}: empty({code})"
            continue
        txt = body.decode("utf-8", "replace")
        if len(txt) < 500:
            last = f"{kind}: 被限流或返回过短({len(txt)})"
            continue

        doc = extract_embedded_json(txt)
        if doc is not None:
            tweets = tweets_from_json(doc, handle)
            if any(t.get("needs_verify") for t in tweets):
                kept = []
                for t in tweets:
                    if not t.get("needs_verify"):
                        kept.append(t)
                        continue
                    v = verify_tweet(handle, t)
                    if v:
                        kept.append(v)
                tweets = kept
            if tweets:
                return tweets, ""

        verified = []
        for c in parse_regex_candidates(txt, handle):
            v = verify_tweet(handle, c)
            if v:
                verified.append(v)
        if verified:
            verified.sort(key=lambda x: -int(x["id"]))
            return verified[:8], ""

        last = f"{kind}: 未解析到可信推文(len={len(txt)})"
    return None, last


def collect(leader):
    handle, name, role, keywords, kind = leader
    row = {"handle": handle, "name": name, "role": role, "keywords": keywords, "kind": kind}
    err = ""
    try:
        row.update(get_profile(handle))
        row["profile_ok"] = True
    except Exception as e:  # noqa: BLE001
        row["profile_ok"] = False
        err = f"资料抓取失败: {type(e).__name__}"
    tweets, why = try_timeline(handle)
    row["tweets"] = tweets or []
    row["tweets_source"] = "snapshot" if tweets else ""
    row["note"] = why if not tweets else ""
    row["error"] = err
    return row


def main():
    print(f"抓取 {len(LEADERS)} 位 X 领军人物的公开资料…")
    rows = []
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for row in ex.map(collect, LEADERS):
            rows.append(row)
            flag = "OK" if row.get("profile_ok") else "--"
            n = len(row["tweets"])
            print(f"  {flag} @{row['handle']:<16} 粉丝={row.get('followers', 0):>9,}  推文快照={n}"
                  + (f"  ({row['note'][:60]})" if not n and row.get("note") else ""))

    ok = sum(1 for r in rows if r.get("profile_ok"))
    snaps = sum(1 for r in rows if r["tweets"])
    persons = sum(1 for r in rows if r.get("kind") == "person")
    orgs = sum(1 for r in rows if r.get("kind") == "org")
    payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "count": len(rows),
        "profile_ok": ok,
        "with_tweets": snaps,
        "persons": persons,
        "orgs": orgs,
        "note": ("X 未提供公开时间线 API，且镜像站点多不可达；推文正文可在页面内按需载入官方时间线。"
                 if snaps == 0 else "部分账号已快照到推文正文。"),
        "leaders": sorted(rows, key=lambda r: -r.get("followers", 0)),
    }
    json.dump(payload, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"\n完成：{ok}/{len(rows)} 个账号资料可用（人物 {persons} / 机构 {orgs}），{snaps} 位含推文快照 -> {OUT}")
    if snaps == 0:
        print("  ⚠️ 未取到推文正文（本机 IP 被 X 限流）：页面会提供“载入官方时间线”与“打开主页”入口。")


if __name__ == "__main__":
    main()
