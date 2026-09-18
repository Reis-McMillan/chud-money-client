// DTOs mirroring the chud-money backend (src/model/market.rs, src/feeds/mod.rs,
// src/db/questdb.rs, src/controllers/*.rs). Field names are snake_case verbatim.

export type KalshiEnv = 'prod' | 'demo'

export interface KalshiInfo {
  env: KalshiEnv
  rest_base: string
  ws_url: string
  channels: string[]
}

export interface ProxyInfo {
  ticker_ws: string
  orderbook_ws: string
}

export interface Market {
  tag: string
  series_ticker: string
  index_id: string
  title: string
  kalshi: KalshiInfo
  proxy: ProxyInfo
  created_at: string
}

/** A Kalshi market record for one open market in the series. */
export interface OpenMarket {
  ticker: string
  title: string
  /** RFC 3339; the settlement target is fixed at open. */
  open_time: string
  /** RFC 3339 */
  close_time: string
  /** e.g. "greater_or_equal" */
  strike_type: string | null
  /** The target price, when set. */
  floor_strike: number | null
  cap_strike: number | null
  /** e.g. "Target Price: $79,630.17" */
  yes_sub_title: string | null
}

export interface FeedStatus {
  connected: boolean
  reconnects: number
  open_tickers: string[]
  open_markets: OpenMarket[]
  last_value: number | null
  last_msg_at: string | null
  ticker_msgs: number
  orderbook_msgs: number
  last_error: string | null
}

/** `GET /` element and `POST /add` response: Market fields flattened. */
export type MarketView = Market & { feed: FeedStatus | null }

export interface TableSummary {
  table: string
  rows: number
  rows_last_hour: number
  first_ts: string | null
  last_ts: string | null
  last_value: number | null
  min_value: number | null
  max_value: number | null
}

/** What `contract_candles_hist` holds for one series. */
export interface CandleSummary {
  table: string
  rows: number
  markets: number
  first_ts: string | null
  last_ts: string | null
}

/** `GET /{tag}` response: Market nested under `market`. */
export interface MarketDetail {
  market: Market
  feed: FeedStatus | null
  questdb: {
    live: TableSummary
    hist: TableSummary
    contracts: CandleSummary
  }
}

export interface AddMarketBody {
  tag: string
  series_ticker: string
  index_id: string
  title?: string
  kalshi_env?: KalshiEnv
}

export interface DeleteResult {
  tag: string
  deleted: boolean
  feed_stopped: boolean
}

/**
 * `index`: the CF Benchmarks index the series settles on. `contracts`: the
 * prices the series' contracts traded at, as 1-minute candlesticks.
 */
export type IngestKind = 'index' | 'contracts'

export interface IngestBody {
  tag: string
  /** Defaults to `index` on the backend. */
  kind?: IngestKind
  /** RFC 3339 */
  start: string
  /** RFC 3339 */
  end: string
}

export interface IngestAccepted {
  job_id: string
  tag: string
  kind: IngestKind
  index_id: string
  series_ticker: string
  cursor_ms: number
  end_ms: number
}

export type JobStatus = 'running' | 'done' | 'failed'

export interface IngestJob {
  job_id: string
  tag: string
  kind: IngestKind
  index_id: string
  series_ticker: string
  status: JobStatus
  timespan: string
  start_ms: number
  end_ms: number
  cursor_ms: number
  /** `contracts` only: markets found in range, and how many are done. */
  markets_total: number
  markets_done: number
  requests: number
  rows: number
  error: string | null
  started_at: string
  finished_at: string | null
}

export interface ApiErrorBody {
  error: string
  details?: string[]
}

// ---- websocket frames (raw Kalshi envelopes forwarded by the proxy) ----

export interface TickerFrame {
  type: 'cfbenchmarks_value_5hz'
  sid?: number
  seq?: number
  msg: {
    index_id: string
    /** Decimal string, e.g. "111234.56" */
    value_usd: string
    source_ts_ms?: number
    received_at?: number
  }
}

/** Synthesized by the proxy when this client fell behind the broadcast buffer. */
export interface LaggedFrame {
  type: 'lagged'
  dropped: number
}

/** Legacy: integer cents and whole contracts. */
export type BookLevel = [price: number, qty: number]
/** Current: decimal strings, e.g. ["0.0330", "232.21"]. */
export type BookLevelDollars = [price: string, qty: string]

export interface SnapshotFrame {
  type: 'orderbook_snapshot'
  sid?: number
  seq?: number
  msg: {
    market_ticker: string
    market_id?: string
    yes?: BookLevel[]
    no?: BookLevel[]
    yes_dollars?: BookLevelDollars[]
    no_dollars?: BookLevelDollars[]
  }
}

export interface DeltaFrame {
  type: 'orderbook_delta'
  sid?: number
  seq?: number
  msg: {
    market_ticker: string
    market_id?: string
    side: 'yes' | 'no'
    /** legacy: integer cents */
    price?: number
    /** legacy: whole contracts */
    delta?: number
    /** current: e.g. "0.0330" */
    price_dollars?: string
    /** current: e.g. "-232.21" */
    delta_fp?: string
    ts?: string
    ts_ms?: number
  }
}

export type TickerSocketFrame = TickerFrame | LaggedFrame
export type OrderbookFrame = SnapshotFrame | DeltaFrame | LaggedFrame
