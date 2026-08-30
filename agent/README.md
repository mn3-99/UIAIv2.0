# UIAI Agent — MijlAI Code architecture applied to UIAIv2.0

Ce module implemente, fichier par fichier, la documentation technique
`MijlAI-code-doc` (01 → 16) a l'interieur d'UIAIv2.0.

## Stack technique (doc 01)

| Composant | Technologie |
|-----------|-------------|
| Langage | TypeScript / TSX |
| Runtime | Node.js (tsx) — le projet UIAI utilise tsx, pas Bun |
| Interface terminal | React + Ink (doc 06) |
| Client API | Endpoints UIAI existants (`/api/v1/chat/completions`) |
| Gestion d'etat | React Context API + pattern Store custom (doc 07) |
| Protocole d'outils | MCP-ready, registre filtre (doc 04) |
| Configuration | JSON (user/projet) + feature flags (doc 14) |

## Couches (doc 01)

```
PRESENTATION : entrypoints/ (REPL, daemon) + screens/ + ink/
LOGIQUE      : QueryEngine + tools/ + commands/ + state/
SERVICES     : services/ (api, analytics, auth, config)
INFRA        : memdir/ + hooks/ + permissions + feature flags
```

## Principes appliques

1. **Feature gates** — `utils/feature.ts`, flags resolus via config (doc 14).
2. **Chargement paresseux** — `require`/`import()` a la demande.
3. **Prompts systeme modulaires** — sections stables + volatiles (doc 03).
4. **Observer pour l'etat** — Store avec listeners (doc 07).
5. **Registre filtre pour les outils** — flags + permissions (doc 04/08).

## Progression des docs

| # | Doc | Etat |
|---|-----|------|
| 01 | Vue d'ensemble | structure `agent/` creee |
| 02 | Entrypoints | a venir |
| 03-16 | ... | a venir |
