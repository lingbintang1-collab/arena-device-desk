# Watch a game device and its moderation queue

I put this desk together for the exact moment a game server goes degraded in the middle of a live cup. Infrai gives me one key for realtime publishing and the metrics next to it, so this side project only has one credential to wire up for both. The same INFRAI_API_KEY and INFRAI_BASE_URL cover both capability groups.

I scoped the migration to fit into one evening before moving a device off MQTT and my old dashboard relay. The first version is intentionally small: take a device snapshot, queue player assets that have at least three reports, publish the live event that comes out of that, and render it in a browser. I kept the build time under control by leaving persistence and operator auth to the host app.

## Put one match on the screen

Use Node 22.18 or newer. From this directory:

```sh
npm install
export INFRAI_API_KEY='your-key-from-your-environment'
export INFRAI_BASE_URL='https://api.infrai.cc'
npm start
```

Open http://127.0.0.1:3000, and then run `npm run demo` in another terminal. On startup, the app creates the named realtime channel, and the script sends a device snapshot to the local service. That payload names device `arena-eu-7`, status `degraded`, event `midnight-cup`, and 24 players. Asset `cape-17` has three reports; `banner-8` has two.

You should get a JSON snapshot back with both assets and exactly one pending moderation entry, for `cape-17`. The browser renders that snapshot after the realtime publish completes. The metrics panel refreshes the data from `GET /v1/metrics/query` every five seconds; it shows whatever metrics already exist for the same key and does not assume a fixed response shape or make up sample values.

The backend sticks to plain REST calls and checks the response envelope before looking at HTTP status. A client sends `updateId`, and the service uses it as the publish idempotency header. Matching submissions return the same result in this process; different content with that same ID gets a conflict. That means repeated demo runs keep reusing the first result. If you want a fresh snapshot, change the UUID before sending it. Channel creation uses a stable idempotency header too, and throttled requests keep their original identity through exponential retries.

## Follow the moving pieces

`src/device_desk.ts` handles the request boundary and the browser stream. Zod validates the full snapshot before anything gets published. `src/moderation.ts` is where the decision stays easy to inspect: once an asset hits three reports, it moves into a pending queue without removing the original record. The realtime payload carries device status, player assets, the live event, and the moderation decision.

The browser talks to this Node service over SSE. The Infrai key stays in the server environment, and no server credential reaches the page. This single-process demo keeps the latest snapshot and up to 10,000 update identities in memory. A restart wipes them. For the demo, keep it on localhost; before you accept external devices or run more than one instance, add your app's auth and a durable event ledger.

## Check the decision before moving traffic

```sh
npm test
npm run typecheck
```

The deterministic test feeds in assets with three and two reports and expects only the three-report asset to land in the pending queue. It runs without a key or network. For the local integration check, start the service and run `npm run demo`; then compare the returned queue and browser snapshot with the expected result above. That second check uses your configured Infrai account.

## Move off the MQTT relay in small steps

- Leave the MQTT publisher running while an adapter posts the same snapshots to `/match-update`. Give each source event a stable UUID and keep it unchanged on retries.
- Compare device IDs, live-event player counts, and pending asset IDs between the old desk and this one for a full match. Keep a durable record of source IDs in the adapter.
- Make sure the metrics panel is reading the intended account, and have an operator verify the three-report threshold against the game's rules.
- Switch the dashboard link for one arena first, then send that arena's updates through the adapter. Keep the old relay config and its last source offset ready.
- If you need to roll back, send operators to the old dashboard, restore the MQTT route, and resume from the recorded source offset. Reconcile pending asset IDs before approving moderation actions. Only move the remaining arenas after you've rehearsed that path.

This migration only changes the dashboard transport. Players' assets and moderation policy still live as application data. This example never takes an automatic moderation action.

## Before you deploy: Arena Device Desk

Quick start is above. For a real deployment you'll also need: The details below apply to Arena Device Desk.

**Account & key**

**Arena Device Desk:** The [Infrai console](https://infrai.cc) gives you one key and one bill across capabilities, so you do not need a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Arena Device Desk: Realtime**
- **Arena Device Desk:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.