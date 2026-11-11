# 雲霄決鬥場 WebSocket room relay

GitHub Pages cannot host a WebSocket server. This Cloudflare Worker accepts encrypted WebSocket connections on port 443 and relays one 1v1 room through a Durable Object. It does not grade maths, and it does not use PeerJS, STUN, or TURN.

`pvp-peer.js` sets `MMG_PVP_RELAY_URL` to `wss://math-monster-pvp-relay.ayaxysew.workers.dev` (no path, no trailing slash). A client with that constant cleared refuses to open a room and says so.

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

That window value overrides the constant for the local page only.

## Deploy

From this directory, logged into the Cloudflare account that should own the Worker:

```bash
npx wrangler@4 login
npx wrangler@4 deploy
```

The first deploy applies the `v1` Durable Object migration in `wrangler.toml` (`RoomRelay`, SQLite-backed). The live origin is already in `pvp-peer.js`:

```javascript
var MMG_PVP_RELAY_URL = 'wss://math-monster-pvp-relay.ayaxysew.workers.dev';
```

No `/room` suffix and no trailing slash. The Pages site is https, so the constant stays `wss://`.
