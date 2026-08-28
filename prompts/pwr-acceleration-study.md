# دراسة طبقة التسريع — Nemotron-3 Super 120B-A12B (محرك MijlAI-PWR)

> تاريخ الدراسة: 2026-08-27 · منهجية: مراجعة البطاقات الرسمية (HuggingFace/NVIDIA)، وثائق
> vLLM/SGLang/TensorRT-LLM، وقياسات المجتمع. المصادر مذكورة بنهاية الملف.

## 1. الخلاصة التنفيذية

- **Nemotron-3 Super 120B يمتلك طبقة MTP أصيلة (Multi-Token Prediction) مدمجة في النموذج نفسه**
  بطريقة DeepSeek-V3 (`num_nextn_predict_layers: 1` بوزن مشترك عبر أعماق التنبؤ) — أي أن خيار
  التسريع الأفضل **موجود بالفعل ولا يحتاج نموذجاً مساعداً**.
- **MTPv2** (رأس محدّث 3B صدر 2026-08-11) يرفع متوسط طول القبول من **3.45 إلى 4.31 توكن/خطوة**
  بطول مسودّة 7 — وفي فئة **البرمجة تحديداً: 3.78 → 4.86 توكن/خطوة**. NVIDIA تقيس حتى **3×
  تسريع فعلي (wall-clock)** في توليد الكود واستدعاء الأدوات.
- **EAGLE-3** هو أفضل خيار "تعديل لاحق" للنماذج التي **لا** تملك MTP أصيلاً — لكن **لا يوجد رأس
  EAGLE-3 عام لهذا النموذج** (لا حاجة له أصلاً). **Medusa أصبح تقنية قديمة**.
- **نموذج المسودّة الصغير (draft model)**: ممكن نظرياً لكن **لا توجد مسودّة عامة مناسبة** لهذا
  النموذج (يلزم توافق المجزئ/tokenizer)، ويكلف ذاكرة نموذج إضافي — غير موصى به هنا.
- **لأحمال تحرير الكود والوكلاء**: فكّ الترميز بالـ **n-gram / suffix** (بدون أي أوزان إضافية،
  بدون فقدان دقة) يتفوق أحياناً على المسودّات لأن مخرجات الوكلاء تنسخ نصوصاً موجودة مسبقاً.

## 2. لماذا MTP هو الأنسب لهذا النموذج تحديداً

| المعيار | MTP (مدمج) | MTPv2 | EAGLE-3 | Medusa | نموذج مسودّة صغير | n-gram / suffix |
|---|---|---|---|---|---|---|
| متاح لهذا النموذج؟ | ✅ مدمج بالوزن | ✅ رأس رسمي | ❌ لا يوجد رأس عام | ❌ قديمة | ❌ لا توجد مسودّة متوافقة | ✅ بدون أوزان |
| طول قبول (كود) | 3.78 | **4.86** | ~2–2.5× على نماذج صغيرة فقط | — | — | متوسط-منخفض لكنه ممتاز للنسخ المتكرر |
| تكلفة ذاكرة إضافية | ~صفر | 3B | رأس إضافي | رؤوس إضافية | نموذج كامل إضافي | صفر |
| توصية vLLM الرسمية | "الأفضل عندما يملك النموذج MTP أصيلاً" | ← | "الأفضل سرعة/جودة للنماذج بدون MTP" | — | "جيد" | "بدون تكلفة عند الذروة" |

قياس مجتمعي مستقل (DGX Spark، vLLM، MTP k=3): قبول لكل موضع ≈ **0.84 / 0.65 / 0.49** (إجمالي ≈0.66)
وسرعة ~26–27 توكن/ث مقابل ~23 بدون تخمين — على جهاز واحد محدود الذاكرة.

## 3. أين يمكن تفعيل الطبقة فعلياً؟

### أ) نقطة DigitalOcean المُدارة (الحالية: mijlai-pwr)
وكيل DO GenAI / نموذج `nvidia-nemotron-3-super-120b` عبر DO Inference = **مُدار بالكامل، لا يمكن
ضبط أي أعلام تخمين من جهة المستخدم**. NVIDIA تشغّل MTP ضمن حزمتها داخلياً (التصميم يتضمنه)، لكن
التحكم بطول المسودّة أو MTPv2 غير متاح. **الخلاصة: على النقطة الحالية، التسريع شأن المزوّد.**

### ب) الاستضافة الذاتية (إن قررت تشغيل النموذج بنفسك)

**vLLM (الرأس المدمج، k=3):**
```bash
vllm serve nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16 \
  --tensor-parallel-size 8 --enable-expert-parallel \
  --kv-cache-dtype fp8 --mamba-ssm-cache-dtype float32 \
  --reasoning-parser nemotron_v3 --enable-auto-tool-choice --tool-call-parser qwen3_coder \
  --speculative-config '{"method":"mtp","num_speculative_tokens":3}'
```

**vLLM (رأس MTPv2 — الأقوى للكود، DL=7):**
```bash
  --speculative-config '{"method":"mtp","model":"nvidia/Nemotron-3-Super-120B-A12B-BF16-MTPv2","num_speculative_tokens":7}'
```

**SGLang (مسار EAGLE يشغّل MTP):**
```bash
sglang serve --model-path nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16 \
  --speculative-algorithm EAGLE --speculative-num-steps 3 \
  --speculative-eagle-topk 1 --speculative-num-draft-tokens 4 \
  --mamba-radix-cache-strategy extra_buffer
```

**لأحمال الوكيل/تحرير الملفات (إضافة بدون أوزان):**
```bash
# vLLM n-gram: يقترح توكنات منسوخة من البرومبت/المخرجات — مثالي لإعادة كتابة الملفات
--speculative-config '{"method":"ngram","num_speculative_tokens":4,"prompt_lookup_min":2,"prompt_lookup_max":5}'
```

**العتاد والضغط:** NVFP4 على B200/DGX Spark (~74–80GB) = أفضل إنتاجية؛ FP8 لـ H100/H200 (~120GB)؛
BF16 للدقة القصوى (8×H100). إنتاجية مرجعية NVIDIA/Dynamo على B200: **1388 توكن/ث/GPU** للحمل
الوكيلي (8K دخل/64K خرج) مع MTP DL=3 — أي **2.2× ضد GPT-OSS-120B** على نفس العتاد.

**ملاحظات حذر (موثقة):** تقارير OOM مع MTP على ذاكرة محدودة، وخطأ CUDA على nightly معيّن لـ vLLM
على Spark — اختبر حزمتك بالضبط قبل الإنتاج. دعم TRT-LLM لـ MTP موثّق لـ Ultra وليس بوضوح لـ Super.

## 4. التوصية العملية

1. **الآن (النقطة المُدارة)**: لا شيء مطلوب — التسريع عند DO/NVIDIA. ركّز مكاسب الأداء في
   **البرومبت + السقالات** (انظر `mijlai-pwr-coder.system.md`): هندسة صيغة التعديل وحدها رفعت
   مقياس aider من 20% إلى 61% تاريخياً، وحلقات التحقق الذاتي تضيف ~11 نقطة على HumanEval.
2. **إن انتقلت لاستضافة ذاتية**: NVFP4 + vLLM + **MTPv2 بطول مسودّة 7** للكود، مع n-gram/suffix
   كطبقة إضافية لأحمال تحرير الملفات المتكررة. توقّع **~2.5–3×** على توليد الكود/الأدوات.

## 5. المصادر الأساسية

1. بطاقة النموذج: huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16
2. رأس MTPv2: huggingface.co/nvidia/Nemotron-3-Super-120B-A12B-BF16-MTPv2
3. مدونة NVIDIA المطورين: introducing-nemotron-3-super (تسريع حتى 3× للكود والأدوات)
4. vLLM: vllm.ai/blog/2026-03-11-nemotron-3-super · docs.vllm.ai/en/latest/features/speculative_decoding
5. SGLang: docs.sglang.io/advanced_features/speculative_decoding.html · lmsys.org/blog/2026-03-11
6. TensorRT-LLM: nvidia.github.io/TensorRT-LLM/features/speculative-decoding.html
7. NVIDIA Dynamo recipes: docs.nvidia.com/dynamo/dev/recipes/nemotron-3-super
8. قياس المجتمع: github.com/jeremy-newhouse/dgx-spark-nemotron-super-bench
9. Lookahead decoding: lmsys.org/blog/2023-11-21-lookahead-decoding · arXiv:2402.02057
10. وثائق DigitalOcean Inference: docs.digitalocean.com/products/inference/details/models
11. مجموعة NVIDIA للتخمين: huggingface.co/collections/nvidia/speculative-decoding-modules
