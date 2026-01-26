# Clawdbot in Cloudflare Sandbox

Run [Clawdbot](https://clawd.bot/) personal AI assistant in a Cloudflare Sandbox.

## Quick Start

```bash
# Install dependencies
npm install

# Set your Anthropic API key
wrangler secret put ANTHROPIC_API_KEY

# Deploy
npm run deploy
```

Open the deployed Worker URL in your browser to access the Clawdbot Control UI.

## Gateway Token

A random gateway token is generated on each deploy. Find it in the logs:

```bash
wrangler tail
```

To use your own token:

```bash
wrangler secret put CLAWDBOT_GATEWAY_TOKEN
```

## Optional: Chat Channels

### Telegram

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
npm run deploy
```

### Discord

```bash
wrangler secret put DISCORD_BOT_TOKEN
npm run deploy
```

### Slack

```bash
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_APP_TOKEN
npm run deploy
```

## Troubleshooting

**Gateway fails to start:** Check `wrangler secret list` and `wrangler tail`

**Config changes not working:** Edit the `# Build cache bust:` comment in `Dockerfile` and redeploy

**Slow first request:** Cold starts take 1-2 minutes. Subsequent requests are faster.

## Links

- [Clawdbot](https://clawd.bot/)
- [Clawdbot Docs](https://docs.clawd.bot)
