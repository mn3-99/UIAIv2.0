#!/usr/bin/env python3
"""اختبار نماذج الصور — 5 صور حقيقية لكل نموذج. من لا ينجح في الخمس كلها يُستبعد.
القواعد: تحميل فعلي لكل صورة والتحقق من كونها صورة حقيقية (حجم/نوع)."""
import json
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

ZEN_KEY = open("/home/ubuntu/UIAIv2.0/providers/.alibaba_zen_key").read().strip()
ZEN_BASE = "https://ws-kypx0fmfdbfb9ho5.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"

PROMPTS = [
    "a simple blue circle logo on white background",
    "a red apple on a wooden table, studio photo",
    "cartoon cat wearing sunglasses, flat illustration",
    "sunset over mountains, digital painting",
    "isometric rocket ship icon, pastel colors",
]

CANDIDATES = [
    "zen:qwen-image-3.0-pro",
    "zen:qwen-image-3.0",
    "zen:qwen-image-2.0-pro",
    "zen:qwen-image-2.0",
    "zen:wan2.7-image-pro",
    "zen:wan2.7-image",
    "zen:z-image-turbo",
    "zen:qwen-image-max",
    "zen:qwen-image-plus",
    "pollinations:sana",
]

def fetch_url_bytes(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        ct = r.headers.get("Content-Type", "")
        data = r.read()
        return ct, len(data)

def gen_zen(model, prompt):
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        "stream": False,
    }).encode()
    req = urllib.request.Request(ZEN_BASE, data=body, headers={
        "Authorization": f"Bearer {ZEN_KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read().decode())
    if d.get("code"):
        raise RuntimeError(f"zen error: {d.get('code')} {d.get('message','')[:100]}")
    parts = (((d.get("output") or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or []
    img_url = next((p.get("image") for p in parts if isinstance(p, dict) and p.get("image")), None)
    if not img_url:
        raise RuntimeError("no image in response")
    ct, size = fetch_url_bytes(img_url)
    return ct.startswith("image") and size > 10000, size

def gen_pollinations(model, prompt):
    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?model={model}&width=512&height=512&nologo=true&seed={int(time.time())}"
    ct, size = fetch_url_bytes(url, timeout=120)
    return ct.startswith("image") and size > 3000, size

def test_model(candidate):
    provider, model = candidate.split(":", 1)
    results = []
    for i, prompt in enumerate(PROMPTS):
        t0 = time.time()
        try:
            if provider == "zen":
                ok, size = gen_zen(model, prompt)
            else:
                ok, size = gen_pollinations(model, prompt)
            dt = time.time() - t0
            results.append({"round": i + 1, "ok": bool(ok), "ms": round(dt * 1000), "size": size})
            print(f"  [{candidate}] img {i+1}/5: {'✅' if ok else '❌'} {dt:.1f}s {size}b", flush=True)
        except Exception as e:
            dt = time.time() - t0
            results.append({"round": i + 1, "ok": False, "ms": round(dt * 1000), "error": str(e)[:120]})
            print(f"  [{candidate}] img {i+1}/5: ❌ {str(e)[:100]}", flush=True)
    passed = sum(1 for r in results if r["ok"])
    times = [r["ms"] for r in results if r["ok"]]
    return {
        "model": candidate,
        "passed": passed,
        "total": len(PROMPTS),
        "all_pass": passed == len(PROMPTS),
        "avg_s": round(sum(times) / len(times) / 1000, 1) if times else None,
        "results": results,
    }

print("=" * 60)
print("اختبار نماذج الصور — 5 صور لكل نموذج |", time.strftime("%H:%M:%S"))
print("=" * 60, flush=True)

out = []
RESULTS_JSONL = "/home/ubuntu/UIAIv2.0/tests/image_models_results.jsonl"
open(RESULTS_JSONL, "w").close()  # بداية نظيفة
with ThreadPoolExecutor(max_workers=3) as ex:
    for res in ex.map(test_model, CANDIDATES):
        out.append(res)
        # كتابة تزايدية فورية — النتائج الجزئية تنجو من أي انقطاع
        with open(RESULTS_JSONL, "a", encoding="utf-8") as f:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
        print(f"==> {res['model']}: {res['passed']}/5 {'✅ مقبول' if res['all_pass'] else '❌ مستبعد'}", flush=True)

accepted = [r for r in out if r["all_pass"]]
rejected = [r for r in out if not r["all_pass"]]
print()
print("=" * 60)
print(f"مقبول: {len(accepted)} | مستبعد: {len(rejected)}")
for r in out:
    print(f"  {r['model']:28s} {r['passed']}/5  avg={r['avg_s']}s")
with open("/home/ubuntu/UIAIv2.0/tests/image_models_test.json", "w", encoding="utf-8") as f:
    json.dump({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "results": out}, f, ensure_ascii=False, indent=1)
print("حُفظت النتائج في tests/image_models_test.json")
