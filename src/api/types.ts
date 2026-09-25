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
  /** Coinbase spot product streamed alongside the market (ticker + level2 book), e.g. `BTC-USD`. */
  coinbase_product?: string
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

/** The Coinbase half of a market's feed; only for markets with a `coinbase_product`. */
export interface CoinbaseFeedStatus {
  product: string
  connected: boolean
  reconnects: number
  ticker_msgs: number
  book_msgs: number
  /** Rows not written because the QuestDB queue was full. */
  dropped_rows: number
  last_price: number | null
  last_msg_at: string | null
  last_error: string | null
}

export interface FeedStatus {
  connected: boolean
  reconnects: number
  open_tickers: string[]
  open_markets: OpenMarket[]
  last_value: number | null
  last_msg_at: string | null
  /** CF Benchmarks 5Hz frames. */
  ticker_msgs: number
  /** Kalshi per-market `ticker` frames. */
  contract_ticker_msgs: number
  orderbook_msgs: number
  /** Rows not written because the QuestDB queue was full. */
  dropped_rows: number
  last_error: string | null
  /** null for a market without a `coinbase_product`. */
  coinbase: CoinbaseFeedStatus | null
}

/** `GET /` element and `POST /add` response: Market fields flattened. */
export type MarketView = Market & { feed: FeedStatus | null }

/**
 * Row count and time span of one market's rows in one QuestDB table. Count
 * and span only: the backend computes these on a timer, not per request.
 */
export interface TableSummary {
  table: string
  rows: number
  first_ts: string | null
  last_ts: string | null
}

/** What QuestDB holds for one market; the coinbase pair is null without a `coinbase_product`. */
export interface QuestdbSummary {
  live: TableSummary
  hist: TableSummary
  /** `contract_candles_hist` */
  contracts: TableSummary
  /** Kalshi `ticker` frames of the series (`contract_ticker_live`). */
  contract_ticker: TableSummary
  /** Kalshi orderbook snapshots + deltas of the series (`contract_book_live`). */
  contract_book: TableSummary
  coinbase_ticker: TableSummary | null
  coinbase_book: TableSummary | null
}

/**
 * The backend's cached summaries, refreshed about once a minute per market
 * (src/feeds/summary.rs). `tables` is null until the first refresh after the
 * feed started; a failed refresh keeps the previous tables and sets `error`.
 */
export interface SummarySnapshot {
  tables: QuestdbSummary | null
  /** RFC 3339; when `tables` was computed. */
  refreshed_at: string | null
  error: string | null
}

/** `GET /{tag}` response: Market nested under `market`. */
export interface MarketDetail {
  market: Market
  feed: FeedStatus | null
  questdb: SummarySnapshot
}

export interface AddMarketBody {
  tag: string
  series_ticker: string
  index_id: string
  coinbase_product?: string
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
  /** Fetch everything again, even what QuestDB already holds. */
  force?: boolean
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
  force: boolean
  /** Windows (`index`) or markets (`contracts`) QuestDB already held. */
  skipped: number
  retries: number
  /** Why the call in flight is being retried; null once it succeeds. */
  retry_error: string | null
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
    /** Same levels under the names Kalshi's current docs use. */
    yes_dollars_fp?: BookLevelDollars[]
    no_dollars_fp?: BookLevelDollars[]
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
