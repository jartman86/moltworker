/**
 * Polymarket API client — prediction market data and trading
 *
 * Three API surfaces:
 * - Gamma API (public): market discovery, search, events
 * - CLOB API (public + authenticated): orderbooks, prices, orders, balance
 * - Data API (public): positions, portfolio value by wallet address
 */
import type { MoltbotEnv } from '../../../types'
import type {
  GammaMarket,
  GammaEvent,
  ClobMarket,
  Orderbook,
  OrderbookAnalysis,
  DataApiPosition,
  BalanceAllowance,
  ClobOrder,
  ClobTrade,
} from './types'
import { createL2Headers, type L2Credentials } from './auth'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'
const DATA_API = 'https://data-api.polymarket.com'

export class PolymarketClient {
  private walletAddress: string | undefined
  private l2Creds: L2Credentials | undefined

  constructor(env: MoltbotEnv) {
    this.walletAddress = env.POLYMARKET_WALLET_ADDRESS

    if (env.POLYMARKET_API_KEY && env.POLYMARKET_API_SECRET && env.POLYMARKET_API_PASSPHRASE) {
      this.l2Creds = {
        apiKey: env.POLYMARKET_API_KEY,
        apiSecret: env.POLYMARKET_API_SECRET,
        passphrase: env.POLYMARKET_API_PASSPHRASE,
      }
    }
  }

  /** Has wallet address — enough for public Data API queries */
  isConfigured(): boolean {
    return !!this.walletAddress
  }

  /** Has L2 HMAC credentials — needed for authenticated CLOB endpoints */
  isFullyConfigured(): boolean {
    return !!this.l2Creds
  }

  // ── Gamma API (public) ───────────────────────────────────────────

  async getMarkets(params: {
    limit?: number
    offset?: number
    active?: boolean
    closed?: boolean
    order?: string
    ascending?: boolean
    tag?: string
  } = {}): Promise<GammaMarket[]> {
    const qs = new URLSearchParams()
    qs.set('limit', String(params.limit ?? 20))
    if (params.offset) qs.set('offset', String(params.offset))
    if (params.active !== undefined) qs.set('active', String(params.active))
    if (params.closed !== undefined) qs.set('closed', String(params.closed))
    if (params.order) qs.set('order', params.order)
    if (params.ascending !== undefined) qs.set('ascending', String(params.ascending))
    if (params.tag) qs.set('tag', params.tag)

    const resp = await fetch(`${GAMMA_API}/markets?${qs}`)
    if (!resp.ok) throw new Error(`Gamma API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<GammaMarket[]>
  }

  async searchMarkets(query: string, limit = 10): Promise<GammaMarket[]> {
    const qs = new URLSearchParams({ slug_contains: query, limit: String(limit), active: 'true' })
    const resp = await fetch(`${GAMMA_API}/markets?${qs}`)
    if (!resp.ok) throw new Error(`Gamma API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<GammaMarket[]>
  }

  async getEvents(params: {
    limit?: number
    active?: boolean
    closed?: boolean
    order?: string
    ascending?: boolean
    tag?: string
  } = {}): Promise<GammaEvent[]> {
    const qs = new URLSearchParams()
    qs.set('limit', String(params.limit ?? 10))
    if (params.active !== undefined) qs.set('active', String(params.active))
    if (params.closed !== undefined) qs.set('closed', String(params.closed))
    if (params.order) qs.set('order', params.order)
    if (params.ascending !== undefined) qs.set('ascending', String(params.ascending))
    if (params.tag) qs.set('tag', params.tag)

    const resp = await fetch(`${GAMMA_API}/events?${qs}`)
    if (!resp.ok) throw new Error(`Gamma API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<GammaEvent[]>
  }

  // ── CLOB API (public) ────────────────────────────────────────────

  async getOrderbook(tokenId: string): Promise<Orderbook> {
    const resp = await fetch(`${CLOB_API}/book?token_id=${tokenId}`)
    if (!resp.ok) throw new Error(`CLOB API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<Orderbook>
  }

  async getMidpoint(tokenId: string): Promise<{ mid: string }> {
    const resp = await fetch(`${CLOB_API}/midpoint?token_id=${tokenId}`)
    if (!resp.ok) throw new Error(`CLOB API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<{ mid: string }>
  }

  async getLastTradePrice(tokenId: string): Promise<{ price: string }> {
    const resp = await fetch(`${CLOB_API}/last-trade-price?token_id=${tokenId}`)
    if (!resp.ok) throw new Error(`CLOB API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<{ price: string }>
  }

  async getPriceHistory(tokenId: string, fidelity = 60): Promise<{ history: { t: number; p: number }[] }> {
    const resp = await fetch(`${CLOB_API}/prices-history?market=${tokenId}&interval=all&fidelity=${fidelity}`)
    if (!resp.ok) throw new Error(`CLOB API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<{ history: { t: number; p: number }[] }>
  }

  async getClobMarket(conditionId: string): Promise<ClobMarket> {
    const resp = await fetch(`${CLOB_API}/markets/${conditionId}`)
    if (!resp.ok) throw new Error(`CLOB API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<ClobMarket>
  }

  // ── Data API (public, wallet-scoped) ─────────────────────────────

  async getPositions(): Promise<DataApiPosition[]> {
    if (!this.walletAddress) throw new Error('Wallet address not configured')
    const resp = await fetch(`${DATA_API}/positions?user=${this.walletAddress}`)
    if (!resp.ok) throw new Error(`Data API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<DataApiPosition[]>
  }

  async getPortfolioValue(): Promise<{ portfolioValue: string }> {
    if (!this.walletAddress) throw new Error('Wallet address not configured')
    const resp = await fetch(`${DATA_API}/value?user=${this.walletAddress}`)
    if (!resp.ok) throw new Error(`Data API error (${resp.status}): ${await resp.text()}`)
    return resp.json() as Promise<{ portfolioValue: string }>
  }

  // ── CLOB API (authenticated) ─────────────────────────────────────

  async getBalance(): Promise<BalanceAllowance> {
    return this.authenticatedRequest<BalanceAllowance>('GET', '/balance')
  }

  async getOpenOrders(market?: string): Promise<ClobOrder[]> {
    const path = market ? `/orders?market=${market}` : '/orders'
    return this.authenticatedRequest<ClobOrder[]>('GET', path)
  }

  async getTradeHistory(market?: string): Promise<ClobTrade[]> {
    const path = market ? `/trades?market=${market}` : '/trades'
    return this.authenticatedRequest<ClobTrade[]>('GET', path)
  }

  // ── Internal ─────────────────────────────────────────────────────

  private async authenticatedRequest<T>(method: string, path: string, body?: string): Promise<T> {
    if (!this.l2Creds) throw new Error('L2 API credentials not configured')

    const headers = await createL2Headers(this.l2Creds, method, path, body)
    const resp = await fetch(`${CLOB_API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body || undefined,
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`CLOB API error (${resp.status}): ${text}`)
    }

    return resp.json() as Promise<T>
  }
}

/**
 * Analyze a raw orderbook — computes spread, depth, midpoint, and imbalance.
 */
export function analyzeOrderbook(book: Orderbook): OrderbookAnalysis {
  const bids = book.bids.map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
  const asks = book.asks.map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))

  const bestBid = bids.length > 0 ? Math.max(...bids.map((b) => b.price)) : 0
  const bestAsk = asks.length > 0 ? Math.min(...asks.map((a) => a.price)) : 1

  const spread = bestAsk - bestBid
  const midpoint = (bestBid + bestAsk) / 2
  const spreadBps = midpoint > 0 ? Math.round((spread / midpoint) * 10000) : 0

  // Depth = total USDC value on each side (price * size)
  const bidDepthUsdc = bids.reduce((sum, b) => sum + b.price * b.size, 0)
  const askDepthUsdc = asks.reduce((sum, a) => sum + a.price * a.size, 0)

  // Imbalance: positive = more bid pressure, negative = more ask pressure
  const totalDepth = bidDepthUsdc + askDepthUsdc
  const imbalance = totalDepth > 0 ? (bidDepthUsdc - askDepthUsdc) / totalDepth : 0

  return {
    bestBid,
    bestAsk,
    spread,
    spreadBps,
    midpoint,
    bidDepthUsdc: Math.round(bidDepthUsdc * 100) / 100,
    askDepthUsdc: Math.round(askDepthUsdc * 100) / 100,
    imbalance: Math.round(imbalance * 1000) / 1000,
    levels: {
      bids: bids.length,
      asks: asks.length,
    },
  }
}
