---
name: polymarket-trading
description: "Quant-grade Polymarket prediction market trading system — complete API surface, risk management, execution engine, position sizing, circuit breakers, calibration tracking, and autonomous agent loop architecture"
---

# BIG EARN v2: Hardened AI Prediction Market Agent
## Quant-Grade Architecture & Development Prompt

---

You are building "Big Earn," an autonomous AI agent that trades on the Polymarket prediction market. This is the hardened production architecture with institutional-grade risk management, execution analytics, state persistence, and strategy validation. Every component has been designed to survive scrutiny from professional quantitative traders.

Big Earn operates on a continuous loop: SCAN markets, EVALUATE opportunities, DECIDE positions, EXECUTE trades, and MONITOR outcomes. This prompt contains the complete API surface, architecture, and operational rules.

---

# PART I: INFRASTRUCTURE

---

## 1. ENVIRONMENT SETUP

### Dependencies
```bash
pip install py-clob-client requests websocket-client python-dotenv sqlalchemy psycopg2-binary numpy scipy schedule web3
```

### Environment Variables (.env)
```bash
# === WALLET ===
PRIVATE_KEY=0x...
WALLET_ADDRESS=0x...
SIGNATURE_TYPE=2                # 0=EOA, 1=POLY_PROXY, 2=GNOSIS_SAFE

# === RISK LIMITS ===
MAX_PORTFOLIO_USDC=1000         # Total bankroll cap
MAX_SINGLE_POSITION_PCT=0.10    # Max 10% of bankroll per position
MAX_OPEN_POSITIONS=10           # Max concurrent positions
MIN_EDGE_THRESHOLD=0.05         # Minimum edge after spread/fees (5%)
MIN_LIQUIDITY_USDC=5000         # Don't trade markets with less than this in orderbook depth
MAX_BOOK_IMPACT_PCT=0.02        # Max 2% of visible book depth per order
KELLY_FRACTION=0.25             # Quarter-Kelly (conservative)

# === CIRCUIT BREAKERS ===
MAX_DAILY_LOSS_PCT=0.05         # -5% daily drawdown = halt
MAX_WEEKLY_LOSS_PCT=0.10        # -10% weekly drawdown = halt
MAX_CONSECUTIVE_LOSSES=5        # 5 consecutive losing trades = pause and review
COOLDOWN_MINUTES=60             # Cooldown period after circuit breaker trips

# === EXECUTION ===
MAX_SLIPPAGE_BPS=50             # Max acceptable slippage (50 bps = 0.5%)
STALE_ORDER_SECONDS=3600        # Cancel orders older than 1 hour
MIN_FILL_RATE=0.60              # If fill rate drops below 60%, adjust pricing strategy

# === MODE ===
TRADING_MODE=paper              # "paper" or "live" - paper mode logs but doesn't submit orders
DATABASE_URL=sqlite:///big_earn.db  # SQLite for dev, Postgres for prod

# === AGENT ===
CYCLE_INTERVAL_SECONDS=300      # Run main loop every 5 minutes
RECONCILIATION_INTERVAL=900     # Reconcile state every 15 minutes
PNL_SNAPSHOT_INTERVAL=3600      # P&L snapshot every hour
```

### Wallet Requirements
- **USDC.e** on Polygon mainnet (for buying outcome tokens)
- **POL** on Polygon mainnet (for gas, if using EOA signature_type=0)
- Chain ID: 137 (Polygon mainnet)

---

## 2. STATE PERSISTENCE LAYER

Every professional trading system persists state. If the process crashes, you must recover without data loss or position ambiguity.

### Database Schema
```python
from sqlalchemy import (
    create_engine, Column, String, Float, Integer, Boolean,
    DateTime, Text, Enum, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
import enum
import os

Base = declarative_base()

class TradeDirection(enum.Enum):
    BUY = "BUY"
    SELL = "SELL"

class OrderStatus(enum.Enum):
    PENDING = "PENDING"
    LIVE = "LIVE"
    MATCHED = "MATCHED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    FAILED = "FAILED"

class PositionStatus(enum.Enum):
    OPEN = "OPEN"
    CLOSED_SOLD = "CLOSED_SOLD"
    CLOSED_RESOLVED_WIN = "CLOSED_RESOLVED_WIN"
    CLOSED_RESOLVED_LOSS = "CLOSED_RESOLVED_LOSS"
    CLOSED_REDEEMED = "CLOSED_REDEEMED"

class CircuitBreakerEvent(enum.Enum):
    DAILY_LOSS = "DAILY_LOSS"
    WEEKLY_LOSS = "WEEKLY_LOSS"
    CONSECUTIVE_LOSSES = "CONSECUTIVE_LOSSES"
    MANUAL_HALT = "MANUAL_HALT"


class Market(Base):
    """Cache of market metadata."""
    __tablename__ = "markets"

    condition_id = Column(String, primary_key=True)
    question = Column(Text)
    slug = Column(String)
    description = Column(Text)
    yes_token_id = Column(String, nullable=False)
    no_token_id = Column(String, nullable=False)
    tick_size = Column(String, default="0.01")
    neg_risk = Column(Boolean, default=False)
    end_date = Column(DateTime)
    tags = Column(Text)  # JSON array as string
    min_order_size = Column(Float, default=1.0)
    maker_fee_bps = Column(Integer, default=0)
    taker_fee_bps = Column(Integer, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    orders = relationship("Order", back_populates="market_rel")
    positions = relationship("Position", back_populates="market_rel")
    evaluations = relationship("MarketEvaluation", back_populates="market_rel")


class Order(Base):
    """Every order placed, with full lifecycle tracking."""
    __tablename__ = "orders"

    id = Column(String, primary_key=True)  # Polymarket order ID
    condition_id = Column(String, ForeignKey("markets.condition_id"))
    token_id = Column(String, nullable=False)
    side = Column(Enum(TradeDirection), nullable=False)
    order_type = Column(String)  # GTC, GTD, FOK, FAK
    price_intended = Column(Float, nullable=False)     # Price we wanted
    price_filled = Column(Float)                        # Actual avg fill price
    size_intended = Column(Float, nullable=False)       # Shares we wanted
    size_filled = Column(Float, default=0.0)            # Shares actually filled
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING)
    post_only = Column(Boolean, default=False)
    slippage_bps = Column(Float)                        # Calculated after fill
    created_at = Column(DateTime, default=datetime.utcnow)
    filled_at = Column(DateTime)
    cancelled_at = Column(DateTime)
    error_msg = Column(Text)
    book_depth_at_entry = Column(Float)  # Total book depth when order was placed
    spread_at_entry = Column(Float)      # Spread when order was placed

    market_rel = relationship("Market", back_populates="orders")


class Position(Base):
    """Aggregated position per market outcome."""
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    condition_id = Column(String, ForeignKey("markets.condition_id"))
    token_id = Column(String, nullable=False)
    outcome = Column(String)  # "Yes" or "No"
    side = Column(Enum(TradeDirection))
    shares = Column(Float, default=0.0)
    avg_entry_price = Column(Float, default=0.0)
    cost_basis = Column(Float, default=0.0)        # Total dollars spent
    current_price = Column(Float, default=0.0)
    current_value = Column(Float, default=0.0)
    unrealized_pnl = Column(Float, default=0.0)
    realized_pnl = Column(Float, default=0.0)
    status = Column(Enum(PositionStatus), default=PositionStatus.OPEN)
    correlation_group = Column(String)  # For tracking correlated positions
    opened_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime)
    redeemed_at = Column(DateTime)
    redeemable = Column(Boolean, default=False)

    market_rel = relationship("Market", back_populates="positions")

    __table_args__ = (
        UniqueConstraint("condition_id", "token_id", "status",
                         name="uq_active_position"),
    )


class Trade(Base):
    """Individual fill events."""
    __tablename__ = "trades"

    id = Column(String, primary_key=True)  # Polymarket trade ID
    order_id = Column(String, ForeignKey("orders.id"))
    condition_id = Column(String)
    token_id = Column(String)
    side = Column(Enum(TradeDirection))
    price = Column(Float, nullable=False)
    size = Column(Float, nullable=False)
    fee_bps = Column(Integer, default=0)
    trader_side = Column(String)  # "MAKER" or "TAKER"
    transaction_hash = Column(String)
    matched_at = Column(DateTime)
    confirmed_at = Column(DateTime)


class MarketEvaluation(Base):
    """Record of every probability estimate for calibration tracking."""
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    condition_id = Column(String, ForeignKey("markets.condition_id"))
    estimated_probability = Column(Float, nullable=False)
    confidence_lower = Column(Float)     # Lower bound of confidence interval
    confidence_upper = Column(Float)     # Upper bound of confidence interval
    market_price_at_eval = Column(Float, nullable=False)
    edge = Column(Float)
    spread_at_eval = Column(Float)
    liquidity_at_eval = Column(Float)
    signal_sources = Column(Text)        # JSON: which signals contributed
    decision = Column(String)            # "TRADE", "SKIP_NO_EDGE", "SKIP_RISK", etc.
    actual_outcome = Column(Float)       # Filled in after resolution (1.0 or 0.0)
    evaluated_at = Column(DateTime, default=datetime.utcnow)

    market_rel = relationship("Market", back_populates="evaluations")


class PnlSnapshot(Base):
    """Periodic portfolio snapshots for drawdown tracking."""
    __tablename__ = "pnl_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    usdc_balance = Column(Float)
    total_position_value = Column(Float)
    total_portfolio_value = Column(Float)     # usdc + positions
    unrealized_pnl = Column(Float)
    realized_pnl_cumulative = Column(Float)
    num_open_positions = Column(Integer)
    num_open_orders = Column(Integer)
    high_water_mark = Column(Float)           # All-time portfolio high
    drawdown_from_hwm = Column(Float)         # Current drawdown %
    daily_pnl = Column(Float)
    weekly_pnl = Column(Float)


class CircuitBreakerLog(Base):
    """Log of every circuit breaker trip."""
    __tablename__ = "circuit_breaker_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(Enum(CircuitBreakerEvent))
    trigger_value = Column(Float)        # The value that triggered it
    threshold = Column(Float)            # The threshold that was breached
    action_taken = Column(String)        # "HALT_TRADING", "CANCEL_ALL", etc.
    resumed_at = Column(DateTime)
    triggered_at = Column(DateTime, default=datetime.utcnow)


class ExecutionMetrics(Base):
    """Aggregated execution quality metrics per time period."""
    __tablename__ = "execution_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    period_start = Column(DateTime)
    period_end = Column(DateTime)
    orders_placed = Column(Integer, default=0)
    orders_filled = Column(Integer, default=0)
    orders_partially_filled = Column(Integer, default=0)
    orders_cancelled = Column(Integer, default=0)
    fill_rate = Column(Float)                  # orders_filled / orders_placed
    avg_slippage_bps = Column(Float)
    max_slippage_bps = Column(Float)
    avg_time_to_fill_seconds = Column(Float)
    total_volume_usdc = Column(Float)
    total_fees_usdc = Column(Float)


# Initialize database
engine = create_engine(os.getenv("DATABASE_URL", "sqlite:///big_earn.db"))
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
```

---

## 3. CLIENT INITIALIZATION

```python
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import ApiCreds, BalanceAllowanceParams, AssetType
import os
from dotenv import load_dotenv

load_dotenv()

host = "https://clob.polymarket.com"
chain_id = 137
private_key = os.getenv("PRIVATE_KEY")
sig_type = int(os.getenv("SIGNATURE_TYPE", "2"))
funder = os.getenv("WALLET_ADDRESS")

# Step 1: Derive API credentials (L1 auth)
temp_client = ClobClient(host, key=private_key, chain_id=chain_id)
api_creds = temp_client.create_or_derive_api_creds()

# Step 2: Initialize authenticated trading client (L2 auth)
client = ClobClient(
    host,
    key=private_key,
    chain_id=chain_id,
    creds=api_creds,
    signature_type=sig_type,
    funder=funder,
)

# Store credentials for WebSocket auth
ws_auth = {
    "apiKey": api_creds.api_key,
    "secret": api_creds.api_secret,
    "passphrase": api_creds.api_passphrase,
}
```

**Authentication Model:**
- L1 (Private Key): Signs EIP-712 messages. Creates/derives API credentials, signs orders locally. Non-custodial.
- L2 (API Key): Uses apiKey + secret + passphrase for HMAC-SHA256 headers. Posts orders, cancels, queries.
- All 5 `POLY_*` headers required: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_API_KEY, POLY_PASSPHRASE.
- The SDK handles header construction automatically.

---

## 4. RATE LIMITER

Polymarket uses Cloudflare throttling (queues, doesn't reject). Still: respect limits to avoid degraded performance.

```python
import time
from collections import defaultdict
from threading import Lock

class RateLimiter:
    """Thread-safe rate limiter matching Polymarket's documented limits."""

    LIMITS = {
        # (max_requests, window_seconds)
        "order_place":       (60, 10),     # POST /order sustained
        "order_place_burst": (500, 10),    # POST /order burst
        "order_cancel":      (50, 10),     # DELETE /order sustained
        "order_batch":       (25, 10),     # POST /orders sustained
        "cancel_all":        (10, 10),     # DELETE /cancel-all sustained
        "book":              (150, 10),    # GET /book
        "price":             (150, 10),    # GET /price, /midprice
        "ledger":            (90, 10),     # GET /trades, /orders, /notifications
        "positions":         (15, 10),     # Data API /positions
        "markets_gamma":     (30, 10),     # Gamma /markets
        "balance":           (20, 10),     # GET balance/allowance
    }

    def __init__(self):
        self._calls = defaultdict(list)
        self._lock = Lock()

    def wait_and_record(self, endpoint_type):
        limit, window = self.LIMITS.get(endpoint_type, (100, 10))
        while True:
            with self._lock:
                now = time.time()
                self._calls[endpoint_type] = [
                    t for t in self._calls[endpoint_type] if now - t < window
                ]
                if len(self._calls[endpoint_type]) < limit:
                    self._calls[endpoint_type].append(now)
                    return
            time.sleep(0.05)

rate_limiter = RateLimiter()
```

---

# PART II: MARKET INTELLIGENCE

---

## 5. SCAN: MARKET DISCOVERY

### Fetch Active Markets (Public, No Auth)
```python
import requests

def fetch_active_markets(limit=100, tag=None):
    """Fetch active, open markets from Gamma API."""
    rate_limiter.wait_and_record("markets_gamma")
    params = {"active": "true", "closed": "false", "limit": limit}
    if tag:
        params["tag"] = tag
    response = requests.get(
        "https://gamma-api.polymarket.com/markets", params=params
    )
    response.raise_for_status()
    return response.json()
```

Each market returns:
- `question`: The prediction question
- `conditionId`: Unique market identifier (used for CLOB operations)
- `clobTokenIds`: JSON string of [YES_token_id, NO_token_id]
- `outcomePrices`: Current prices as comma-separated string
- `volume`, `liquidity`: Market depth indicators
- `endDate`: When market closes
- `description`: Resolution criteria (read this before trading)
- `tags`: Category tags

### Fetch Events (Grouped Markets)
```python
def fetch_events(limit=50):
    rate_limiter.wait_and_record("markets_gamma")
    response = requests.get(
        "https://gamma-api.polymarket.com/events",
        params={"active": "true", "closed": "false", "limit": limit}
    )
    response.raise_for_status()
    return response.json()
```

### Search Markets
```python
def search_markets(query, limit=20):
    rate_limiter.wait_and_record("markets_gamma")
    response = requests.get(
        "https://gamma-api.polymarket.com/search",
        params={"query": query, "limit": limit}
    )
    response.raise_for_status()
    return response.json()
```

### Fetch Market Detail from CLOB (Public)
```python
def get_market_params(condition_id):
    """Fetch tick_size, neg_risk, and other params. Required before every order."""
    rate_limiter.wait_and_record("book")
    market = client.get_market(condition_id)
    return {
        "tick_size": str(market["minimum_tick_size"]),
        "neg_risk": market["neg_risk"],
        "accepting_orders": market["accepting_orders"],
        "min_order_size": market.get("minimum_order_size", 1),
        "maker_fee_bps": market.get("maker_base_fee", 0),
        "taker_fee_bps": market.get("taker_base_fee", 0),
    }
```

### Cache Markets in Database
```python
import json

def cache_market(session, raw_market):
    """Upsert market data into local database."""
    token_ids = json.loads(raw_market.get("clobTokenIds", "[]"))
    if len(token_ids) < 2:
        return None

    existing = session.get(Market, raw_market["conditionId"])
    if existing:
        existing.question = raw_market.get("question")
        existing.last_updated = datetime.utcnow()
        return existing

    m = Market(
        condition_id=raw_market["conditionId"],
        question=raw_market.get("question"),
        slug=raw_market.get("slug"),
        description=raw_market.get("description"),
        yes_token_id=token_ids[0],
        no_token_id=token_ids[1],
        tags=raw_market.get("tags"),
        end_date=raw_market.get("endDate"),
    )
    session.merge(m)
    return m
```

---

## 6. EVALUATE: PRICE, ORDERBOOK & MICROSTRUCTURE ANALYSIS

### Get Orderbook with Depth Analysis (Public, No Auth)
```python
def get_orderbook_analysis(token_id):
    """Fetch orderbook and compute microstructure metrics."""
    rate_limiter.wait_and_record("book")
    book = client.get_order_book(token_id=token_id)

    bids = [(float(l["price"]), float(l["size"])) for l in book.get("bids", [])]
    asks = [(float(l["price"]), float(l["size"])) for l in book.get("asks", [])]

    best_bid = bids[0][0] if bids else 0
    best_ask = asks[0][0] if asks else 1
    spread = best_ask - best_bid
    midpoint = (best_bid + best_ask) / 2

    # Total depth within 5% of midpoint
    bid_depth = sum(s for p, s in bids if p >= midpoint * 0.95)
    ask_depth = sum(s for p, s in asks if p <= midpoint * 1.05)
    total_depth_usdc = (bid_depth * midpoint) + (ask_depth * midpoint)

    # Depth imbalance (positive = more buy pressure)
    imbalance = (bid_depth - ask_depth) / max(bid_depth + ask_depth, 1)

    return {
        "best_bid": best_bid,
        "best_ask": best_ask,
        "spread": spread,
        "spread_bps": (spread / midpoint * 10000) if midpoint > 0 else 0,
        "midpoint": midpoint,
        "bid_depth_shares": bid_depth,
        "ask_depth_shares": ask_depth,
        "total_depth_usdc": total_depth_usdc,
        "imbalance": imbalance,
        "tick_size": book.get("tick_size", "0.01"),
        "neg_risk": book.get("neg_risk", False),
        "bids": bids,
        "asks": asks,
    }
```

### Estimate Market Impact
```python
def estimate_market_impact(book_analysis, order_size_shares, side="BUY"):
    """
    Walk the book to estimate effective fill price and slippage.
    This is how you know BEFORE placing an order what it will cost.
    """
    levels = book_analysis["asks"] if side == "BUY" else book_analysis["bids"]
    if not levels:
        return {"can_fill": False, "reason": "Empty book"}

    remaining = order_size_shares
    total_cost = 0.0
    levels_consumed = 0

    for price, size in levels:
        fill_at_level = min(remaining, size)
        total_cost += fill_at_level * price
        remaining -= fill_at_level
        levels_consumed += 1
        if remaining <= 0:
            break

    if remaining > 0:
        return {"can_fill": False, "reason": f"Insufficient liquidity. {remaining:.1f} shares unfillable"}

    effective_price = total_cost / order_size_shares
    reference_price = book_analysis["best_ask"] if side == "BUY" else book_analysis["best_bid"]
    slippage_bps = abs(effective_price - reference_price) / reference_price * 10000

    # What % of visible depth are we consuming?
    depth = book_analysis["ask_depth_shares"] if side == "BUY" else book_analysis["bid_depth_shares"]
    book_impact_pct = order_size_shares / max(depth, 1)

    return {
        "can_fill": True,
        "effective_price": round(effective_price, 6),
        "reference_price": reference_price,
        "slippage_bps": round(slippage_bps, 2),
        "levels_consumed": levels_consumed,
        "book_impact_pct": round(book_impact_pct, 4),
        "total_cost": round(total_cost, 2),
    }
```

### Get Price History (Public, No Auth)
```python
def get_price_history(token_id, interval="1d"):
    rate_limiter.wait_and_record("price")
    history = client.get_prices_history({
        "market": token_id,
        "interval": interval,  # "max", "1w", "1d", "6h", "1h"
    })
    return history  # [{"t": timestamp, "p": price}, ...]
```

### Get Last Trade Price
```python
def get_last_trade(token_id):
    rate_limiter.wait_and_record("price")
    return client.get_last_trade_price(token_id=token_id)
    # {"price": "0.51", "side": "BUY"}
```

---

## 7. THE BRAIN: PROBABILITY ESTIMATION & CALIBRATION

This is where Big Earn's intelligence lives. The Brain outputs a **probability distribution**, not a point estimate.

### Probability Estimate Structure
```python
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class ProbabilityEstimate:
    """Every estimate includes uncertainty bounds and signal provenance."""
    point_estimate: float       # Best guess (0.0 to 1.0)
    confidence_lower: float     # 90% CI lower bound
    confidence_upper: float     # 90% CI upper bound
    signal_sources: List[str]   # ["llm_analysis", "polling_data", "historical_base_rate"]
    confidence_level: str       # "high", "medium", "low"
    reasoning: str              # Brief explanation for audit trail

    @property
    def uncertainty_width(self):
        return self.confidence_upper - self.confidence_lower

    @property
    def is_actionable(self):
        """Estimates with very wide CIs are not actionable."""
        return self.uncertainty_width < 0.40  # Don't trade if CI spans 40%+
```

### Brain Interface (Plug Your Strategy Here)
```python
class BaseBrain:
    """Abstract interface. Implement your strategy by subclassing."""

    def estimate_probability(self, market, book_analysis, price_history) -> ProbabilityEstimate:
        raise NotImplementedError

    def should_exit(self, position, current_price, book_analysis) -> tuple:
        """Returns (should_exit: bool, reason: str)"""
        raise NotImplementedError


class LLMBrain(BaseBrain):
    """Example: LLM-based probability estimation."""

    def estimate_probability(self, market, book_analysis, price_history):
        # Feed market question + description + recent news to LLM
        # Parse response into structured estimate
        # YOUR IMPLEMENTATION HERE
        pass

    def should_exit(self, position, current_price, book_analysis):
        # Re-evaluate thesis. Has the edge disappeared?
        # YOUR IMPLEMENTATION HERE
        pass


class RulesBasedBrain(BaseBrain):
    """Example: Rules engine for specific market types."""

    def estimate_probability(self, market, book_analysis, price_history):
        # Apply predefined rules based on market category
        # YOUR IMPLEMENTATION HERE
        pass

    def should_exit(self, position, current_price, book_analysis):
        pass


class EnsembleBrain(BaseBrain):
    """Combine multiple signals with weights."""

    def __init__(self, brains_with_weights):
        # [(brain_instance, weight), ...]
        self.brains = brains_with_weights

    def estimate_probability(self, market, book_analysis, price_history):
        estimates = []
        sources = []
        for brain, weight in self.brains:
            est = brain.estimate_probability(market, book_analysis, price_history)
            estimates.append((est.point_estimate, weight))
            sources.extend(est.signal_sources)

        total_weight = sum(w for _, w in estimates)
        weighted_avg = sum(e * w for e, w in estimates) / total_weight

        return ProbabilityEstimate(
            point_estimate=weighted_avg,
            confidence_lower=max(0, weighted_avg - 0.15),
            confidence_upper=min(1, weighted_avg + 0.15),
            signal_sources=list(set(sources)),
            confidence_level="medium",
            reasoning=f"Ensemble of {len(self.brains)} models",
        )

    def should_exit(self, position, current_price, book_analysis):
        pass
```

### Calibration Tracker (Brier Score)
```python
import numpy as np

class CalibrationTracker:
    """
    Tracks how well your probability estimates match reality.
    A perfectly calibrated model has Brier score of 0.
    Random guessing (0.5 for everything) scores 0.25.
    """

    def __init__(self, session):
        self.session = session

    def record_evaluation(self, condition_id, estimate: ProbabilityEstimate, market_price):
        eval_record = MarketEvaluation(
            condition_id=condition_id,
            estimated_probability=estimate.point_estimate,
            confidence_lower=estimate.confidence_lower,
            confidence_upper=estimate.confidence_upper,
            market_price_at_eval=market_price,
            edge=estimate.point_estimate - market_price,
            signal_sources=json.dumps(estimate.signal_sources),
            decision="PENDING",
        )
        self.session.add(eval_record)
        self.session.commit()
        return eval_record

    def record_resolution(self, condition_id, actual_outcome):
        """Call when market resolves. actual_outcome = 1.0 (Yes) or 0.0 (No)."""
        evals = self.session.query(MarketEvaluation).filter_by(
            condition_id=condition_id, actual_outcome=None
        ).all()
        for e in evals:
            e.actual_outcome = actual_outcome
        self.session.commit()

    def brier_score(self, lookback_days=None):
        """Lower is better. 0 = perfect, 0.25 = random."""
        query = self.session.query(MarketEvaluation).filter(
            MarketEvaluation.actual_outcome.isnot(None)
        )
        if lookback_days:
            from datetime import timedelta
            cutoff = datetime.utcnow() - timedelta(days=lookback_days)
            query = query.filter(MarketEvaluation.evaluated_at >= cutoff)

        evals = query.all()
        if not evals:
            return None

        scores = [(e.estimated_probability - e.actual_outcome) ** 2 for e in evals]
        return np.mean(scores)

    def calibration_curve(self, n_bins=10):
        """
        Group predictions into bins (0-10%, 10-20%, etc.)
        and compare predicted probability to actual frequency.
        """
        evals = self.session.query(MarketEvaluation).filter(
            MarketEvaluation.actual_outcome.isnot(None)
        ).all()

        if not evals:
            return []

        bins = np.linspace(0, 1, n_bins + 1)
        results = []
        for i in range(n_bins):
            low, high = bins[i], bins[i + 1]
            in_bin = [e for e in evals if low <= e.estimated_probability < high]
            if in_bin:
                avg_predicted = np.mean([e.estimated_probability for e in in_bin])
                avg_actual = np.mean([e.actual_outcome for e in in_bin])
                results.append({
                    "bin": f"{low:.1f}-{high:.1f}",
                    "count": len(in_bin),
                    "avg_predicted": round(avg_predicted, 3),
                    "avg_actual": round(avg_actual, 3),
                    "gap": round(abs(avg_predicted - avg_actual), 3),
                })
        return results

    def log_loss(self):
        """Alternative scoring metric. More punishing of confident wrong predictions."""
        evals = self.session.query(MarketEvaluation).filter(
            MarketEvaluation.actual_outcome.isnot(None)
        ).all()
        if not evals:
            return None

        eps = 1e-10
        losses = []
        for e in evals:
            p = np.clip(e.estimated_probability, eps, 1 - eps)
            y = e.actual_outcome
            losses.append(-(y * np.log(p) + (1 - y) * np.log(1 - p)))
        return np.mean(losses)
```

---

# PART III: RISK MANAGEMENT

---

## 8. POSITION SIZING WITH SPREAD & LIQUIDITY ADJUSTMENT

```python
class PositionSizer:
    """
    Kelly-based sizing adjusted for:
    - Estimation uncertainty (wider CI = smaller position)
    - Spread cost (edge must exceed spread)
    - Liquidity constraints (don't consume too much book)
    - Portfolio concentration limits
    """

    def __init__(self):
        self.max_portfolio = float(os.getenv("MAX_PORTFOLIO_USDC", "1000"))
        self.max_single_pct = float(os.getenv("MAX_SINGLE_POSITION_PCT", "0.10"))
        self.kelly_fraction = float(os.getenv("KELLY_FRACTION", "0.25"))
        self.min_edge = float(os.getenv("MIN_EDGE_THRESHOLD", "0.05"))
        self.max_book_impact = float(os.getenv("MAX_BOOK_IMPACT_PCT", "0.02"))

    def calculate(self, estimate: ProbabilityEstimate, book_analysis: dict,
                  current_exposure: float, correlation_exposure: float = 0) -> dict:
        """
        Returns sizing decision with full reasoning.
        """
        market_price = book_analysis["midpoint"]
        spread = book_analysis["spread"]
        spread_bps = book_analysis["spread_bps"]
        total_depth_usdc = book_analysis["total_depth_usdc"]

        # === Gate 1: Is the estimate actionable? ===
        if not estimate.is_actionable:
            return {"approved": False, "reason": "Confidence interval too wide",
                    "ci_width": estimate.uncertainty_width}

        # === Gate 2: Edge after spread ===
        raw_edge = estimate.point_estimate - market_price
        # You pay half the spread on entry and half on exit
        spread_cost = spread
        net_edge = abs(raw_edge) - spread_cost

        if net_edge < self.min_edge:
            return {"approved": False, "reason": f"Net edge {net_edge:.3f} < threshold {self.min_edge}",
                    "raw_edge": raw_edge, "spread_cost": spread_cost}

        # === Gate 3: Sufficient liquidity ===
        min_liquidity = float(os.getenv("MIN_LIQUIDITY_USDC", "5000"))
        if total_depth_usdc < min_liquidity:
            return {"approved": False, "reason": f"Book depth ${total_depth_usdc:.0f} < min ${min_liquidity:.0f}"}

        # === Gate 4: Kelly sizing ===
        # Use lower bound of CI for conservative edge estimate
        if raw_edge > 0:
            conservative_edge = estimate.confidence_lower - market_price
        else:
            conservative_edge = market_price - estimate.confidence_upper

        conservative_edge = max(conservative_edge, 0.001)  # Floor at tiny positive

        # Kelly formula: f = edge / (1 - price) for binary outcomes
        denom = (1 - market_price) if raw_edge > 0 else market_price
        kelly_full = conservative_edge / max(denom, 0.01)
        kelly_sized = kelly_full * self.kelly_fraction  # Quarter-Kelly

        # === Gate 5: Apply caps ===
        max_single = self.max_portfolio * self.max_single_pct
        available = self.max_portfolio - current_exposure
        position_usdc = min(
            kelly_sized * available,
            max_single,
            available,
        )

        # === Gate 6: Liquidity constraint ===
        max_from_liquidity = total_depth_usdc * self.max_book_impact
        position_usdc = min(position_usdc, max_from_liquidity)

        # === Gate 7: Correlation adjustment ===
        # If we already have exposure to correlated markets, reduce size
        max_correlated = self.max_portfolio * 0.30  # Max 30% in correlated group
        if correlation_exposure + position_usdc > max_correlated:
            position_usdc = max(0, max_correlated - correlation_exposure)
            if position_usdc <= 0:
                return {"approved": False, "reason": "Correlated exposure at limit"}

        # Convert to shares
        shares = position_usdc / market_price if market_price > 0 else 0
        side = "BUY" if raw_edge > 0 else "SELL"

        if position_usdc < 1.0:
            return {"approved": False, "reason": "Position too small after all adjustments"}

        return {
            "approved": True,
            "position_usdc": round(position_usdc, 2),
            "shares": round(shares, 2),
            "side": side,
            "raw_edge": round(raw_edge, 4),
            "net_edge": round(net_edge, 4),
            "spread_cost": round(spread_cost, 4),
            "kelly_full": round(kelly_full, 4),
            "kelly_sized": round(kelly_sized, 4),
            "book_impact_pct": round(position_usdc / max(total_depth_usdc, 1), 4),
        }

sizer = PositionSizer()
```

---

## 9. CIRCUIT BREAKERS

```python
class CircuitBreaker:
    """
    Automatic halt triggers that protect capital during drawdowns.
    Once tripped, all new trading stops and optionally all orders cancel.
    """

    def __init__(self, session):
        self.session = session
        self.max_daily_loss = float(os.getenv("MAX_DAILY_LOSS_PCT", "0.05"))
        self.max_weekly_loss = float(os.getenv("MAX_WEEKLY_LOSS_PCT", "0.10"))
        self.max_consecutive_losses = int(os.getenv("MAX_CONSECUTIVE_LOSSES", "5"))
        self.cooldown_minutes = int(os.getenv("COOLDOWN_MINUTES", "60"))
        self._halted = False
        self._halted_until = None

    @property
    def is_halted(self):
        if self._halted and self._halted_until:
            if datetime.utcnow() >= self._halted_until:
                self._halted = False
                self._halted_until = None
                return False
        return self._halted

    def check_all(self) -> tuple:
        """Returns (is_safe, reason). Run before every trade."""
        if self.is_halted:
            return False, f"Trading halted until {self._halted_until}"

        # Check daily drawdown
        daily_dd = self._get_daily_drawdown()
        if daily_dd is not None and daily_dd > self.max_daily_loss:
            self._trip(CircuitBreakerEvent.DAILY_LOSS, daily_dd, self.max_daily_loss)
            return False, f"Daily loss {daily_dd:.1%} exceeds {self.max_daily_loss:.1%}"

        # Check weekly drawdown
        weekly_dd = self._get_weekly_drawdown()
        if weekly_dd is not None and weekly_dd > self.max_weekly_loss:
            self._trip(CircuitBreakerEvent.WEEKLY_LOSS, weekly_dd, self.max_weekly_loss)
            return False, f"Weekly loss {weekly_dd:.1%} exceeds {self.max_weekly_loss:.1%}"

        # Check consecutive losses
        consec = self._get_consecutive_losses()
        if consec >= self.max_consecutive_losses:
            self._trip(CircuitBreakerEvent.CONSECUTIVE_LOSSES, consec, self.max_consecutive_losses)
            return False, f"{consec} consecutive losses exceeds {self.max_consecutive_losses}"

        return True, "OK"

    def _trip(self, event_type, value, threshold):
        from datetime import timedelta
        self._halted = True
        self._halted_until = datetime.utcnow() + timedelta(minutes=self.cooldown_minutes)

        log_entry = CircuitBreakerLog(
            event_type=event_type,
            trigger_value=value,
            threshold=threshold,
            action_taken="HALT_TRADING",
        )
        self.session.add(log_entry)
        self.session.commit()

    def _get_daily_drawdown(self):
        from datetime import timedelta
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
        snapshots = self.session.query(PnlSnapshot).filter(
            PnlSnapshot.timestamp >= today_start
        ).order_by(PnlSnapshot.timestamp).all()

        if len(snapshots) < 2:
            return None

        start_value = snapshots[0].total_portfolio_value
        current_value = snapshots[-1].total_portfolio_value
        if start_value <= 0:
            return None
        return (start_value - current_value) / start_value

    def _get_weekly_drawdown(self):
        from datetime import timedelta
        week_start = datetime.utcnow() - timedelta(days=7)
        snapshots = self.session.query(PnlSnapshot).filter(
            PnlSnapshot.timestamp >= week_start
        ).order_by(PnlSnapshot.timestamp).all()

        if len(snapshots) < 2:
            return None

        peak = max(s.total_portfolio_value for s in snapshots)
        current = snapshots[-1].total_portfolio_value
        if peak <= 0:
            return None
        return (peak - current) / peak

    def _get_consecutive_losses(self):
        """Count consecutive losing closed positions (most recent first)."""
        positions = self.session.query(Position).filter(
            Position.status.in_([
                PositionStatus.CLOSED_SOLD,
                PositionStatus.CLOSED_RESOLVED_WIN,
                PositionStatus.CLOSED_RESOLVED_LOSS,
                PositionStatus.CLOSED_REDEEMED,
            ])
        ).order_by(Position.closed_at.desc()).limit(self.max_consecutive_losses + 1).all()

        count = 0
        for p in positions:
            if p.realized_pnl < 0:
                count += 1
            else:
                break
        return count

    def manual_halt(self, reason="Manual halt"):
        self._trip(CircuitBreakerEvent.MANUAL_HALT, 0, 0)

    def resume(self):
        self._halted = False
        self._halted_until = None
        latest = self.session.query(CircuitBreakerLog).order_by(
            CircuitBreakerLog.triggered_at.desc()
        ).first()
        if latest and not latest.resumed_at:
            latest.resumed_at = datetime.utcnow()
            self.session.commit()
```

---

## 10. CORRELATION TRACKING

```python
class CorrelationTracker:
    """
    Tracks logical groupings of correlated markets.
    Prevents phantom diversification where 8 "different" positions
    are actually one concentrated directional bet.
    """

    # Define correlation groups by keyword/tag patterns
    CORRELATION_RULES = [
        {"group": "us_politics_trump", "keywords": ["trump", "republican", "gop"]},
        {"group": "us_politics_democrat", "keywords": ["biden", "harris", "democrat"]},
        {"group": "us_election_2026", "keywords": ["midterm", "2026 election", "senate", "house"]},
        {"group": "fed_rates", "keywords": ["fed", "interest rate", "fomc", "federal reserve"]},
        {"group": "crypto_btc", "keywords": ["bitcoin", "btc"]},
        {"group": "crypto_eth", "keywords": ["ethereum", "eth"]},
        {"group": "ai_tech", "keywords": ["openai", "chatgpt", "artificial intelligence", "ai"]},
        {"group": "geopolitics_ukraine", "keywords": ["ukraine", "russia", "zelensky", "putin"]},
        {"group": "geopolitics_china", "keywords": ["china", "taiwan", "xi jinping"]},
    ]

    @classmethod
    def assign_group(cls, market_question: str, market_tags: str = "") -> Optional[str]:
        """Assign a correlation group based on market content."""
        text = (market_question + " " + (market_tags or "")).lower()
        for rule in cls.CORRELATION_RULES:
            if any(kw in text for kw in rule["keywords"]):
                return rule["group"]
        return None

    @classmethod
    def get_correlated_exposure(cls, session, group: str) -> float:
        """Total USDC exposure in a correlation group."""
        if not group:
            return 0
        positions = session.query(Position).filter(
            Position.correlation_group == group,
            Position.status == PositionStatus.OPEN,
        ).all()
        return sum(p.cost_basis for p in positions)
```

---

# PART IV: EXECUTION ENGINE

---

## 11. ORDER MANAGEMENT

### Place Orders with Full Tracking
```python
from py_clob_client.clob_types import OrderArgs, OrderType
from py_clob_client.order_builder.constants import BUY, SELL

TRADING_MODE = os.getenv("TRADING_MODE", "paper")

def place_limit_order(session, condition_id, token_id, price, size_shares,
                      side, book_analysis, order_type="GTC"):
    """
    Place a limit order with pre-flight checks, execution tracking, and paper mode support.
    """
    # Get market params (required for every order)
    params = get_market_params(condition_id)
    if not params["accepting_orders"]:
        return {"success": False, "reason": "Market not accepting orders"}

    # Pre-flight: estimate impact
    impact = estimate_market_impact(book_analysis, size_shares, side)
    max_slippage = int(os.getenv("MAX_SLIPPAGE_BPS", "50"))
    if impact["can_fill"] and impact["slippage_bps"] > max_slippage:
        return {"success": False, "reason": f"Estimated slippage {impact['slippage_bps']} bps > max {max_slippage}"}

    # Record order in DB (pre-submission)
    order_record = Order(
        id=f"pending_{int(time.time()*1000)}",
        condition_id=condition_id,
        token_id=token_id,
        side=TradeDirection.BUY if side == BUY else TradeDirection.SELL,
        order_type=order_type,
        price_intended=price,
        size_intended=size_shares,
        status=OrderStatus.PENDING,
        spread_at_entry=book_analysis["spread"],
        book_depth_at_entry=book_analysis["total_depth_usdc"],
    )

    # === PAPER MODE: Log but don't submit ===
    if TRADING_MODE == "paper":
        order_record.status = OrderStatus.LIVE
        order_record.id = f"paper_{int(time.time()*1000)}"
        session.add(order_record)
        session.commit()
        return {
            "success": True,
            "orderID": order_record.id,
            "status": "paper_live",
            "paper_mode": True,
        }

    # === LIVE MODE: Submit to Polymarket ===
    try:
        rate_limiter.wait_and_record("order_place")

        py_side = BUY if side == BUY else SELL
        ot = getattr(OrderType, order_type)

        response = client.create_and_post_order(
            OrderArgs(
                token_id=token_id,
                price=price,
                size=size_shares,
                side=py_side,
            ),
            options={
                "tick_size": params["tick_size"],
                "neg_risk": params["neg_risk"],
            },
            order_type=ot,
        )

        # Update DB record with actual response
        order_record.id = response.get("orderID", order_record.id)
        order_record.status = OrderStatus.LIVE if response.get("status") == "live" else OrderStatus.MATCHED
        order_record.error_msg = response.get("errorMsg", "")

        if response.get("status") == "matched":
            order_record.price_filled = price  # Approximation; trade events have exact fill
            order_record.size_filled = size_shares
            order_record.filled_at = datetime.utcnow()
            order_record.slippage_bps = 0  # Limit order, filled at our price

        session.add(order_record)
        session.commit()
        return response

    except Exception as e:
        order_record.status = OrderStatus.FAILED
        order_record.error_msg = str(e)
        session.add(order_record)
        session.commit()
        raise


def place_market_order(session, condition_id, token_id, amount, side,
                       book_analysis, worst_price=None):
    """
    Place a market order (FOK). amount = dollars for BUY, shares for SELL.
    """
    params = get_market_params(condition_id)

    if TRADING_MODE == "paper":
        return {
            "success": True,
            "orderID": f"paper_mkt_{int(time.time()*1000)}",
            "status": "paper_matched",
            "paper_mode": True,
        }

    rate_limiter.wait_and_record("order_place")

    order_args = {
        "token_id": token_id,
        "amount": amount,
        "side": BUY if side == "BUY" else SELL,
    }
    if worst_price:
        order_args["price"] = worst_price

    response = client.create_and_post_market_order(
        order_args,
        options={"tick_size": params["tick_size"], "neg_risk": params["neg_risk"]},
        order_type=OrderType.FOK,
    )
    return response
```

### Cancel Orders
```python
def cancel_order(order_id):
    rate_limiter.wait_and_record("order_cancel")
    return client.cancel(order_id=order_id)

def cancel_all_orders():
    rate_limiter.wait_and_record("cancel_all")
    return client.cancel_all()

def cancel_market_orders(condition_id, token_id=None):
    rate_limiter.wait_and_record("order_cancel")
    kwargs = {"market": condition_id}
    if token_id:
        kwargs["asset_id"] = token_id
    return client.cancel_market_orders(**kwargs)
```

### Query Orders & Trades (L2 Auth)
```python
from py_clob_client.clob_types import OpenOrderParams, TradeParams

def get_open_orders(condition_id=None):
    rate_limiter.wait_and_record("ledger")
    params = OpenOrderParams(market=condition_id) if condition_id else None
    return client.get_orders(params)

def get_trade_history(condition_id=None, after=None, before=None):
    rate_limiter.wait_and_record("ledger")
    params = TradeParams(market=condition_id, after=after, before=before)
    return client.get_trades(params)

def get_single_order(order_id):
    rate_limiter.wait_and_record("ledger")
    return client.get_order(order_id=order_id)
```

### Order Types Reference
| Type | Behavior |
|------|----------|
| **GTC** | Good-Til-Cancelled. Rests on book until filled or cancelled. |
| **GTD** | Good-Til-Date. Auto-cancels at expiration (UTC seconds). Add 60s security threshold. |
| **FOK** | Fill-Or-Kill. Must fill entirely or entire order cancels. BUY amount = dollars, SELL amount = shares. |
| **FAK** | Fill-And-Kill. Fills what's available, cancels remainder. |
| **post_only** | GTC/GTD flag. Rejected if it would immediately match. For maker-only strategies. |

---

## 12. BALANCE & POSITION QUERIES

### Check USDC Balance (L2 Auth)
```python
def get_usdc_balance():
    rate_limiter.wait_and_record("balance")
    result = client.get_balance_allowance(
        BalanceAllowanceParams(asset_type=AssetType.COLLATERAL)
    )
    return float(result.get("balance", "0"))

def get_token_balance(token_id):
    rate_limiter.wait_and_record("balance")
    result = client.get_balance_allowance(
        BalanceAllowanceParams(asset_type=AssetType.CONDITIONAL, token_id=token_id)
    )
    return float(result.get("balance", "0"))
```

### Get On-Chain Positions (Public Data API)
```python
def get_live_positions():
    rate_limiter.wait_and_record("positions")
    response = requests.get(
        "https://data-api.polymarket.com/positions",
        params={
            "user": os.getenv("WALLET_ADDRESS"),
            "limit": 500,
            "sortBy": "CURRENT",
            "sortDirection": "DESC",
        }
    )
    response.raise_for_status()
    return response.json()

def get_redeemable_positions():
    rate_limiter.wait_and_record("positions")
    response = requests.get(
        "https://data-api.polymarket.com/positions",
        params={
            "user": os.getenv("WALLET_ADDRESS"),
            "redeemable": "true",
        }
    )
    response.raise_for_status()
    return response.json()

def get_portfolio_value():
    rate_limiter.wait_and_record("positions")
    response = requests.get(
        "https://data-api.polymarket.com/value",
        params={"user": os.getenv("WALLET_ADDRESS")}
    )
    response.raise_for_status()
    return response.json()
```

Position fields from Data API:
```
size, avgPrice, initialValue, currentValue, cashPnl, percentPnl,
realizedPnl, curPrice, redeemable, mergeable, title, outcome,
outcomeIndex, endDate, slug, conditionId, asset
```

### Get Notifications (L2 Auth)
```python
def get_notifications():
    rate_limiter.wait_and_record("ledger")
    return client.get_notifications()
    # Types: 1=Order Cancellation, 2=Order Fill, 4=Market Resolved
    # Auto-deleted after 48 hours

def dismiss_notifications(ids):
    rate_limiter.wait_and_record("ledger")
    client.drop_notifications(ids=ids)
```

---

## 13. RECONCILIATION ENGINE

The single most critical operational component. Your internal state WILL drift from on-chain reality. Reconciliation catches this.

```python
class Reconciler:
    """
    Compares internal database state against on-chain truth.
    Fixes discrepancies. Alerts on anomalies.
    """

    def __init__(self, session):
        self.session = session
        self.discrepancies = []

    def run_full_reconciliation(self):
        """Run all reconciliation checks. Call every 15 minutes."""
        self.discrepancies = []
        self._reconcile_positions()
        self._reconcile_orders()
        self._reconcile_balance()
        return self.discrepancies

    def _reconcile_positions(self):
        """Compare DB positions against Data API positions."""
        live_positions = get_live_positions()
        db_positions = self.session.query(Position).filter(
            Position.status == PositionStatus.OPEN
        ).all()

        # Build lookup from on-chain
        onchain = {}
        for p in live_positions:
            key = p["asset"]
            onchain[key] = p

        # Check each DB position exists on-chain
        for db_pos in db_positions:
            oc = onchain.get(db_pos.token_id)
            if not oc:
                self.discrepancies.append({
                    "type": "PHANTOM_POSITION",
                    "detail": f"DB has open position for {db_pos.token_id} but not found on-chain",
                    "action": "Mark position as closed or investigate",
                })
                continue

            # Check size matches (allow small rounding)
            if abs(db_pos.shares - oc["size"]) > 1.0:
                self.discrepancies.append({
                    "type": "SIZE_MISMATCH",
                    "detail": f"DB: {db_pos.shares} shares, On-chain: {oc['size']} for {db_pos.token_id}",
                    "action": "Update DB to match on-chain",
                })
                db_pos.shares = oc["size"]

            # Update current price and value
            db_pos.current_price = oc.get("curPrice", 0)
            db_pos.current_value = oc.get("currentValue", 0)
            db_pos.unrealized_pnl = oc.get("cashPnl", 0)
            db_pos.redeemable = oc.get("redeemable", False)

            # Remove from lookup
            del onchain[db_pos.token_id]

        # Check for on-chain positions NOT in DB (opened externally or missed)
        for token_id, oc in onchain.items():
            if oc["size"] > 0.5:  # Ignore dust
                self.discrepancies.append({
                    "type": "UNTRACKED_POSITION",
                    "detail": f"On-chain position for {token_id} ({oc.get('title', '?')}) not in DB",
                    "action": "Create DB record",
                })

        self.session.commit()

    def _reconcile_orders(self):
        """Check if orders we think are live are actually still live."""
        db_live = self.session.query(Order).filter(
            Order.status == OrderStatus.LIVE
        ).all()

        if not db_live:
            return

        api_orders = get_open_orders()
        api_order_ids = {o["id"] for o in api_orders}

        for db_order in db_live:
            if db_order.id not in api_order_ids and not db_order.id.startswith("paper_"):
                self.discrepancies.append({
                    "type": "STALE_ORDER_STATE",
                    "detail": f"Order {db_order.id} marked LIVE in DB but not on API",
                    "action": "Mark as filled or cancelled",
                })
                # Assume filled or cancelled
                db_order.status = OrderStatus.CANCELLED
                db_order.cancelled_at = datetime.utcnow()

        self.session.commit()

    def _reconcile_balance(self):
        """Verify USDC balance matches expectations."""
        actual_balance = get_usdc_balance()

        # Get our expected committed amount
        live_orders = self.session.query(Order).filter(
            Order.status == OrderStatus.LIVE,
            Order.side == TradeDirection.BUY,
        ).all()
        committed = sum(
            (o.size_intended - (o.size_filled or 0)) * o.price_intended
            for o in live_orders
            if not o.id.startswith("paper_")
        )

        # Balance should be >= 0 after commitments
        available = actual_balance - committed
        if available < -1.0:  # Allow $1 rounding
            self.discrepancies.append({
                "type": "BALANCE_DEFICIT",
                "detail": f"USDC balance ${actual_balance:.2f} minus committed ${committed:.2f} = ${available:.2f}",
                "action": "Cancel excess orders or investigate",
            })
```

---

## 14. REDEMPTION ENGINE

```python
from web3 import Web3

class RedemptionEngine:
    """
    Monitors for resolved markets and redeems winning tokens.
    Unredeemed winnings are dead capital.
    """

    # Polygon CTF contract
    CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
    USDC_E_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"

    CTF_ABI_REDEEM = [{
        "inputs": [
            {"name": "collateralToken", "type": "address"},
            {"name": "parentCollectionId", "type": "bytes32"},
            {"name": "conditionId", "type": "bytes32"},
            {"name": "indexSets", "type": "uint256[]"}
        ],
        "name": "redeemPositions",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }]

    def __init__(self, session):
        self.session = session
        self.w3 = Web3(Web3.HTTPProvider("https://polygon-rpc.com"))
        self.account = self.w3.eth.account.from_key(os.getenv("PRIVATE_KEY"))

    def check_and_redeem(self):
        """Find all redeemable positions and redeem them."""
        redeemable = get_redeemable_positions()
        results = []

        for pos in redeemable:
            condition_id = pos["conditionId"]
            size = pos["size"]
            value = pos.get("currentValue", size)  # Winning tokens redeem at $1

            if TRADING_MODE == "paper":
                results.append({
                    "condition_id": condition_id,
                    "shares": size,
                    "value": value,
                    "status": "paper_redeemed",
                })
                # Update DB
                db_pos = self.session.query(Position).filter(
                    Position.condition_id == condition_id,
                    Position.status == PositionStatus.OPEN,
                ).first()
                if db_pos:
                    db_pos.status = PositionStatus.CLOSED_REDEEMED
                    db_pos.redeemed_at = datetime.utcnow()
                    db_pos.realized_pnl = value - db_pos.cost_basis
                continue

            # Live mode: execute on-chain redemption
            try:
                tx_hash = self._execute_redemption(condition_id)
                results.append({
                    "condition_id": condition_id,
                    "shares": size,
                    "value": value,
                    "tx_hash": tx_hash,
                    "status": "submitted",
                })

                # Update DB
                db_pos = self.session.query(Position).filter(
                    Position.condition_id == condition_id,
                    Position.status == PositionStatus.OPEN,
                ).first()
                if db_pos:
                    db_pos.status = PositionStatus.CLOSED_REDEEMED
                    db_pos.redeemed_at = datetime.utcnow()
                    db_pos.realized_pnl = value - db_pos.cost_basis

            except Exception as e:
                results.append({
                    "condition_id": condition_id,
                    "status": "error",
                    "error": str(e),
                })

        self.session.commit()
        return results

    def _execute_redemption(self, condition_id):
        """Call redeemPositions on the CTF contract."""
        ctf = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.CTF_ADDRESS),
            abi=self.CTF_ABI_REDEEM,
        )

        # Binary market: index sets [1, 2] (YES=1, NO=2)
        tx = ctf.functions.redeemPositions(
            Web3.to_checksum_address(self.USDC_E_ADDRESS),
            bytes(32),  # parentCollectionId = 0x0 for Polymarket
            bytes.fromhex(condition_id[2:]),  # Remove 0x prefix
            [1, 2],
        ).build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address),
            "gas": 200000,
            "gasPrice": self.w3.eth.gas_price,
        })

        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash.hex()
```

---

## 15. EXECUTION ANALYTICS

```python
class ExecutionAnalytics:
    """
    Tracks execution quality over time.
    Feeds back into order strategy adjustments.
    """

    def __init__(self, session):
        self.session = session

    def record_fill(self, order_id, fill_price, fill_size):
        """Update order with fill data and calculate slippage."""
        order = self.session.get(Order, order_id)
        if not order:
            return

        order.price_filled = fill_price
        order.size_filled = (order.size_filled or 0) + fill_size
        order.filled_at = datetime.utcnow()

        # Calculate slippage
        if order.price_intended and fill_price:
            if order.side == TradeDirection.BUY:
                slippage = (fill_price - order.price_intended) / order.price_intended * 10000
            else:
                slippage = (order.price_intended - fill_price) / order.price_intended * 10000
            order.slippage_bps = round(slippage, 2)

        if order.size_filled >= order.size_intended * 0.99:
            order.status = OrderStatus.MATCHED
        else:
            order.status = OrderStatus.PARTIALLY_FILLED

        self.session.commit()

    def get_execution_summary(self, days=7):
        """Generate execution quality report for the last N days."""
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=days)

        orders = self.session.query(Order).filter(
            Order.created_at >= cutoff,
            ~Order.id.startswith("paper_"),
        ).all()

        if not orders:
            return {"message": "No orders in period"}

        total = len(orders)
        filled = [o for o in orders if o.status in (OrderStatus.MATCHED, OrderStatus.PARTIALLY_FILLED)]
        cancelled = [o for o in orders if o.status == OrderStatus.CANCELLED]
        slippages = [o.slippage_bps for o in filled if o.slippage_bps is not None]

        fill_times = []
        for o in filled:
            if o.filled_at and o.created_at:
                fill_times.append((o.filled_at - o.created_at).total_seconds())

        return {
            "period_days": days,
            "total_orders": total,
            "filled": len(filled),
            "cancelled": len(cancelled),
            "fill_rate": round(len(filled) / max(total, 1), 3),
            "avg_slippage_bps": round(np.mean(slippages), 2) if slippages else None,
            "max_slippage_bps": round(max(slippages), 2) if slippages else None,
            "median_slippage_bps": round(np.median(slippages), 2) if slippages else None,
            "avg_time_to_fill_sec": round(np.mean(fill_times), 1) if fill_times else None,
            "min_fill_rate_threshold": float(os.getenv("MIN_FILL_RATE", "0.60")),
            "fill_rate_healthy": (len(filled) / max(total, 1)) >= float(os.getenv("MIN_FILL_RATE", "0.60")),
        }

    def should_adjust_pricing(self):
        """If fill rate is low, we're pricing too aggressively (too far from market)."""
        summary = self.get_execution_summary(days=3)
        if summary.get("fill_rate") and summary["fill_rate"] < float(os.getenv("MIN_FILL_RATE", "0.60")):
            return True, f"Fill rate {summary['fill_rate']:.1%} below threshold"
        if summary.get("avg_slippage_bps") and summary["avg_slippage_bps"] > float(os.getenv("MAX_SLIPPAGE_BPS", "50")):
            return True, f"Avg slippage {summary['avg_slippage_bps']} bps above threshold"
        return False, "Execution quality OK"
```

---

## 16. WEBSOCKET: REAL-TIME DATA

### Market Channel (Public)
```python
import websocket
import json
import threading

class MarketWebSocket:
    """Real-time orderbook and price updates."""

    URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"

    def __init__(self, on_book=None, on_price_change=None, on_trade=None,
                 on_resolution=None, on_new_market=None):
        self.callbacks = {
            "book": on_book,
            "price_change": on_price_change,
            "last_trade_price": on_trade,
            "market_resolved": on_resolution,
            "new_market": on_new_market,
            "best_bid_ask": on_price_change,
            "tick_size_change": None,
        }
        self.ws = None
        self.subscribed_assets = set()

    def connect(self, asset_ids):
        self.subscribed_assets = set(asset_ids)

        def on_open(ws):
            ws.send(json.dumps({
                "type": "MARKET",
                "assets_ids": list(asset_ids),
                "custom_feature_enabled": True,
            }))

        def on_message(ws, message):
            data = json.loads(message)
            event = data.get("event_type")
            cb = self.callbacks.get(event)
            if cb:
                cb(data)

        def on_error(ws, error):
            print(f"[WS ERROR] {error}")

        def on_close(ws, code, msg):
            print(f"[WS CLOSED] {code}: {msg}")
            time.sleep(5)
            self.connect(self.subscribed_assets)  # Auto-reconnect

        self.ws = websocket.WebSocketApp(
            self.URL,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )
        thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        thread.start()

    def subscribe(self, asset_ids):
        if self.ws:
            self.subscribed_assets.update(asset_ids)
            self.ws.send(json.dumps({
                "assets_ids": list(asset_ids),
                "operation": "subscribe",
            }))

    def unsubscribe(self, asset_ids):
        if self.ws:
            self.subscribed_assets -= set(asset_ids)
            self.ws.send(json.dumps({
                "assets_ids": list(asset_ids),
                "operation": "unsubscribe",
            }))
```

### User Channel (Authenticated)
```python
class UserWebSocket:
    """Real-time order and trade updates for your account."""

    URL = "wss://ws-subscriptions-clob.polymarket.com/ws/user"

    def __init__(self, auth_creds, on_order=None, on_trade=None):
        self.auth = auth_creds
        self.on_order = on_order
        self.on_trade = on_trade
        self.ws = None

    def connect(self, market_ids):
        def on_open(ws):
            ws.send(json.dumps({
                "type": "USER",
                "auth": self.auth,
                "markets": list(market_ids),
            }))

        def on_message(ws, message):
            data = json.loads(message)
            event = data.get("event_type")
            if event == "order" and self.on_order:
                self.on_order(data)
            elif event == "trade" and self.on_trade:
                self.on_trade(data)

        self.ws = websocket.WebSocketApp(
            self.URL,
            on_open=on_open,
            on_message=on_message,
        )
        thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        thread.start()
```

**Market Channel Events:**
| Event | Trigger |
|-------|---------|
| `book` | Initial subscription + any trade affecting the book |
| `price_change` | Order placed or cancelled |
| `last_trade_price` | Maker/taker match |
| `best_bid_ask` | Best bid or ask changes (requires `custom_feature_enabled`) |
| `market_resolved` | Market resolves (requires `custom_feature_enabled`) |
| `new_market` | New market created (requires `custom_feature_enabled`) |
| `tick_size_change` | Price approaches 0.04 or 0.96 |

**User Channel Events:**
| Event | Type Field | Trigger |
|-------|------------|---------|
| `order` | PLACEMENT | Your order placed |
| `order` | UPDATE | Your order partially filled |
| `order` | CANCELLATION | Your order cancelled |
| `trade` | MATCHED/MINED/CONFIRMED/FAILED | Your fill lifecycle |

---

# PART V: AGENT ORCHESTRATION

---

## 17. P&L SNAPSHOT ENGINE

```python
class PnlEngine:
    """Periodic portfolio snapshots for drawdown tracking and reporting."""

    def __init__(self, session):
        self.session = session

    def take_snapshot(self):
        positions = get_live_positions()
        usdc = get_usdc_balance()

        total_position_value = sum(p.get("currentValue", 0) for p in positions)
        total_portfolio = usdc + total_position_value
        unrealized = sum(p.get("cashPnl", 0) for p in positions)

        # Get high water mark
        last_snap = self.session.query(PnlSnapshot).order_by(
            PnlSnapshot.timestamp.desc()
        ).first()
        prev_hwm = last_snap.high_water_mark if last_snap else total_portfolio
        hwm = max(prev_hwm, total_portfolio)
        drawdown = (hwm - total_portfolio) / hwm if hwm > 0 else 0

        # Daily P&L
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
        day_start_snap = self.session.query(PnlSnapshot).filter(
            PnlSnapshot.timestamp >= today_start
        ).order_by(PnlSnapshot.timestamp.asc()).first()
        daily_pnl = (total_portfolio - day_start_snap.total_portfolio_value) if day_start_snap else 0

        # Weekly P&L
        from datetime import timedelta
        week_start = datetime.utcnow() - timedelta(days=7)
        week_start_snap = self.session.query(PnlSnapshot).filter(
            PnlSnapshot.timestamp >= week_start
        ).order_by(PnlSnapshot.timestamp.asc()).first()
        weekly_pnl = (total_portfolio - week_start_snap.total_portfolio_value) if week_start_snap else 0

        # Realized P&L cumulative
        realized = self.session.query(Position).filter(
            Position.status != PositionStatus.OPEN
        ).all()
        realized_cum = sum(p.realized_pnl or 0 for p in realized)

        # Open orders count
        open_orders = self.session.query(Order).filter(
            Order.status == OrderStatus.LIVE
        ).count()

        snapshot = PnlSnapshot(
            usdc_balance=usdc,
            total_position_value=total_position_value,
            total_portfolio_value=total_portfolio,
            unrealized_pnl=unrealized,
            realized_pnl_cumulative=realized_cum,
            num_open_positions=len(positions),
            num_open_orders=open_orders,
            high_water_mark=hwm,
            drawdown_from_hwm=drawdown,
            daily_pnl=daily_pnl,
            weekly_pnl=weekly_pnl,
        )
        self.session.add(snapshot)
        self.session.commit()
        return snapshot
```

---

## 18. COMPLETE AGENT LOOP

```python
import schedule

class BigEarnAgent:
    """
    The complete orchestrated agent.
    SCAN > EVALUATE > DECIDE > EXECUTE > MONITOR > REPEAT
    """

    def __init__(self, brain: BaseBrain):
        self.session = Session()
        self.brain = brain
        self.circuit_breaker = CircuitBreaker(self.session)
        self.calibration = CalibrationTracker(self.session)
        self.reconciler = Reconciler(self.session)
        self.redemption = RedemptionEngine(self.session)
        self.execution_analytics = ExecutionAnalytics(self.session)
        self.pnl = PnlEngine(self.session)

    def run_cycle(self):
        """One complete agent cycle."""
        print(f"\n{'='*60}")
        print(f"[{datetime.utcnow().isoformat()}] Starting cycle...")

        # === PRE-FLIGHT ===
        safe, reason = self.circuit_breaker.check_all()
        if not safe:
            print(f"[HALTED] {reason}")
            return

        # Check execution quality
        needs_adjust, adj_reason = self.execution_analytics.should_adjust_pricing()
        if needs_adjust:
            print(f"[EXEC WARNING] {adj_reason}")

        # === SCAN ===
        raw_markets = fetch_active_markets(limit=100)
        markets = self._filter_markets(raw_markets)
        print(f"[SCAN] {len(raw_markets)} markets found, {len(markets)} pass filters")

        # Cache in DB
        for m in markets:
            cache_market(self.session, m)
        self.session.commit()

        # === EVALUATE + DECIDE + EXECUTE ===
        current_positions = self.session.query(Position).filter(
            Position.status == PositionStatus.OPEN
        ).all()
        current_exposure = sum(p.cost_basis for p in current_positions)
        max_positions = int(os.getenv("MAX_OPEN_POSITIONS", "10"))

        trades_this_cycle = 0

        for market in markets:
            if len(current_positions) + trades_this_cycle >= max_positions:
                break

            condition_id = market["conditionId"]
            token_ids = json.loads(market.get("clobTokenIds", "[]"))
            if len(token_ids) < 2:
                continue

            yes_token = token_ids[0]

            # Get orderbook analysis
            try:
                book = get_orderbook_analysis(yes_token)
            except Exception:
                continue

            # Get price history for context
            try:
                history = get_price_history(yes_token, "1w")
            except Exception:
                history = []

            # === EVALUATE: Run the Brain ===
            try:
                estimate = self.brain.estimate_probability(market, book, history)
            except Exception as e:
                print(f"[BRAIN ERROR] {market.get('question', '?')[:50]}: {e}")
                continue

            # Record evaluation for calibration
            self.calibration.record_evaluation(condition_id, estimate, book["midpoint"])

            # === DECIDE: Position sizing with all gates ===
            corr_group = CorrelationTracker.assign_group(
                market.get("question", ""),
                market.get("tags", "")
            )
            corr_exposure = CorrelationTracker.get_correlated_exposure(self.session, corr_group)

            sizing = sizer.calculate(estimate, book, current_exposure, corr_exposure)

            if not sizing["approved"]:
                continue

            # Determine which token to buy
            if sizing["side"] == "BUY":
                token_id = yes_token
                price = book["best_ask"]  # Or your target price
            else:
                token_id = token_ids[1]  # NO token
                price = 1.0 - book["best_bid"]  # Price of NO

            # Pre-flight market impact check
            impact = estimate_market_impact(book, sizing["shares"], "BUY")
            if not impact["can_fill"]:
                continue

            max_impact = float(os.getenv("MAX_BOOK_IMPACT_PCT", "0.02"))
            if impact["book_impact_pct"] > max_impact:
                continue

            # === EXECUTE ===
            try:
                response = place_limit_order(
                    session=self.session,
                    condition_id=condition_id,
                    token_id=token_id,
                    price=price,
                    size_shares=sizing["shares"],
                    side=BUY,
                    book_analysis=book,
                )

                if response.get("success") or response.get("paper_mode"):
                    trades_this_cycle += 1
                    current_exposure += sizing["position_usdc"]

                    # Track position
                    pos = Position(
                        condition_id=condition_id,
                        token_id=token_id,
                        outcome="Yes" if token_id == yes_token else "No",
                        side=TradeDirection.BUY,
                        shares=sizing["shares"],
                        avg_entry_price=price,
                        cost_basis=sizing["position_usdc"],
                        current_price=book["midpoint"],
                        correlation_group=corr_group,
                    )
                    self.session.add(pos)

                    print(f"[TRADE] {sizing['side']} {sizing['shares']:.1f} shares @ {price:.3f} "
                          f"| Edge: {sizing['net_edge']:.3f} | {market.get('question', '')[:50]}")

            except Exception as e:
                print(f"[EXEC ERROR] {e}")

        self.session.commit()

        # === MONITOR: Exit checks ===
        self._check_exits()

        # === MONITOR: Stale order cleanup ===
        self._cleanup_stale_orders()

        print(f"[CYCLE COMPLETE] {trades_this_cycle} new trades placed")

    def _filter_markets(self, raw_markets):
        """Filter markets worth evaluating."""
        min_volume = 10000
        filtered = []
        for m in raw_markets:
            if float(m.get("volume", 0)) < min_volume:
                continue
            if m.get("closed"):
                continue
            # Skip markets ending in < 1 hour (not enough time to evaluate and exit)
            end_date = m.get("endDate")
            if end_date:
                try:
                    from dateutil import parser
                    end = parser.parse(end_date)
                    if (end - datetime.utcnow()).total_seconds() < 3600:
                        continue
                except Exception:
                    pass
            filtered.append(m)
        return filtered

    def _check_exits(self):
        """Re-evaluate all open positions for exit signals."""
        positions = self.session.query(Position).filter(
            Position.status == PositionStatus.OPEN
        ).all()

        for pos in positions:
            try:
                book = get_orderbook_analysis(pos.token_id)
                should_exit, reason = self.brain.should_exit(pos, book["midpoint"], book)

                if should_exit:
                    print(f"[EXIT SIGNAL] {reason} | {pos.condition_id[:16]}...")
                    # Place sell order
                    place_limit_order(
                        session=self.session,
                        condition_id=pos.condition_id,
                        token_id=pos.token_id,
                        price=book["best_bid"],
                        size_shares=pos.shares,
                        side=SELL,
                        book_analysis=book,
                    )
            except Exception:
                continue

    def _cleanup_stale_orders(self):
        """Cancel orders that have been resting too long."""
        stale_threshold = int(os.getenv("STALE_ORDER_SECONDS", "3600"))
        cutoff = datetime.utcnow() - timedelta(seconds=stale_threshold)

        stale = self.session.query(Order).filter(
            Order.status == OrderStatus.LIVE,
            Order.created_at < cutoff,
            ~Order.id.startswith("paper_"),
        ).all()

        for order in stale:
            try:
                cancel_order(order.id)
                order.status = OrderStatus.CANCELLED
                order.cancelled_at = datetime.utcnow()
                print(f"[STALE CANCEL] {order.id}")
            except Exception:
                continue

        self.session.commit()

    def run_reconciliation(self):
        """Periodic reconciliation of internal state vs. on-chain truth."""
        discrepancies = self.reconciler.run_full_reconciliation()
        if discrepancies:
            for d in discrepancies:
                print(f"[RECONCILE] {d['type']}: {d['detail']}")

    def run_pnl_snapshot(self):
        """Periodic P&L snapshot."""
        snap = self.pnl.take_snapshot()
        print(f"[P&L] Portfolio: ${snap.total_portfolio_value:.2f} | "
              f"DD: {snap.drawdown_from_hwm:.1%} | "
              f"Daily: ${snap.daily_pnl:+.2f}")

    def run_redemptions(self):
        """Check for and execute redemptions."""
        results = self.redemption.check_and_redeem()
        for r in results:
            print(f"[REDEEM] {r.get('condition_id', '?')[:16]}... | "
                  f"${r.get('value', 0):.2f} | {r.get('status')}")

    def start(self):
        """Start the agent with scheduled tasks."""
        cycle_interval = int(os.getenv("CYCLE_INTERVAL_SECONDS", "300"))
        recon_interval = int(os.getenv("RECONCILIATION_INTERVAL", "900"))
        pnl_interval = int(os.getenv("PNL_SNAPSHOT_INTERVAL", "3600"))

        schedule.every(cycle_interval).seconds.do(self.run_cycle)
        schedule.every(recon_interval).seconds.do(self.run_reconciliation)
        schedule.every(pnl_interval).seconds.do(self.run_pnl_snapshot)
        schedule.every(pnl_interval).seconds.do(self.run_redemptions)

        # Run immediately on start
        self.run_pnl_snapshot()
        self.run_reconciliation()
        self.run_cycle()

        print(f"\n[BIG EARN] Agent started in {TRADING_MODE} mode")
        print(f"  Cycle: every {cycle_interval}s")
        print(f"  Reconciliation: every {recon_interval}s")
        print(f"  P&L Snapshot: every {pnl_interval}s")

        while True:
            schedule.run_pending()
            time.sleep(1)


# === LAUNCH ===
if __name__ == "__main__":
    brain = LLMBrain()  # Replace with your implementation
    agent = BigEarnAgent(brain=brain)
    agent.start()
```

---

## 19. OPERATIONAL RULES

1. **Always start in paper mode.** Run `TRADING_MODE=paper` for minimum 2 weeks. Validate the Brain's estimates against actual resolutions before risking capital.
2. **Never trade without fresh tick_size and neg_risk.** These change per market and are required for valid orders.
3. **Reconcile relentlessly.** Internal state will drift. The Reconciler is not optional, it is the safety net.
4. **Circuit breakers are non-negotiable.** Never bypass them. If they trip, the system is telling you something. Investigate before resuming.
5. **Track calibration from day one.** If your Brier score is worse than 0.25 (random guessing), your Brain is destroying value. Stop trading and fix the model.
6. **Respect the book.** Never consume more than 2% of visible depth. You're a price taker, not a market maker.
7. **Edge must exceed spread + fees.** A 3% edge in a market with 4% spread is a negative EV trade. The PositionSizer enforces this automatically.
8. **Log everything.** Every evaluation, every order, every fill, every error. The database is your audit trail.
9. **Redeem promptly.** Unredeemed winnings earn 0%. The RedemptionEngine runs automatically, don't disable it.
10. **Review execution analytics weekly.** If fill rate drops below 60% or slippage exceeds 50bps, your pricing strategy needs adjustment.
11. **Watch correlation groups.** Eight political markets going the same direction is one bet, not eight.
12. **Exit losers.** If re-evaluation shows edge has disappeared, sell. Don't hold hoping for reversal. The `should_exit` method in the Brain is not optional.

---

## 20. API ENDPOINTS QUICK REFERENCE

### Public (No Auth)
| Base URL | Purpose |
|----------|---------|
| `https://gamma-api.polymarket.com` | Markets, events, search, tags |
| `https://data-api.polymarket.com` | Positions, trades, leaderboards, portfolio value |
| `https://clob.polymarket.com` | Orderbook, prices, spreads, midpoints, market params |

### Authenticated (L2 Headers via SDK)
| Base URL | Purpose |
|----------|---------|
| `https://clob.polymarket.com` | Order placement/cancel, trade history, balance/allowance, notifications |

### WebSocket
| URL | Purpose |
|-----|---------|
| `wss://ws-subscriptions-clob.polymarket.com/ws/market` | Real-time book, prices, trades, resolutions |
| `wss://ws-subscriptions-clob.polymarket.com/ws/user` | Your order/trade lifecycle events |

### Rate Limits (Key Ones)
| Endpoint | Sustained Limit |
|----------|----------------|
| POST /order | 60/s sustained, 500/s burst |
| DELETE /order | 50/s sustained, 300/s burst |
| GET /book | 150/s |
| GET /price | 150/s |
| Data API /positions | 15/s |
| Gamma /markets | 30/s |

---

## 21. FEES

Most markets: **zero fees**. No deposit, withdrawal, or trading fees.
Exception: 15-minute crypto markets have taker fees (redistributed as maker rebates).
Check per-market: `client.get_fee_rate_bps(token_id=TOKEN_ID)` returns basis points.

---

## 22. ERROR HANDLING REFERENCE

| Error | Meaning | Automated Action |
|-------|---------|-----------------|
| INVALID_ORDER_MIN_TICK_SIZE | Price precision wrong | Re-fetch tick_size, round, retry |
| INVALID_ORDER_MIN_SIZE | Below minimum | Increase size or skip |
| INVALID_ORDER_DUPLICATED | Same order exists | Skip |
| INVALID_ORDER_NOT_ENOUGH_BALANCE | Insufficient funds | Cancel excess orders or reduce size |
| INVALID_ORDER_EXPIRATION | Expired before submission | Recalculate: time.time() + 60 + desired |
| FOK_ORDER_NOT_FILLED_ERROR | No liquidity for FOK | Switch to GTC |
| MARKET_NOT_READY | Not accepting orders | Wait + exponential backoff |
| INVALID_POST_ONLY_ORDER | Would cross spread | Widen price from market |
| EXECUTION_ERROR | System error | Retry with backoff (max 3) |

```python
def execute_with_retry(func, max_retries=3, backoff=1.0):
    for attempt in range(max_retries):
        try:
            result = func()
            if isinstance(result, dict):
                error = result.get("errorMsg", "")
                if "NOT_ENOUGH_BALANCE" in error:
                    return None  # Don't retry, fundamental issue
                if "MARKET_NOT_READY" in error or "EXECUTION_ERROR" in error:
                    time.sleep(backoff * (2 ** attempt))
                    continue
            return result
        except Exception:
            if attempt == max_retries - 1:
                raise
            time.sleep(backoff * (2 ** attempt))
    return None
```

---

**Big Earn v2 is a complete trading system, not a trading script. It has risk rails, execution analytics, state persistence, calibration tracking, correlation awareness, circuit breakers, reconciliation, and a clean interface for plugging in intelligence. Start in paper mode, validate the Brain, then go live.**
