#!/usr/bin/env python3
"""Stress Test — اختبار ضغط حقيقي لمكونات UIAIv2.0 (مهارات/إضافات/طابور).
يقيس زمن الاستجابة ونسبة النجاح لكل مكوّن عبر عدة جولات، ويكتب النتائج JSON."""
import json
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = "http://127.0.0.1:8082"
RESULTS = []

def timed_call(name, fn, rounds=3):
    latencies, fails = [], 0
    for i in range(rounds):
        t0 = time.time()
        try:
            ok = fn(i)
            dt = (time.time() - t0) * 1000
            if ok:
                latencies.append(dt)
            else:
                fails += 1
        except Exception as e:
            fails += 1
            print(f"   [{name}] round {i+1} exception: {e}")
    avg = sum(latencies) / len(latencies) if latencies else 0
    success = len(latencies)
    RESULTS.append({
        "component": name,
        "rounds": rounds,
        "success": success,
        "failed": fails,
        "success_rate": f"{success/rounds*100:.0f}%",
        "avg_ms": round(avg, 1),
        "min_ms": round(min(latencies), 1) if latencies else None,
        "max_ms": round(max(latencies), 1) if latencies else None,
        "verdict": "موثوق" if success == rounds else ("غير مستقر" if success > 0 else "فاشل"),
    })
    print(f"[{name}] {success}/{rounds} ok | avg {avg:.0f}ms")

def post(path, payload, timeout=120):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode())

print("=" * 60)
print("UIAIv2.0 Stress Test — بدء", time.strftime("%H:%M:%S"))
print("=" * 60)

# 1) Skill Builder — صانع المهارات (توليد حقيقي عبر النموذج)
def t_skill_builder(i):
    d = post("/api/skills/generate", {"description": [
        "مهارة كتابة رسائل بريد رسمية",
        "مهارة تحويل الجداول إلى JSON",
        "مهارة شرح الكود للمبتدئين",
    ][i % 3]}, timeout=150)
    return bool(d.get("success") and d.get("skill", {}).get("promptPack"))
timed_call("skill-builder", t_skill_builder, rounds=3)

# 2) Web Search plugin — بحث الويب
def t_web_search(i):
    d = post("/api/search", {"query": ["DigitalOcean App Platform", "LiquidAI LFM2 model", "Python asyncio queue"][i % 3], "max_results": 4}, timeout=60)
    return len(d.get("results", [])) > 0
timed_call("web-search-plugin", t_web_search, rounds=3)

# 3) Image Generation plugin — توليد الصور (URL فقط، بلا تنزيل الصورة)
def t_image_gen(i):
    d = post("/api/image/generate", {"prompt": f"minimal logo, blue circle {i}", "width": 512, "height": 512}, timeout=60)
    return bool(d.get("success") and "pollinations" in d.get("url", ""))
timed_call("image-gen-plugin", t_image_gen, rounds=3)

# 4) Queue concurrency — إرسالان متزامنان (الخادم يجب أن يقبل مهمتين)
def t_queue_concurrency():
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs = [ex.submit(post, "/api/chat/send", {
            "prompt": f"Reply with exactly: Q{i}", "model": "gpt-4o-mini",
            "chat_id": f"stress-q-{i}", "user_id": "stress", "email": "s@s.co"
        }, 60) for i in range(2)]
        results = [f.result() for f in futs]
    return all(r.get("task_id") for r in results)
def t_queue(i):
    return t_queue_concurrency()
timed_call("queue-parallel-send", t_queue, rounds=2)

# 5) Chat E2E عبر مهمة كاملة (إرسال → انتظار → جلب النتيجة)
def t_chat_e2e(i):
    d = post("/api/chat/send", {
        "prompt": "Reply with exactly: STRESS-OK", "model": "gpt-4o-mini",
        "chat_id": f"stress-e2e-{i}", "user_id": "stress", "email": "s@s.co"
    }, 60)
    task_id = d.get("task_id")
    if not task_id:
        return False
    deadline = time.time() + 90
    while time.time() < deadline:
        time.sleep(3)
        p = get(f"/api/chat/preview/{task_id}", timeout=20)
        if p.get("status") == "completed":
            return len(p.get("full_text", "")) > 0
        if p.get("status") == "failed":
            return False
    return False
timed_call("chat-e2e-completion", t_chat_e2e, rounds=2)

# 6) Models API — قائمة النماذج
def t_models(i):
    d = get("/api/models", timeout=15)
    return len(d.get("models", [])) >= 4
timed_call("models-api", t_models, rounds=3)

print()
print("=" * 60)
print("النتائج النهائية:")
print(json.dumps(RESULTS, ensure_ascii=False, indent=1))
with open("stress_test_results.json", "w", encoding="utf-8") as f:
    json.dump({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "results": RESULTS}, f, ensure_ascii=False, indent=1)
print("حُفظت في stress_test_results.json")
