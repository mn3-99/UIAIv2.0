# UI Conventions — MijlAI (UIAIv2.0)

قواعد ملزمة لكتابة واجهة متسقة تبقى سليمة عبر الثيمات الأربعة (light / dark /
emerald-slate / obsidian-amber) وعبر الاتجاهين (RTL/LTR).

## 1) Semantic tokens (استخدمها بدل الألوان الصلبة)

كل utility تولدها Tailwind 4 من `@theme inline` في `src/index.css` وتقرأ القيمة
الحية من `var(--…)` حسب `[data-theme]` الحالي — لا تكتب لونًا صلبًا أبدًا في
المكوّنات.

| التوكن الدلالي | يرتبط بـ | utilities المتولدة |
|---|---|---|
| `surface` | `--bg-surface` | `bg-surface`, `text-surface` |
| `card` | `--bg-card` | `bg-card` |
| `elevated` | `--bg-elevated` | `bg-elevated` |
| `main` | `--text-main` | `text-main` |
| `muted` | `--text-muted` | `text-muted` |
| `faint` | `--text-faint` | `text-faint` |
| `line` | `--border-color` | `border-line`, `divide-line` |
| `accent` | `--accent-color` | `bg-accent`, `text-accent`, `border-accent` |
| `accent-hover` | `--accent-hover` | `hover:bg-accent-hover`, `text-accent-hover` |
| `accent-soft` | `--accent-soft` | `bg-accent-soft` |

الشفافية تعمل عبر color-mix تلقائيًا: `bg-surface/80`، `text-main/90`، إلخ.

التوكنات المشتقة لفقاعة المستخدم والتدرجات: `--accent-grad-a` و`--accent-grad-b`
و`--accent-glow` — معرّفة لكل ثيم.

## 2) القواعد الثلاث الذهبية

1. **لا hex في tsx** — ألوان المكوّنات من التوكنات فقط. الاستثناء الوحيد:
   `MijlaiLogo.tsx` (توقيع شعار متعدد الألوان متعمّد).
2. **لا `left-*`/`right-*`** — الخصائص الفيزيائية ممنوعة؛ استخدم
   `start-*`/`end-*` و`ps-*`/`pe-*` و`ms-*`/`me-*` و`text-start`/`text-end`.
   التطبيق RTL-first.
3. **لا `!important`** إلا لتجاوز مكتبة خارجية (مثل mermaid) أو
   `prefers-reduced-motion`.

## 3) أنماط مسموحة

- **`style={{ … }}` في الملفات الكبيرة** (`App.tsx`, `ChatMessageItem.tsx`,
  `MijlaiComposer.tsx`, `MijlaiSidebar.tsx`) مسموح **فقط** إذا كان يستخدم
  `var(--…)` (توكن ثيم). لا تضع قيمًا صلبة inline.
- **الوصول للـ DOM**: استخدم refs أو `ComposerFocusContext` (للتركيز على
  حقل الكتابة) — ممنوع `document.getElementById` في `src/components`.
- **المحتوى داخل `dir="auto"`** يبقى `unicode-bidi: plaintext`، وجزر الكود
  LTR — لا تكسر `dir="auto"` أو `direction: ltr` على `code`/`mermaid`/`katex`.

## 4) المكوّنات المسموح لها باستخدام أيقونات

كل المكوّنات تستخدم **lucide-react**. الإيموجي محظور في واجهة JSX الدلالية
(أزرار/شارات/رسائل حالة) ويُسمح فقط داخل **نصوص المحتوى** (ردود النموذج نفسها).

- أيقونات الحالة/الشارات: `Zap`, `Sparkles`, `Brain`, `Rocket`, `Shield`,
  `Timer`, `Lightbulb`, `Paperclip`, `X`, `Check`, `AlertCircle`.
- لا تستخدم إيموجي كبديل عن أيقونة في `title`/`aria-label`/شارات الواجهة.

## 5) بوابات الجودة

- `npm run lint` = `tsc --noEmit` + `node scripts/check-physical-props.mjs`
  (يفشل عند أي `left-N`/`right-N`).
- `npm run guard` = `node scripts/ui-guardrails.mjs` (يفشل عند hex في tsx،
  style inline بلا توكن، أو `document.getElementById` في المكوّنات).
- شغّل `npm run lint && npm run guard` قبل كل دمج (CI أو pre-push hook).
