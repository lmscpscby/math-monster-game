/**
 * Cloudflare Worker + Durable Object room relay.
 *
 * Browser:  wss://<this-worker>/room/AB3K?role=host
 *           wss://<this-worker>/room/AB3K?role=guest
 * Local:    ws://127.0.0.1:8787/room/AB3K?role=host
 *
 * GitHub Pages cannot terminate WebSockets. This worker does, on 443
 * once it is deployed. The match never opens a peer-to-peer channel.
 */
import { connectPlayer, createRoom, isValidRoomCode } from './room.js';

export { connectPlayer, createRoom, isValidRoomCode };

function json(body, status) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: { 'content-type': 'application/json; charset=utf-8' }
    });
}

function rejectUpgrade(error) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    server.send(JSON.stringify({ t: 'relay', e: error }));
    try { server.close(4000, error); } catch (e) { /* already closing */ }
    return new Response(null, { status: 101, webSocket: client });
}

export class RoomRelay {
    constructor(state, env) {
        this.ctx = state;
        this.env = env;
        this.room = createRoom();
    }

    async fetch(request) {
        const upgrade = request.headers.get('Upgrade') || '';
        if (upgrade.toLowerCase() !== 'websocket') {
            return json({ ok: false, error: 'expected-websocket' }, 426);
        }
        const url = new URL(request.url);
        const code = url.searchParams.get('code') || '';
        const role = url.searchParams.get('role') || '';
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();

        const room = this.room;
        const joined = connectPlayer(room, code, role, server);
        if (joined.ok) {
            server.addEventListener('message', function (event) {
                if (typeof event.data !== 'string') return;
                room.message(server, event.data);
            });
            const leave = function () { room.leave(server); };
            server.addEventListener('close', leave);
            server.addEventListener('error', leave);
        }

        return new Response(null, { status: 101, webSocket: client });
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/' || url.pathname === '/health') {
            return json({ ok: true, service: 'math-monster-pvp-relay' }, 200);
        }

        const match = /^\/room\/([^/]+)$/.exec(url.pathname);
        if (!match) return json({ ok: false, error: 'not-found' }, 404);

        const code = decodeURIComponent(match[1]).toUpperCase();
        const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
        if (!isValidRoomCode(code)) {
            if (upgrade === 'websocket') return rejectUpgrade('invalid-code');
            return json({ ok: false, error: 'invalid-code' }, 400);
        }

        const role = url.searchParams.get('role') || '';
        if (role !== 'host' && role !== 'guest') {
            if (upgrade === 'websocket') return rejectUpgrade('bad-role');
            return json({ ok: false, error: 'bad-role' }, 400);
        }

        if (!env || !env.ROOM) return json({ ok: false, error: 'relay-unconfigured' }, 500);
        const id = env.ROOM.idFromName(code);
        const stub = env.ROOM.get(id);
        const next = new URL(request.url);
        next.searchParams.set('code', code);
        next.searchParams.set('role', role);
        return stub.fetch(new Request(next.toString(), request));
    }
};
