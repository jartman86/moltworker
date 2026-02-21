/**
 * Polymarket API response types
 */

/** Market from Gamma API (/markets) */
export interface GammaMarket {
  id: string
  question: string
  conditionId: string
  slug: string
  description: string
  outcomes: string[]
  outcomePrices: string // JSON string of number array, e.g. '["0.65","0.35"]'
  clobTokenIds: string // JSON string of string array
  volume: number
  liquidity: number
  startDate: string
  endDate: string
  active: boolean
  closed: boolean
  archived: boolean
  new: boolean
  featured: boolean
  restricted: boolean
  groupItemTitle?: string
  groupItemThreshold?: string
  image?: string
  icon?: string
  category?: string
  tags?: string[]
  events?: GammaEvent[]
}

/** Event from Gamma API (/events) */
export interface GammaEvent {
  id: string
  title: string
  slug: string
  description: string
  markets: GammaMarket[]
  startDate: string
  endDate: string
  volume: number
  liquidity: number
  competitive: number
}

/** CLOB market detail */
export interface ClobMarket {
  condition_id: string
  question_id: string
  tokens: ClobToken[]
  min_incentive_size: string
  max_incentive_size: string
  max_incentive_spread: string
  active: boolean
  closed: boolean
  accepting_orders: boolean
  accepting_order_timestamp: string
  minimum_order_size: string
  minimum_tick_size: string
  neg_risk: boolean
  neg_risk_market_id?: string
  neg_risk_request_id?: string
  icon?: string
  description?: string
  end_date_iso?: string
  game_start_time?: string
  question?: string
  market_slug?: string
  rewards?: ClobReward
}

export interface ClobToken {
  token_id: string
  outcome: string
  price: string
  winner: boolean
}

export interface ClobReward {
  min_size: number
  max_spread: number
  event_start_date: string
  event_end_date: string
  in_game_multiplier: number
  reward_epoch: number
}

/** Orderbook from CLOB /book endpoint */
export interface Orderbook {
  market: string
  asset_id: string
  hash: string
  timestamp: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
}

export interface OrderbookLevel {
  price: string
  size: string
}

/** Computed orderbook analysis */
export interface OrderbookAnalysis {
  bestBid: number
  bestAsk: number
  spread: number
  spreadBps: number
  midpoint: number
  bidDepthUsdc: number
  askDepthUsdc: number
  imbalance: number // positive = more bids, negative = more asks
  levels: {
    bids: number
    asks: number
  }
}

/** Position from Data API */
export interface DataApiPosition {
  asset: string
  conditionId: string
  curPrice: string
  currentValue: string
  initialValue: string
  outcomeIndex: string
  pnl: string
  position: string
  proxyWallet: string
  realizedPnl: string
  size: string
  title: string
}

/** Balance/allowance from authenticated CLOB */
export interface BalanceAllowance {
  balance: string
  allowance: string
}

/** Order from authenticated CLOB */
export interface ClobOrder {
  id: string
  status: string
  market: string
  asset_id: string
  side: string
  original_size: string
  size_matched: string
  price: string
  type: string
  created_at: number
  expiration: number
}

/** Trade from authenticated CLOB */
export interface ClobTrade {
  id: string
  status: string
  market: string
  asset_id: string
  side: string
  size: string
  fee_rate_bps: string
  price: string
  type: string
  match_time: string
  trader_side: string
}
