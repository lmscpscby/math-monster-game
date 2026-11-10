# 雲霄決鬥場 WebSocket room relay

GitHub Pages cannot host a WebSocket server. This Cloudflare Worker accepts encrypted WebSocket connections on port 443 and relays one 1v1 room through a Durable Object. It does not grade maths, and it does not use PeerJS, STUN, or TURN.

The browser origin is **not** filled in here. `pvp-peer.js` ships with an empty `MMG_PVP_RELAY_URL`. Deploy this worker, copy the hostname Wrangler prints, then set that constant before shipping the frontend. A client with no relay URL refuses to open a room and says so.

## Routes

- `GET /health` → `{ "ok": true, "service": "math-monster-pvp-relay" }`
- `GET /room/:code?role=host` or `role=guest`, with `Upgrade: websocket`

Room codes are 4 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0`, `O`, `1`, or `I`). One host and one guest. Game JSON is forwarded unchanged. A frame whose `t` is `relay` is dropped, so a player cannot fake presence.

Control frames the worker sends are `{ "t": "relay", "e": "<event>" }`:

| `e` | When |
| --- | --- |
| `welcome` | This socket got a seat. `role` is `host` or `guest`. `peer` is true when the other seat is already filled. |
| `peer-joined` | The other player connected. |
| `peer-left` | The guest disconnected. The host seat stays until the host sends `wait`. |
| `host-gone` | The host disconnected. The guest socket is then closed. |
| `room-full` | A guest tried to sit while a guest is already seated, or while the host is not waiting. |
| `room-taken` | A second host tried to claim this code. |
| `no-room` | A guest arrived before any host. |
| `invalid-code` | The code is not 4 characters from the alphabet above. |
| `bad-role` | `role` is not `host` or `guest`. |
| `pong` | Reply to a client `{"v":2,"t":"ping"}` keepalive. Pings are not forwarded. |

A new host starts out waiting, so the first guest can sit immediately. After that guest sits, the room stops accepting. When the guest leaves and the host is back on the waiting screen, the host sends `{"v":2,"t":"wait"}`. `wait` is not forwarded. On the result screen the host does not send `wait` and drops its socket, so a new arrival does not inherit the finished match.

## Local

From this directory:

```bash
npx wrangler@4 dev
```

Wrangler serves `http://127.0.0.1:8787` and accepts WebSockets at `ws://127.0.0.1:8787`. To point a local page at it, set this before `pvp-peer.js` loads:

```html
<script>window.MMG_PVP_RELAY_URL = 'ws://127.0.0.1:8787';</script>
```

Or temporarily set `MMG_PVP_RELAY_URL` in `pvp-peer.js`. Do not commit a live hostname.

## Deploy

From this directory, logged into the Cloudflare account that should own the Worker:

```bash
npx wrangler@4 login
npx wrangler@4 deploy
```

The first deploy applies the `v1` Durable Object migration in `wrangler.toml` (`RoomRelay`, SQLite-backed). Wrangler prints the live `https://…` hostname. The game needs the same host with the `wss://` scheme and no path (port 443), for example `https://math-monster-pvp-relay.<account>.workers.dev` becomes:

```javascript
var MMG_PVP_RELAY_URL = 'wss://math-monster-pvp-relay.<account>.workers.dev';
```

Put that in `pvp-peer.js` (the `MMG_PVP_RELAY_URL` constant). No `/room` suffix, no PeerJS key, no TURN server. The Pages site is https, so the constant must be `wss://`, not `ws://`.

Leave the pull request unmerged until that constant points at the deployed worker. Merging the client with an empty URL makes 雲霄決鬥場 refuse to open rooms.
