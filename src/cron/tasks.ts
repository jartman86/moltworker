/**
 * Cron task dispatcher — runs Big Earn autonomously on a schedule.
 *
 * Each cron expression maps to a task config with a prompt, tool keywords
 * (for dynamic tool filtering), and model. Claude runs a tool-use loop
 * just like the webhook handler, then results are logged to R2 and a
 * summary is sent to the owner via Telegram.
 */
import type { MoltbotEnv } from '../types'
import type { ToolContext } from '../tools'
import type { ToolUseBlock } from '../claude/types'
import { callClaude } from '../claude/client'
import { buildSystemPrompt } from '../claude/prompt'
import { initializeTools, getFilteredToolDefinitions, executeTool } from '../tools'
import { TelegramClient } from '../telegram/api'
import { markdownToTelegramHtml } from '../telegram/format'
import { MODELS, OWNER_CHAT_ID, R2_KEYS } from '../config'

interface CronTaskConfig {
  name: string
  prompt: string
  /** Keywords that drive dynamic tool filtering */
  toolKeywords: string
  /** Whether to send a Telegram notification (brief tasks skip on no-op) */
  alwaysNotify: boolean
}

const TASK_CONFIGS: Record<string, CronTaskConfig> = {
  // Every hour — quick Moltbook scan
  '0 * * * *': {
    name: 'hourly',
    prompt: `You are running an autonomous hourly check. Do the following:
1. Check Moltbook DMs for any new messages.
2. Scan the Moltbook feed for interesting agent posts.
3. Upvote and/or comment on posts you find insightful or relevant to transformation, resilience, military mindset, or AI agents.
4. If there's nothing noteworthy, just say "Nothing notable this hour."

Keep your actions natural — don't force engagement. Quality over quantity. Be brief in your summary.`,
    toolKeywords: 'moltbook molt dm feed upvote comment',
    alwaysNotify: false,
  },

  // 9 AM ET — morning research + brief
  '0 14 * * *': {
    name: 'morning',
    prompt: `You are running the morning routine (9 AM ET). Do the following:
1. Read the "research-assistant" skill for your research playbook.
2. Research trending topics in transformation, resilience, military mindset, coaching, and personal development.
3. Scan competitor activity and note anything interesting.
4. Generate 3-5 content ideas based on trends and Jim's brand.
5. Check Moltbook feed and engage with any good posts.
6. Compile everything into a concise morning brief.

End with a clear summary of today's content opportunities and any action items.`,
    toolKeywords: 'moltbook molt web search research trend content image media skill',
    alwaysNotify: true,
  },

  // 9 PM ET — evening content + review
  '0 2 * * *': {
    name: 'evening',
    prompt: `You are running the evening routine (9 PM ET). Do the following:
1. If you have insights worth sharing, post to Moltbook (read the "moltbook" skill first for posting guidelines).
2. Check Moltbook feed and engage — upvote, comment on interesting posts.
3. Review today's activity — what content was created, what performed well.
4. Compile a daily summary.

End with a concise daily review: what happened, what worked, and any suggestions for tomorrow.`,
    toolKeywords: 'moltbook molt post comment upvote skill content',
    alwaysNotify: true,
  },

  // Monday 6 AM ET — weekly strategy
  '0 11 * * 1': {
    name: 'weekly',
    prompt: `You are running the weekly strategy review (Monday 6 AM ET). Do the following:
1. Read the "social-media-strategy" skill for strategic context.
2. Analyze the week's Moltbook activity — your posts, engagement received, community trends.
3. Research what's trending in transformation/coaching/resilience space this week.
4. Evaluate: What content themes worked? What didn't land? Any new opportunities?
5. Propose next week's content strategy with specific topic ideas.

End with a structured weekly report: performance summary, key insights, and next week's plan.`,
    toolKeywords: 'moltbook molt web search research skill strategy content analytics',
    alwaysNotify: true,
  },
}

export async function runScheduledTask(cron: string, env: MoltbotEnv): Promise<void> {
  const config = TASK_CONFIGS[cron]
  if (!config) {
    console.log(`[CRON] No task config for cron expression: ${cron}`)
    return
  }

  console.log(`[CRON] Starting task: ${config.name} (cron=${cron})`)
  const startTime = Date.now()

  if (!env.TELEGRAM_BOT_TOKEN || !env.ANTHROPIC_API_KEY) {
    console.error(`[CRON] Missing required env vars for ${config.name}`)
    return
  }

  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN)
  const bucket = env.MOLTBOT_BUCKET

  try {
    initializeTools()

    const systemPrompt = await buildSystemPrompt(bucket)
    const tools = getFilteredToolDefinitions(config.toolKeywords)
    const toolCtx: ToolContext = { env, bucket, chatId: 0 }

    console.log(`[CRON] ${config.name}: model=${MODELS.standard} tools=${tools.length} systemPromptLen=${systemPrompt.length}`)

    const result = await callClaude(env, systemPrompt, [{ role: 'user', content: config.prompt }], {
      tools: tools.length > 0 ? tools : undefined,
      executeTools: tools.length > 0
        ? (block: ToolUseBlock) => executeTool(block, toolCtx)
        : undefined,
      model: MODELS.standard,
    })

    const durationMs = Date.now() - startTime

    console.log(`[CRON] ${config.name} complete: toolCalls=${result.toolCalls.length} iterations=${result.iterations} inputTokens=${result.inputTokens} outputTokens=${result.outputTokens} duration=${durationMs}ms`)

    // Log to R2
    const logKey = `${R2_KEYS.cronLogsPrefix}${config.name}/${Date.now()}.json`
    await bucket.put(logKey, JSON.stringify({
      task: config.name,
      cron,
      timestamp: Date.now(),
      durationMs,
      model: MODELS.standard,
      toolCount: tools.length,
      systemPromptLength: systemPrompt.length,
      toolCalls: result.toolCalls,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      iterations: result.iterations,
      responseText: result.text,
    }))

    // Send Telegram notification
    const isNoOp = result.text.toLowerCase().includes('nothing notable') || result.text.toLowerCase().includes('nothing noteworthy')
    if (config.alwaysNotify || !isNoOp) {
      const header = `[${config.name.toUpperCase()}] Autonomous task complete`
      const footer = `\n\n---\nTools: ${result.toolCalls.length} | Tokens: ${result.inputTokens + result.outputTokens} | ${Math.round(durationMs / 1000)}s`
      const message = `${header}\n\n${result.text}${footer}`
      const html = markdownToTelegramHtml(message)
      await telegram.sendMessage(OWNER_CHAT_ID, html, 'HTML')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[CRON] ${config.name} failed:`, err)

    // Always notify on errors
    await telegram.sendMessage(
      OWNER_CHAT_ID,
      `[CRON ERROR] ${config.name} failed: ${message}`,
    ).catch((sendErr) => {
      console.error(`[CRON] Failed to send error notification:`, sendErr)
    })
  }
}
