# Coding Agent Instructions for UIAIv2.0

1. **Stack Overview**: React 19 + TypeScript + Vite + TailwindCSS + Express backend (`server.ts`).
2. **Workflow Rules**:
   - Always inspect files before modifying them.
   - Write clean, modular, and typed TypeScript code.
   - After editing frontend or backend code, verify syntax and run `npm run build` to ensure zero build errors.
   - Keep user experience responsive and modern.

## MijlAI-PWR model (added 2026-08-26)
- Dedicated DigitalOcean GenAI agent (`direct:mijlai-pwr`), OpenAI-compatible endpoint.
- Wiring: `functions/api/models.ts` (UI list) → `App.tsx` tier `pwr` → `engine.py` → `g4f_provider.py` `DIRECT_ENDPOINTS["mijlai-pwr"]`.
- Key lives in `.env` as `MIJLAI_PWR_API_KEY` (never hardcode it).
- The DO agent rejects system/developer roles (HTTP 400) — `g4f_provider.py` folds them into the first user message via `fold_system_messages_for_agent` (`no_system_role: True`).
- The local llama.cpp fallback (`llama-local.service`, port 8085) was removed/disabled per owner request — do not re-add local fallbacks.
- aider is configured for this model via `~/.aider.conf.yml` + `~/.aider.model.settings.yml` (`use_system_prompt: false`).
- `prompts/mijlai-pwr-coder.system.md` — the CODER system prompt (paste into the DO agent's Instructions field).
- `prompts/pwr-acceleration-study.md` — research notes on MTP/speculative-decoding acceleration for Nemotron-3 Super 120B.
