#!/usr/bin/env python3
"""给三个数据文件补上中文字段（中英对照用）。

  data/ai_news.json   → title_zh / summary_zh
  data/repos.json     → description_zh
  data/x_leaders.json → bio_zh

已是中文的内容原样保留；译文走 data/translate_cache.json 缓存，因此每日更新只翻新增条目。
"""
import json, os, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from translate import Translator, has_cjk, apply_term_fixes   # noqa: E402

DATA = os.path.join(ROOT, "data")


def load(name, default=None):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        return default
    return json.load(open(p, encoding="utf-8"))


def save(name, obj):
    p = os.path.join(DATA, name)
    json.dump(obj, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def main():
    t0 = time.time()
    tr = Translator()

    # ---------- 1) AI 动态 ----------
    news = load("ai_news.json")
    if news:
        items = news["items"]
        titles = [(i.get("title") or "") for i in items]
        sums = [(i.get("summary") or "") for i in items]
        print(f"[1/3] AI 动态：{len(items)} 条（标题 + 摘要）…", flush=True)
        zh_titles = [apply_term_fixes(x) for x in tr.translate_many(titles)]
        zh_sums = [apply_term_fixes(x) for x in tr.translate_many(sums)]
        n_t = n_s = 0
        for it, zt, zs in zip(items, zh_titles, zh_sums):
            if zt and not has_cjk(it.get("title") or ""):
                it["title_zh"] = zt
                n_t += 1
            if zs and (it.get("summary") or "") and not has_cjk(it["summary"]):
                it["summary_zh"] = zs
                n_s += 1
        save("ai_news.json", news)
        print(f"      标题译出 {n_t} 条 · 摘要译出 {n_s} 条")

    # ---------- 2) GitHub 项目描述 ----------
    repos = load("repos.json")
    if repos:
        rs = repos["repos"]
        print(f"[2/3] GitHub 项目：{len(rs)} 个描述…", flush=True)
        zh = [apply_term_fixes(x) for x in tr.translate_many([(r.get("description") or "") for r in rs])]
        n = 0
        for r, z in zip(rs, zh):
            if z and (r.get("description") or "") and not has_cjk(r["description"]):
                r["description_zh"] = z
                n += 1
        save("repos.json", repos)
        print(f"      译出 {n} 个")

    # ---------- 3) X 人物简介 ----------
    lead = load("x_leaders.json")
    if lead:
        ls = lead["leaders"]
        print(f"[3/3] X 账号：{len(ls)} 条简介…", flush=True)
        zh = [apply_term_fixes(x) for x in tr.translate_many([(l.get("bio") or "") for l in ls])]
        n = 0
        for l, z in zip(ls, zh):
            if z and (l.get("bio") or "") and not has_cjk(l["bio"]):
                l["bio_zh"] = z
                n += 1
        save("x_leaders.json", lead)
        print(f"      译出 {n} 条")

    tr.save()
    print(f"\n完成（{time.time()-t0:.1f}s）：{tr.stats()}")


if __name__ == "__main__":
    main()
