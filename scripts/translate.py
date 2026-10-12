#!/usr/bin/env python3
"""中英对照翻译模块（供其它脚本 import，也可单独跑做自测）。

用的端点是 Chrome 内置翻译同款的公开接口：
  https://clients5.google.com/translate_a/t?client=dict-chrome-ex
特点：免密钥、支持一次请求多条（返回数组与 q 顺序一一对应）、质量好。
另有 MyMemory 作为备用源（带 CORS，质量略逊）。

缓存：data/translate_cache.json，键为 "目标语言:sha1(原文)"，因此每日更新只翻新增内容。
"""
import json, os, re, ssl, hashlib, urllib.request, urllib.error, urllib.parse
import concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_PATH = os.path.join(ROOT, "data", "translate_cache.json")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
CTX = ssl.create_default_context()
GOOGLE = "https://clients5.google.com/translate_a/t"
MYMEMORY = "https://api.mymemory.translated.net/get"

CJK = re.compile(r"[\u4e00-\u9fff]")
CHUNK = 24          # 每个请求带多少条
WORKERS = 6


def has_cjk(text, ratio=0.12):
    """判断是否已是中文内容（中文条目无需翻译）。"""
    if not text:
        return True
    n = len(CJK.findall(text))
    return n >= 3 and n >= len(text) * ratio


# 机器翻译在 AI 领域的常见误译 → 修正为业内通用说法（同时保留英文术语便于学习）
TERM_FIXES = [
    (r"多式联运|多模式(?!块)", "多模态"),
    (r"变压器(?!模型)", "Transformer"),
    (r"量子化", "量化"),
    (r"拥抱脸", "Hugging Face"),
    (r"快速工程", "提示工程"),
    (r"及时工程", "提示工程"),
    (r"令牌", "Token"),
    (r"代币", "Token"),
    (r"语境窗口|上下文长度", "上下文窗口"),
    (r"检索增强生成", "检索增强生成（RAG）"),
    (r"思维链", "思维链（CoT）"),
    (r"人类反馈强化学习", "基于人类反馈的强化学习（RLHF）"),
    (r"专家混合(?:模型)?", "混合专家（MoE）"),
    (r"扩散模型", "扩散模型"),
    (r"大语言模型", "大语言模型（LLM）"),
    (r"\bGPT\b", "GPT"),
    (r"智能代理", "智能体（Agent）"),
    (r"线束|线束框架|测试框架", "Harness"),
    (r"(深度|分布式|自主|多|无服务器|托管|智能|AI|模型|编码)代理", r"\1智能体"),
    (r"代理(?=大型|语言|系统|框架|工作流|工具|能力|记忆|集群|编排)", "智能体"),
    (r"代理式", "智能体式"),
    (r"代理工作流", "智能体工作流"),
    (r"子代理", "子智能体"),
    (r"代理记忆|代理内存", "智能体记忆"),
    (r"基准套件|基准测试套件", "基准测试集"),
    (r"上下文引擎", "上下文工程"),
    (r"自主代理", "自主智能体"),
    (r"代理(?:模型|框架|工作流)", "智能体"),
    (r"零样本", "零样本（zero-shot）"),
    (r"少样本", "少样本（few-shot）"),
    (r"微调", "微调（fine-tuning）"),
    (r"基准测试", "基准测试"),
    (r"幻觉", "幻觉（hallucination）"),
    (r"对齐(?!了|到)", "对齐（alignment）"),
    (r"推理成本", "推理（inference）成本"),
    (r"护栏", "护栏（guardrails）"),
    (r"红队(?:测试|演练)?", "红队测试（red teaming）"),
    (r"越狱", "越狱（jailbreak）"),
    (r"水印", "水印（watermark）"),
    (r"缩放定律|扩展定律", "规模定律（scaling law）"),
    (r"算力", "算力"),
    (r"数据中心", "数据中心"),
    (r"开源权重", "开放权重（open weights）"),
    (r"开源模型", "开源模型"),
    (r"函数调用", "函数调用（function calling）"),
    (r"工具使用", "工具调用（tool use）"),
    (r"上下文工程", "上下文工程（context engineering）"),
]


def apply_term_fixes(text):
    """把机器翻译的常见误译改成业内通用说法。"""
    if not text:
        return text
    for pat, rep in TERM_FIXES:
        text = re.sub(pat, rep, text)
    # 去掉重复的括号注释，例如“（RLHF）（RLHF）”“（alignment）（alignment）”
    text = re.sub(r"（([^）]{1,24})）（\1）", r"（\1）", text)
    text = re.sub(r"（([^）]{1,24})）\s*（\1）", r"（\1）", text)
    text = re.sub(r"智能体（Agent）智能体", "智能体（Agent）", text)
    return text


def _key(text, target):
    return target + ":" + hashlib.sha1(text.encode("utf-8")).hexdigest()


class Translator:
    def __init__(self, cache_path=CACHE_PATH):
        self.cache_path = cache_path
        self.cache = {}
        if os.path.exists(cache_path):
            try:
                self.cache = json.load(open(cache_path, encoding="utf-8"))
            except Exception:
                self.cache = {}
        self.hits = 0
        self.new = 0
        self.failed = 0

    # ---------- 底层请求 ----------
    def _google(self, batch, target):
        # 注意：sl=auto 时返回形如 [["译文","en"], ...]，语言码会被拼进译文，故固定 sl=en
        params = [("client", "dict-chrome-ex"), ("sl", "en"), ("tl", target)]
        params += [("q", t) for t in batch]
        url = GOOGLE + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        out = data if isinstance(data, list) else [data]
        # 形如 [["译文","en"], ...] 或 ["译文", ...] 都拍平成译文数组
        flat = []
        for x in out:
            if isinstance(x, list):
                first = next((str(i) for i in x if isinstance(i, str) and i.strip()), "")
                flat.append(first)
            else:
                flat.append(str(x))
        # 去掉偶发附在行尾的语言码（如 "...结论en"）
        flat = [re.sub(r"(?<=[\u4e00-\u9fff\s])([a-z]{2})$", "", v) if CJK.search(v) else v for v in flat]
        return flat

    def _mymemory(self, text, target):
        lang = "en|" + ("zh-CN" if target.startswith("zh") else target)
        url = MYMEMORY + "?" + urllib.parse.urlencode({"q": text[:480], "langpair": lang})
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
            d = json.loads(r.read().decode("utf-8", "replace"))
        out = (d.get("responseData") or {}).get("translatedText") or ""
        return "" if out.strip().upper().startswith("MYMEMORY WARNING") else out

    def _one(self, text, target):
        """单条兜底：先 Google，失败再 MyMemory。"""
        try:
            res = self._google([text], target)
            if res and res[0].strip():
                return res[0]
        except Exception:
            pass
        try:
            return self._mymemory(text, target)
        except Exception:
            return ""

    # ---------- 对外接口 ----------
    def translate_many(self, texts, target="zh-CN", progress=None):
        """返回与 texts 等长的译文列表；翻译失败的条目返回空串。"""
        results = [""] * len(texts)
        pending = []
        for i, t in enumerate(texts):
            if not t or not t.strip() or has_cjk(t):
                results[i] = t if (t and has_cjk(t)) else ""
                self.hits += 1
                continue
            k = _key(t, target)
            if k in self.cache:
                results[i] = self.cache[k]
                self.hits += 1
            else:
                pending.append((i, t, k))

        if not pending:
            return results

        batches = [pending[i:i + CHUNK] for i in range(0, len(pending), CHUNK)]
        done = 0
        with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futures = {ex.submit(self._google, [t for _, t, _ in b], target): b for b in batches}
            for fut in cf.as_completed(futures):
                b = futures[fut]
                try:
                    out = fut.result()
                except Exception:
                    out = []
                if len(out) != len(b):                      # 条数不匹配 → 逐条兜底
                    out = [self._one(t, target) for _, t, _ in b]
                for (i, src, k), tr in zip(b, out):
                    tr = (tr or "").strip()
                    if tr:
                        results[i] = tr
                        self.cache[k] = tr
                        self.new += 1
                    else:
                        # 单条再试一次，仍失败就记空
                        tr2 = self._one(src, target).strip()
                        if tr2:
                            results[i] = tr2
                            self.cache[k] = tr2
                            self.new += 1
                        else:
                            results[i] = ""
                            self.failed += 1
                done += len(b)
                if progress:
                    progress(done, len(pending))
        return results

    def save(self):
        tmp = self.cache_path + ".tmp"
        json.dump(self.cache, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
        os.replace(tmp, self.cache_path)

    def stats(self):
        return f"命中缓存 {self.hits} · 新翻译 {self.new} · 失败 {self.failed}"


if __name__ == "__main__":
    t = Translator()
    samples = [
        "OpenAI releases a new reasoning model with better tool use",
        "Impactful scheduling for GPU clusters",
        "无问芯穹完成 23 亿元 C 轮融资",
        "Quantization-aware distillation cuts inference cost by 40%",
        "",
    ]
    out = t.translate_many(samples)
    for a, b in zip(samples, out):
        print(f"  EN: {a or '(空)'}\n  ZH: {b or '(未翻译)'}")
    t.save()
    print(t.stats())
