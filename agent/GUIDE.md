# Guide de recreation — UIAI-Agent

Implementation d'un agent CLI type MijlAI Code integre au projet **UIAIv2.0**.
Ce guide resume l'architecture produite a partir des 16 documents de reference
(`openDataSenegal/MijlAI-Code-Documentation-Technique-Chaofan-Shou`) et la mappe
sur le code de `agent/`.

## Demarrage

```bash
# Lancer le REPL interactif (Ink si TTY, sinon readline)
npm run agent
# ou directement :
npx tsx agent/entrypoints/cli.tsx

# Mode non-interactif (prompt unique)
npx tsx agent/entrypoints/cli.tsx --print "explique ce repo"

# Mode bridge (controle a distance via WebSocket + JWT)
npx tsx agent/entrypoints/cli.tsx --bridge

# Afficher le prompt systeme complet
npx tsx agent/entrypoints/cli.tsx --dump-system-prompt

# Reprendre une session
npx tsx agent/entrypoints/cli.tsx --resume <id>
```

> L'agent utilise les endpoints OpenAI-compatibles de UIAIv2.0
> (`POST /api/v1/chat/completions`, `POST /api/v1/chat/completions` en SSE),
> base `http://localhost:3000`, modele `mijlai-pwr` par defaut.

## Architecture (mappee sur les docs)

| Doc | Module | Statut |
|-----|--------|--------|
| 01 Vue d'ensemble | `agent/README.md`, `constants/`, `setup.ts` | OK |
| 02 Entrypoints | `entrypoints/cli.tsx`, `main.tsx`, `replLauncher.tsx`, `setup.ts`, `history.ts` | OK |
| 03 Query Engine | `QueryEngine.ts`, `query.ts`, `query/systemPrompt.ts`, `services/api.ts`, `cost-tracker.ts` | OK |
| 04 Outils | `Tool.ts`, `tools.ts`, `tools/*`, `services/tools/StreamingToolExecutor.ts`, `toolHooks.ts` | OK |
| 05 Commandes | `commands.ts`, `commands/*`, `context.ts`, `skills/`, `plugins/` | OK |
| 06 UI Ink | `ink.tsx`, `screens/ReplScreen.tsx`, `components/*` | OK |
| 07 Etat | `state/AppStateStore.ts`, `state/types.ts`, `state/AppState.tsx`, `onChangeAppState.ts` | OK |
| 08 Permissions | `permissions/*` (ProtectedFiles, validate, classifier, PermissionSystem, prompt, dialog, bus) | OK |
| 09 Memoire | `memdir/*`, `services/autoDream/*`, commande `/memory` | OK |
| 10 Bridge | `bridge/*` (protocol, jwt, pairing, server, controller, bridgeMain) | OK |
| 11 Multi-agent | `multiagent/*` (subagent, team, coordinator, colors, scratchpad), `tools/AgentTool.ts`, `TeamTools.ts`, `WorktreeTools.ts` | OK |
| 12 Services | `services/api.ts`, `services/analytics.ts`, `cost-tracker.ts`, `costHook.ts`, `services/diagnosticTracking.ts`, `utils/modelCost.ts`, `utils/auth.ts` | OK |
| 13 Hooks/Keybindings | `hooks/*` (execHooks, useGlobalKeybindings, useExitOnCtrlCD, useDoublePress, useArrowKeyHistory), `keybindings/*`, `vim/*`, commandes `/vim` `/keybindings` | OK |
| 14 Configuration | `setup.ts` (config multi-niveaux, MijlAI.md), `utils/feature.ts`, `agent/commands/config.ts` | OK |
| 15 Securite | `constants/cyberRiskInstruction.ts`, `utils/security.ts` (validatePath, validateCommand, SECRET_PATTERNS, scrubSecrets, securityValidate), integration `toolHooks.ts` + analytics | OK |
| 16 Guide | ce fichier | OK |

## Defenses en profondeur (doc 15)

1. Prompt systeme (ROLE + SECURITY + CYBER_RISK)
2. Systeme de permissions (default/auto/bypass, fichiers proteges)
3. Validation centralisee des inputs (`securityValidate` dans `preExecute`)
4. Fichiers proteges (`permissions/protectedFiles.ts`)
5. Detection/scrubbing de secrets (`utils/security.ts` + analytics)
6. Communications securisees (bridge JWT + TLS recommande)

## Checklist de recreation (doc 16)

- [x] CLI avec parsing d'arguments
- [x] Connexion a l'API (OpenAI-compatible)
- [x] Boucle de requete avec tool-use
- [x] Outils de base (Read, Edit, Write, Bash, Glob, Grep, WebFetch)
- [x] Interface REPL terminal (Ink + readline fallback)
- [x] Prompt systeme avec contexte dynamique (cache break)
- [x] Systeme de permissions
- [x] Memoire persistante (autoDream)
- [x] Commandes slash
- [x] Streaming des reponses (SSE)
- [x] Persistence des sessions
- [x] Suivi des couts
- [x] Sous-agents (AgentTool, Coordinator, Team, Worktree)
- [x] Gestion de la fenetre de contexte (compaction)
- [x] Detection de secrets
- [x] Validation des chemins
- [x] Configuration multi-niveaux
- [x] MijlAI.md support
- [x] Bridge WebSocket (JWT)
- [x] Mode vim
- [x] Hooks d'execution

## Tests manuels recommandes

```bash
# Verifier le typecheck du module agent
npx tsc --noEmit

# Memoire
printf '/memory add project Demo :: note :: contenu test\r/memory list\r/exit\r' \
  | timeout 20 script -qec "npx tsx agent/entrypoints/cli.tsx" /dev/null

# Bridge (autre terminal) : recuperer le Pairing code, puis connecter un client WS
npx tsx agent/entrypoints/cli.tsx --bridge
```

## Dependances utilisees

| Package | Usage |
|---------|-------|
| `ink` + `react` | Interface terminal React |
| `ws` | WebSocket pour le bridge |
| (natif) `node:crypto` | JWT HMAC, attestation |
| `node:child_process` | BashTool, worktree, hooks shell |
| UIAIv2.0 server | endpoints LLM OpenAI-compatibles |

## Conseils

1. Commencer simple : un REPL + Read + Bash couvre deja 80 % des cas.
2. Iterer : ajouter les fonctionnalites une par une (ordre des docs 01→16).
3. Securite des le debut : `securityValidate` avant toute execution.
4. Le prompt est le produit : investir dans `query/systemPrompt.ts`.
