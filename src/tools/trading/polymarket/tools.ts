/**
 * Polymarket prediction market tools — read-only market intelligence
 */
import { registerTool } from '../../registry'
import { PolymarketClient, analyzeOrderbook } from './client'
import type { GammaMarket } from './types'

export function registerPolymarketTools(): void {
  // ── polymarket_scan_markets ──────────────────────────────────────

  registerTool(
    {
      name: 'polymarket_scan_markets',
      description:
        'Scan Polymarket for active prediction markets, filterable by tag and sortable by volume or liquidity.',
      input_schema: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Filter by category tag (e.g. "politics", "sports", "crypto", "science", "pop-culture")',
          },
          limit: {
            type: 'number',
            description: 'Number of markets to return (default 15, max 30)',
          },
          order: {
            type: 'string',
            description: 'Sort field: "volume", "liquidity", "startDate", "endDate"',
            enum: ['volume', 'liquidity', 'startDate', 'endDate'],
          },
          active_only: {
            type: 'boolean',
            description: 'Only show active markets (default true)',
          },
        },
        required: [],
      },
    },
    async (input, ctx) => {
      const client = new PolymarketClient(ctx.env)
      const limit = Math.min((input.limit as number) || 15, 30)
      const markets = await client.getMarkets({
        limit,
        tag: input.tag as string | undefined,
        order: (input.order as string) || 'volume',
        ascending: false,
        active: (input.active_only as boolean) ?? true,
      })

      const summary = markets.map((m) => formatMarketSummary(m))
      return { result: JSON.stringify({ count: markets.length, markets: summary }, null, 2) }
    },
  )

  // ── polymarket_search_markets ────────────────────────────────────

  registerTool(
    {
      name: 'polymarket_search_markets',
      description:
        'Search Polymarket for prediction markets by keyword.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (e.g. "trump", "bitcoin", "super bowl")',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 10, max 20)',
          },
        },
        required: ['query'],
      },
    },
    async (input, ctx) => {
      const client = new PolymarketClient(ctx.env)
      const limit = Math.min((input.limit as number) || 10, 20)
      const markets = await client.searchMarkets(input.query as string, limit)

      const summary = markets.map((m) => formatMarketSummary(m))
      return { result: JSON.stringify({ query: input.query, count: markets.length, markets: summary }, null, 2) }
    },
  )

  // ── polymarket_get_market ────────────────────────────────────────

  registerTool(
    {
      name: 'polymarket_get_market',
      description:
        'Get detailed Polymarket market info and orderbook analysis by condition_id or token_id.',
      input_schema: {
        type: 'object',
        properties: {
          condition_id: {
            type: 'string',
            description: 'Market condition ID (from polymarket_scan_markets or polymarket_search_markets)',
          },
          token_id: {
            type: 'string',
            description: 'Specific outcome token ID (from clobTokenIds in market data)',
          },
        },
        required: [],
      },
    },
    async (input, ctx) => {
      const client = new PolymarketClient(ctx.env)
      const conditionId = input.condition_id as string | undefined
      const tokenId = input.token_id as string | undefined

      if (!conditionId && !tokenId) {
        return { result: 'Provide either condition_id or token_id.', isError: true }
      }

      const result: Record<string, unknown> = {}

      if (conditionId) {
        // Get CLOB market detail
        const market = await client.getClobMarket(conditionId)
        result.market = {
          condition_id: market.condition_id,
          question: market.question,
          active: market.active,
          closed: market.closed,
          accepting_orders: market.accepting_orders,
          minimum_tick_size: market.minimum_tick_size,
          minimum_order_size: market.minimum_order_size,
          neg_risk: market.neg_risk,
          end_date: market.end_date_iso,
          tokens: market.tokens.map((t) => ({
            token_id: t.token_id,
            outcome: t.outcome,
            price: t.price,
          })),
        }

        // Get orderbook + analysis for first token
        const firstTokenId = market.tokens[0]?.token_id
        if (firstTokenId) {
          const book = await client.getOrderbook(firstTokenId)
          result.orderbook_analysis = analyzeOrderbook(book)

          const lastTrade = await client.getLastTradePrice(firstTokenId)
          result.last_trade_price = lastTrade.price
        }
      } else if (tokenId) {
        // Direct token lookup
        const book = await client.getOrderbook(tokenId)
        result.orderbook_analysis = analyzeOrderbook(book)

        const midpoint = await client.getMidpoint(tokenId)
        result.midpoint = midpoint.mid

        const lastTrade = await client.getLastTradePrice(tokenId)
        result.last_trade_price = lastTrade.price
      }

      return { result: JSON.stringify(result, null, 2) }
    },
  )

  // ── polymarket_get_positions ─────────────────────────────────────

  registerTool(
    {
      name: 'polymarket_get_positions',
      description:
        'Get current Polymarket positions with value and P&L for the configured wallet.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    async (_input, ctx) => {
      const client = new PolymarketClient(ctx.env)
      if (!client.isConfigured()) {
        return { result: 'Polymarket wallet not configured. Set POLYMARKET_WALLET_ADDRESS secret.', isError: true }
      }

      const positions = await client.getPositions()
      if (positions.length === 0) {
        return { result: JSON.stringify({ message: 'No open positions found.', positions: [] }) }
      }

      const summary = positions.map((p) => ({
        title: p.title,
        outcome: p.outcomeIndex === '0' ? 'Yes' : 'No',
        size: p.size,
        currentValue: p.currentValue,
        initialValue: p.initialValue,
        pnl: p.pnl,
        realizedPnl: p.realizedPnl,
        curPrice: p.curPrice,
        conditionId: p.conditionId,
      }))

      return { result: JSON.stringify({ count: positions.length, positions: summary }, null, 2) }
    },
  )

  // ── polymarket_get_portfolio ─────────────────────────────────────

  registerTool(
    {
      name: 'polymarket_get_portfolio',
      description:
        'Get total Polymarket portfolio value.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    async (_input, ctx) => {
      const client = new PolymarketClient(ctx.env)
      if (!client.isConfigured()) {
        return { result: 'Polymarket wallet not configured. Set POLYMARKET_WALLET_ADDRESS secret.', isError: true }
      }

      const value = await client.getPortfolioValue()
      return { result: JSON.stringify({ portfolioValue: value.portfolioValue }) }
    },
  )

  // ── polymarket_get_balance ───────────────────────────────────────

  registerTool(
    {
      name: 'polymarket_get_balance',
      description:
        'Get USDC balance for the Polymarket trading account.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    async (_input, ctx) => {
      const client = new PolymarketClient(ctx.env)
      if (!client.isFullyConfigured()) {
        return {
          result: 'Polymarket L2 credentials not configured. Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE secrets.',
          isError: true,
        }
      }

      const balance = await client.getBalance()
      return { result: JSON.stringify(balance) }
    },
  )

  // ── polymarket_get_orders ────────────────────────────────────────

  registerTool(
    {
      name: 'polymarket_get_orders',
      description:
        'Get open Polymarket orders, optionally filtered by market.',
      input_schema: {
        type: 'object',
        properties: {
          market: {
            type: 'string',
            description: 'Filter by market condition ID (optional)',
          },
        },
        required: [],
      },
    },
    async (input, ctx) => {
      const client = new PolymarketClient(ctx.env)
      if (!client.isFullyConfigured()) {
        return {
          result: 'Polymarket L2 credentials not configured. Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE secrets.',
          isError: true,
        }
      }

      const orders = await client.getOpenOrders(input.market as string | undefined)
      if (orders.length === 0) {
        return { result: JSON.stringify({ message: 'No open orders.', orders: [] }) }
      }

      const summary = orders.map((o) => ({
        id: o.id,
        market: o.market,
        side: o.side,
        price: o.price,
        size: o.original_size,
        filled: o.size_matched,
        status: o.status,
        type: o.type,
      }))

      return { result: JSON.stringify({ count: orders.length, orders: summary }, null, 2) }
    },
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatMarketSummary(m: GammaMarket): Record<string, unknown> {
  // Parse outcome prices (JSON string → number array)
  let prices: number[] = []
  try {
    prices = JSON.parse(m.outcomePrices || '[]').map(Number)
  } catch { /* ignore parse errors */ }

  // Parse CLOB token IDs
  let tokenIds: string[] = []
  try {
    tokenIds = JSON.parse(m.clobTokenIds || '[]')
  } catch { /* ignore parse errors */ }

  // Truncate description to save tokens
  const description = m.description?.length > 500
    ? m.description.slice(0, 500) + '...'
    : m.description

  return {
    question: m.question,
    conditionId: m.conditionId,
    outcomes: m.outcomes?.map((o, i) => ({
      name: o,
      price: prices[i] ?? null,
      tokenId: tokenIds[i] ?? null,
    })),
    volume: m.volume,
    liquidity: m.liquidity,
    active: m.active,
    closed: m.closed,
    endDate: m.endDate,
    category: m.category,
    description,
  }
}
