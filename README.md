# chud-money-client

Vue 3 front end for [chud-money](../chud-money). Users sign in to Verys; the
SPA then exchanges that session for a chud-money-scoped token on every API call
and websocket (see `src/auth/`).

## Running locally

Everything the front end depends on runs in compose: MongoDB, QuestDB, the
chud-money API (built from `../chud-money`) and Verys (built from `../verys`
with its dev config). A one-shot `verys-seed` service registers the two OAuth
clients, the `chud-money` role and a test user, `dev@example.com`
(`scripts/verys-seed.js`; override with `VERYS_DEV_EMAIL`).

```sh
cp .env.example .env.local      # already matches what the seed creates
docker compose up -d --build
npm install && npm run dev      # http://localhost:5173
```

The dev Verys has no mail server, so the login page cannot deliver a code.
Instead, create one and open the printed URL in the browser you use for the
app; it sets the Verys session cookies, and the app then signs in without a
code prompt:

```sh
scripts/verys-dev-login.sh            # or: scripts/verys-dev-login.sh you@example.com
```

Use Chrome or Firefox: the Verys session cookie is marked `Secure`, which
Safari refuses on plain `http://localhost`. The first sign-in shows two Verys
consent screens, one for the SPA and one for the chud-money API client that the
token exchange needs; both are remembered.

Export `USERNAME_SMTP`/`PASSWORD_SMTP` before `docker compose up` if you would
rather have Verys email real codes.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
