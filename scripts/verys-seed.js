// Seeds the local Verys (docker compose `verys` service) with what chud-money
// needs. Run by the `verys-seed` compose service once Verys is healthy: Verys'
// own startup seeding must have created the openid/profile/email scopes first.
//
// Idempotent: every document is upserted on its natural key and only touched
// where it differs. Documents follow verys/src/verys/models/*.py exactly
// (extra fields are rejected when Verys re-validates a document), and carry
// `deleted: false` because Verys reads only live documents.
//
// Creates:
//   - a public PKCE client for the SPA          (VITE_VERYS_CLIENT_ID)
//   - the chud-money API client, the audience the SPA exchanges its session
//     for; it must list the SPA callback so the one-time consent hop works
//                                               (CHUD_MONEY_API_CLIENT_ID)
//   - the `chud-money` role the API requires
//   - a verified identity holding that role     (VERYS_DEV_EMAIL)
//
// Consent is deliberately not pre-granted so the real first-login path (SPA
// consent screen, then the consent hop for the API client) gets exercised.

const { randomUUID } = require('crypto')

const env = (name, fallback) => (process.env[name] || '').trim() || fallback

const SPA_ORIGIN = env('SPA_ORIGIN', 'http://localhost:5173')
const SPA_CLIENT_ID = env('VITE_VERYS_CLIENT_ID', 'chud-money-spa')
const API_CLIENT_ID = env('CHUD_MONEY_API_CLIENT_ID', 'chud-money-api')
const DEV_EMAIL = env('VERYS_DEV_EMAIL', 'dev@example.com').toLowerCase()
const ROLE_NAME = 'chud-money'
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000 // Verys AUTHENTICATION_TTL

const verys = db.getSiblingDB(env('MONGO_DB_NAME', 'verys'))
const now = new Date()

/** Upsert the live document matching `key`; `onInsert` fields are set only when created. */
function live(collection, key, fields, onInsert = {}) {
  const result = verys[collection].updateOne(
    { ...key, deleted: false },
    { $set: { ...fields, deleted: false }, $setOnInsert: onInsert },
    { upsert: true },
  )
  const what = result.upsertedCount ? 'created' : result.modifiedCount ? 'updated' : 'unchanged'
  print(`${collection} ${JSON.stringify(key)}: ${what}`)
}

const callback = `${SPA_ORIGIN}/auth/callback`

live(
  'oauth_client',
  { client_id: SPA_CLIENT_ID },
  {
    client_id: SPA_CLIENT_ID,
    client_secret_hash: null,
    client_name: 'chud money',
    // The bare origin is where /end-session sends the browser after sign-out.
    redirect_uris: [callback, `${SPA_ORIGIN}/`],
    allowed_scopes: ['openid', 'profile', 'email'],
    prm_uri: null,
    required_scopes: [],
    grant_types: [
      'authorization_code',
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:token-exchange',
    ],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    is_public: true,
    owner_email: null,
  },
  { created_at: now },
)

live(
  'oauth_client',
  { client_id: API_CLIENT_ID },
  {
    client_id: API_CLIENT_ID,
    // Never redeems codes itself: the SPA only sends the browser through
    // /authorize for this client so Verys records consent for it.
    client_secret_hash: null,
    client_name: 'chud money api',
    redirect_uris: [callback],
    allowed_scopes: ['openid'],
    prm_uri: null,
    // Must stay a subset of the SPA client's allowed_scopes or the exchange
    // fails with insufficient_scope.
    required_scopes: [],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
    is_public: false,
    owner_email: null,
  },
  { created_at: now },
)

live('role', { name: ROLE_NAME }, { name: ROLE_NAME }, { id: randomUUID() })
const role = verys.role.findOne({ name: ROLE_NAME, deleted: false }, { _id: 0, id: 1, name: 1 })

live(
  'identity',
  { email: DEV_EMAIL },
  {
    email: DEV_EMAIL,
    email_verified: true,
    closed: false,
    // Embedded role snapshots, sorted by name; Role.pipeline re-derives them.
    roles: [{ id: role.id, name: role.name }],
  },
  {
    id: randomUUID(),
    first_name: 'Dev',
    last_name: 'User',
    auth_key: randomUUID(),
    expires: new Date(now.getTime() + SESSION_TTL_MS),
    origination: now,
    last_auth_time: null,
  },
)

print(`verys seeded: spa client ${SPA_CLIENT_ID}, api client ${API_CLIENT_ID}, user ${DEV_EMAIL}`)
