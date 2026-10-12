#!/usr/bin/env python3
"""fetch_x.py 推文解析的单元测试。

背景：syndication 页面的内嵌 JSON 里既有用户对象（id_str 只有几位数字），
也有推文对象（id_str 是 15~20 位雪花 ID）。早期版本用正则跨对象匹配，
导致「正文是真的、ID 却是用户 ID」——点开就是死链。这里固定住正确行为。
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_x as FX

fails = []


def check(name, cond, extra=""):
    print(("  ✅ " if cond else "  ❌ ") + name + ("  " + extra if extra else ""))
    if not cond:
        fails.append(name)


HANDLE = "sama"
OTHER_TWEET_ID = "1899999999999999999"
MY_TWEET_1 = "1879650942410481000"   # 较早
MY_TWEET_2 = "1879650942410481666"   # 较新（雪花 ID 更大）

# 模拟真实结构：user 对象的 id_str 是短 ID，推文对象是长 ID
PAYLOAD = {
    "props": {
        "pageProps": {
            "timeline": {
                "entries": [
                    {"content": {"tweet": {
                        "id_str": MY_TWEET_2,
                        "full_text": "second tweet by sama https://t.co/abc",
                        "created_at": "2026-10-08T10:00:00.000Z",
                        "favorite_count": 1234,
                        "user": {"id_str": "1605", "screen_name": "sama"},
                    }}},
                    {"content": {"tweet": {
                        "id_str": OTHER_TWEET_ID,
                        "full_text": "someone else posting about AI",
                        "user": {"id_str": "44196397", "screen_name": "elonmusk"},
                    }}},
                    {"content": {"tweet": {
                        "id_str": MY_TWEET_1,
                        "full_text": "first tweet by sama\nwith a newline",
                        "created_at": "2026-09-01T10:00:00.000Z",
                        "favorite_count": 999,
                        "user": {"id_str": "1605", "screen_name": "sama"},
                    }}},
                    {"content": {"tweet": {
                        "id_str": "1605",                      # 用户 ID，必须被过滤
                        "full_text": "not a tweet",
                        "user": {"id_str": "1605", "screen_name": "sama"},
                    }}},
                ]
            }
        }
    }
}

print("[1] 内嵌 JSON 解析（高置信度路径）")
tweets = FX.tweets_from_json(PAYLOAD, HANDLE)
check("只保留本人推文", len(tweets) == 2, f"{len(tweets)} 条")
check("按新→旧排序", [t["id"] for t in tweets] == [MY_TWEET_2, MY_TWEET_1])
check("短 ID（用户 ID）被过滤", all(FX.plausible_tweet_id(t["id"]) for t in tweets))
check("链接使用推文 ID 而非用户 ID",
      tweets[0]["url"] == f"https://x.com/{HANDLE}/status/{MY_TWEET_2}", tweets[0]["url"])
check("正文清洗（去掉 t.co、合并换行）",
      "https://t.co" not in tweets[1]["text"] and "\n" not in tweets[1]["text"], repr(tweets[1]["text"]))
check("带上了点赞数与时间", tweets[0]["likes"] == 1234 and tweets[0]["created_at"].startswith("2026-10-08"))

print("\n[2] 载荷缺少作者信息时必须标记待核对")
NO_AUTHOR = {"x": {"tweet": {"id_str": MY_TWEET_1, "full_text": "unattributed text",
                             "user": {"id_str": "1605"}}}}
t2 = FX.tweets_from_json(NO_AUTHOR, HANDLE)
check("无作者字段 → 标记 needs_verify", len(t2) == 1 and t2[0].get("needs_verify") is True)
WITH_AUTHOR = {"x": {"tweet": {"id_str": MY_TWEET_1, "full_text": "attributed",
                               "user": {"id_str": "1605", "screen_name": "sama"}}}}
t3 = FX.tweets_from_json(WITH_AUTHOR, HANDLE)
check("有作者且一致 → 无需核对", len(t3) == 1 and not t3[0].get("needs_verify"))

print("\n[3] 内嵌 JSON 提取")
html_doc = '<html><script id="__NEXT_DATA__" type="application/json">' + json.dumps(PAYLOAD) + '</script></html>'
doc = FX.extract_embedded_json(html_doc)
check("能从 __NEXT_DATA__ 取到 JSON", isinstance(doc, dict) and "props" in doc)
raw = 'xxx {"a":{"id_str":"1605","full_text":"hi"}} yyy'
check("无 __NEXT_DATA__ 时能括号配对兜底", FX.extract_embedded_json(raw) == {"a": {"id_str": "1605", "full_text": "hi"}})

print("\n[4] 正则兜底路径（只取候选，且必须 15 位以上 ID）")
legacy = ('{"id_str":"1605","screen_name":"sama","full_text":"user object junk"}'
          '{"id_str":"%s","screen_name":"sama","full_text":"real tweet body"}' % MY_TWEET_1)
cands = FX.parse_regex_candidates(legacy, HANDLE)
check("候选里没有短 ID", all(FX.plausible_tweet_id(c["id"]) for c in cands), f"{[c['id'] for c in cands]}")
check("候选 ID 正确", len(cands) == 1 and cands[0]["id"] == MY_TWEET_1)

print("\n[5] 核对函数：拿不准就丢弃（避免死链）")
FX.fetch = lambda url, timeout=20, headers=None: (200, json.dumps({"tweet": {
    "id": MY_TWEET_1, "text": "verified", "url": f"https://x.com/{HANDLE}/status/{MY_TWEET_1}",
    "author": {"screen_name": "sama"}, "likes": 5}}).encode())
v = FX.verify_tweet(HANDLE, {"id": MY_TWEET_1, "text": "x", "url": "u"})
check("作者一致则通过", v is not None and v["text"] == "verified")

FX.fetch = lambda url, timeout=20, headers=None: (200, json.dumps({"tweet": {
    "id": MY_TWEET_1, "text": "someone else", "author": {"screen_name": "elonmusk"}}}).encode())
check("作者不一致则丢弃", FX.verify_tweet(HANDLE, {"id": MY_TWEET_1, "text": "x", "url": "u"}) is None)

def boom(url, timeout=20, headers=None):
    raise OSError("network down")
FX.fetch = boom
check("接口不可用则丢弃", FX.verify_tweet(HANDLE, {"id": MY_TWEET_1, "text": "x", "url": "u"}) is None)

print("\n" + ("🎉 全部通过" if not fails else f"⚠️ 失败 {len(fails)} 项: {fails}"))
sys.exit(1 if fails else 0)
