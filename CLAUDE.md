# Big Earn (moltworker)

Telegram AI assistant ("Big Earn") running on Cloudflare Workers. Uses Claude API with tool-use loop for social media management, content creation, image/video generation, and web research.

## Commands

```bash
npm run build        # Vite build (SSR worker + client assets)
npm run deploy       # Build + wrangler deploy to production
npm run dev          # Local dev server
npm run typecheck    # tsc --noEmit
npm run lint         # oxlint src/
npm run test         # vitest run
```

## Architecture

- **Runtime**: Cloudflare Workers (Hono framework)
- **Storage**: R2 bucket (`moltbot-data`) for all persistent state — conversations, config, soul prompt, skills, tool logs, feedback, media
- **AI**: Claude API with multi-turn tool-use loop (`src/claude/client.ts`)
- **Model routing**: `src/claude/router.ts` — Haiku for simple messages, Sonnet for complex tasks
- **Frontend**: React admin UI served as static assets (Cloudflare Access protected)

## Key Directories

```
src/
├── claude/          # Claude API client, prompt builder, model router, types
├── telegram/        # Webhook handler, Telegram API client, message formatting
├── tools/           # Tool registry + all tool implementations
│   ├── social/      # Twitter, YouTube, Instagram, LinkedIn, Moltbook
│   └── media/       # Flux Pro, Together.ai, Ideogram, Kling, telegram-send
├── r2/              # R2 storage layer (conversations, skills, feedback, media, etc.)
├── routes/          # Hono route handlers (API, admin UI, public media)
├── auth/            # Cloudflare Access JWT verification
├── config.ts        # Constants, model tiers, R2 key prefixes
└── types.ts         # MoltbotEnv interface (all env bindings/secrets)
```

## How It Works

1. Telegram webhook hits `src/telegram/webhook.ts`
2. Message is classified by `src/claude/router.ts` → Haiku or Sonnet
3. System prompt is built from `config/soul.md` in R2 + any skill documents
4. `callClaude()` runs a tool-use loop (up to 10 iterations)
5. Tools are registered in `src/tools/init.ts`, dispatched via `src/tools/registry.ts`
6. Some tools require user confirmation (posting, publishing, deleting) — these queue a pending action

## Soul Prompt

Big Earn's personality and instructions live in R2 at `config/soul.md`. Update via:
```bash
npx wrangler r2 object put moltbot-data/config/soul.md --file path/to/soul.md --remote
```

## Conventions

- TypeScript strict mode, ES2022 target
- No semicolons (oxfmt handles formatting)
- Lint with oxlint, format with oxfmt
- Tools are registered via `registerTool()` with a definition + executor function
- Tools needing user approval use `{ requiresConfirmation: true }`
- All R2 keys are defined in `src/config.ts` under `R2_KEYS`
- Environment secrets are managed via `wrangler secret put`
