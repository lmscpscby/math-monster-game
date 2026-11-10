/**
 * 雲霄決鬥場 room relay: seats, forwarding, presence, and the browser client.
 * node scripts/pvp-relay-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

const root = path.join(__dirname, '..');
const peerSrc = fs.readFileSync(path.join(root, 'pvp-peer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const workerSrc = fs.readFileSync(path.join(root, 'relay/src/index.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(root, 'relay/wrangler.toml'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'relay/README.md'), 'utf8');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exitCode = 1;
        throw new Error(msg);
    }
}

function tick() {
    return new Promise(function (resolve) { setImmediate(resolve); });
}

function fakeSocket() {
    return {
        sent: [],
        closed: null,
        send: function (text) { this.sent.push(String(text)); },
        close: function (code, reason) { this.closed = { code: code, reason: reason }; }
    };
}

function lastJson(sock) {
    assert(sock.sent.length > 0, 'expected a frame');
    return JSON.parse(sock.sent[sock.sent.length - 1]);
}

async function testRoom(roomMod) {
    const connectPlayer = roomMod.connectPlayer;
    const createRoom = roomMod.createRoom;
    const isValidRoomCode = roomMod.isValidRoomCode;
    const alphabet = roomMod.CODE_ALPHABET;

    assert(alphabet === 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 'room alphabet skips 0 O 1 I');
    assert(isValidRoomCode('AB3K') && isValidRoomCode('2345'), 'sample codes are valid');
    ['', 'AB3', 'AB3KK', 'ab3k', '0B3K', 'OB3K', 'IB3K', '1B3K', 'A_3K', '!!!!'].forEach(function (bad) {
        assert(!isValidRoomCode(bad), 'rejected code ' + bad);
    });
    alphabet.split('').forEach(function (ch) {
        assert(isValidRoomCode(ch + ch + ch + ch), 'alphabet char can fill a code: ' + ch);
    });

    const empty = createRoom();
    const early = fakeSocket();
    const noRoom = connectPlayer(empty, 'AB3K', 'guest', early);
    assert(noRoom.ok === false && noRoom.error === 'no-room', 'guest before host is no-room');
    assert(lastJson(early).e === 'no-room' && early.closed, 'no-room closes the socket');
    assert(empty.seats().host === false, 'failed guest does not take a seat');

    const room = createRoom();
    const badCode = fakeSocket();
    const invalid = connectPlayer(room, '01OI', 'host', badCode);
    assert(invalid.error === 'invalid-code' && lastJson(badCode).e === 'invalid-code', 'invalid code');
    assert(room.seats().host === false, 'invalid code does not open a room');

    const badRole = fakeSocket();
    const roleRes = connectPlayer(room, 'AB3K', 'spectator', badRole);
    assert(roleRes.error === 'bad-role' && lastJson(badRole).e === 'bad-role', 'bad role');

    const host = fakeSocket();
    const hosted = connectPlayer(room, 'AB3K', 'host', host);
    assert(hosted.ok && hosted.role === 'host', 'host creates the room');
    const welcome = lastJson(host);
    assert(welcome.t === 'relay' && welcome.e === 'welcome' && welcome.role === 'host' && welcome.peer === false, 'host welcome, got ' + JSON.stringify(welcome));
    assert(room.seats().host && room.seats().accepting && !room.seats().guest, 'host is waiting');

    const guest = fakeSocket();
    const joined = connectPlayer(room, 'AB3K', 'guest', guest);
    assert(joined.ok && joined.role === 'guest', 'guest joins');
    assert(lastJson(host).e === 'peer-joined' && lastJson(host).role === 'guest', 'host hears peer-joined');
    const guestWelcome = guest.sent.map(function (text) { return JSON.parse(text); }).filter(function (msg) { return msg.e === 'welcome'; })[0];
    assert(guestWelcome && guestWelcome.role === 'guest' && guestWelcome.peer === true, 'guest welcome says the host is already there');
    assert(room.seats().guest && room.seats().accepting === false, 'seat closes once the guest sits');

    const third = fakeSocket();
    const full = connectPlayer(room, 'AB3K', 'guest', third);
    assert(full.error === 'room-full' && lastJson(third).e === 'room-full' && third.closed, 'third player is room-full');
    assert(guest.closed === null && host.closed === null, 'room-full does not drop the seated pair');

    const otherHost = fakeSocket();
    const taken = connectPlayer(room, 'AB3K', 'host', otherHost);
    assert(taken.error === 'room-taken' && lastJson(otherHost).e === 'room-taken', 'second host is room-taken');
    assert(room.seats().host === true, 'original host keeps the room');

    const question = JSON.stringify({
        v: 2,
        t: 'question',
        roundId: 'r1',
        stem: '12 + 7 = ?',
        options: ['19', '18'],
        answer: '19',
        image: ''
    });
    const forwarded = room.message(host, question);
    assert(forwarded.ok === true, 'question frame accepted');
    assert(guest.sent[guest.sent.length - 1] === question, 'question is relayed byte for byte');
    const answer = JSON.stringify({ v: 2, t: 'answer', roundId: 'r1', choice: '19', ms: 1200 });
    assert(room.message(guest, answer).ok === true, 'answer accepted');
    assert(host.sent[host.sent.length - 1] === answer, 'answer is relayed byte for byte');

    const guestBefore = guest.sent.length;
    const ping = room.message(host, JSON.stringify({ v: 2, t: 'ping' }));
    assert(ping.pong === true && lastJson(host).e === 'pong', 'ping gets pong');
    assert(guest.sent.length === guestBefore, 'ping is not forwarded');

    const spoof = JSON.stringify({ t: 'relay', e: 'host-gone' });
    const reserved = room.message(guest, spoof);
    assert(reserved.ok === false && reserved.error === 'reserved', 'relay frames are not forwarded');
    assert(host.sent.indexOf(spoof) === -1, 'host never sees a spoofed host-gone');
    assert(room.message(host, '{').error === 'bad-json', 'bad json dropped');
    assert(room.message(host, 'x'.repeat(32769)).error === 'too-large', 'oversized frame dropped');
    assert(room.message(fakeSocket(), question).error === 'not-in-room', 'outsider cannot inject');

    const mismatch = fakeSocket();
    assert(connectPlayer(room, 'ZZ99', 'guest', mismatch).error === 'wrong-room', 'code is bound to the room object');

    assert(room.leave(guest).role === 'guest', 'guest disconnect');
    assert(lastJson(host).e === 'peer-left' && lastJson(host).role === 'guest', 'host is told the guest left');
    assert(room.seats().guest === false && room.seats().accepting === false, 'seat stays shut until the host waits again');
    const earlyReturn = fakeSocket();
    assert(connectPlayer(room, 'AB3K', 'guest', earlyReturn).error === 'room-full', 'guest cannot slip in before wait');
    assert(room.message(host, JSON.stringify({ v: 2, t: 'wait' })).waiting === true, 'host wait reopens the seat');
    assert(room.message(guest, JSON.stringify({ v: 2, t: 'wait' })).error === 'not-in-room', 'departed guest cannot wait');
    const guestAgain = fakeSocket();
    assert(connectPlayer(room, 'AB3K', 'guest', guestAgain).ok === true, 'next guest joins after wait');

    const ended = createRoom();
    const host2 = fakeSocket();
    const guest2 = fakeSocket();
    connectPlayer(ended, '2345', 'host', host2);
    connectPlayer(ended, '2345', 'guest', guest2);
    assert(ended.leave(host2).role === 'host', 'host disconnect');
    assert(lastJson(guest2).e === 'host-gone', 'guest is told the host is gone');
    assert(guest2.closed && guest2.closed.reason === 'host-gone', 'guest socket closes on host-gone');
    assert(ended.seats().host === false && ended.seats().guest === false, 'room is empty after the host leaves');
    const replacement = fakeSocket();
    assert(connectPlayer(ended, '2345', 'host', replacement).ok === true, 'a later host can reuse the code');
}

function makeEl(id) {
    const node = {
        id: id,
        textContent: '',
        className: '',
        disabled: false,
        value: '',
        style: {},
        dataset: {},
        childNodes: [],
        firstChild: null,
        innerHTML: '',
        _cls: {},
        classList: null,
        appendChild: function (child) {
            this.childNodes.push(child);
            this.firstChild = this.childNodes[0] || null;
            return child;
        },
        removeChild: function (child) {
            this.childNodes = this.childNodes.filter(function (item) { return item !== child; });
            this.firstChild = this.childNodes[0] || null;
            return child;
        },
        addEventListener: function () {},
        setAttribute: function () {},
        removeAttribute: function () {},
        select: function () {}
    };
    node.classList = {
        toggle: function (name, force) {
            node._cls[name] = force === undefined ? !node._cls[name] : !!force;
            return node._cls[name];
        },
        add: function (name) { node._cls[name] = true; },
        remove: function (name) { node._cls[name] = false; },
        contains: function (name) { return !!node._cls[name]; }
    };
    return node;
}

function loadClient(world, MockWS, opts) {
    const els = {};
    [
        'view-pvp', 'pvp-lobby-msg', 'pvp-room-msg', 'pvp-room-code', 'pvp-room-url',
        'pvp-step-lobby', 'pvp-step-room', 'pvp-step-pick', 'pvp-step-fight',
        'pvp-lead', 'pvp-pick-kicker', 'pvp-fight-kicker', 'pvp-roster',
        'pvp-pick-confirm', 'pvp-pick-msg', 'pvp-quiz-msg', 'pvp-create-btn',
        'pvp-join-btn', 'pvp-join-code', 'pvp-join-form'
    ].forEach(function (id) { els[id] = makeEl(id); });
    const ctx = {
        console: console,
        Math: Math,
        Date: Date,
        Number: Number,
        String: String,
        Object: Object,
        Array: Array,
        JSON: JSON,
        parseInt: parseInt,
        isFinite: isFinite,
        Uint32Array: Uint32Array,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        queueMicrotask: queueMicrotask,
        URL: URL,
        WebSocket: MockWS,
        performance: { now: function () { return 0; } },
        crypto: {
            getRandomValues: function (arr) {
                nodeCrypto.webcrypto.getRandomValues(arr);
                return arr;
            }
        },
        location: {
            href: 'https://example.test/math-monster-game/',
            hash: '',
            pathname: '/math-monster-game/',
            search: ''
        },
        history: { replaceState: function () {} },
        navigator: {},
        currentUser: { nickname: opts.nickname || '玩家' },
        MMG_PVP_RELAY_URL: opts.relayUrl === undefined ? 'ws://127.0.0.1:8787' : opts.relayUrl,
        document: {
            readyState: 'complete',
            getElementById: function (id) { return els[id] || null; },
            querySelector: function () { return null; },
            addEventListener: function () {},
            createElement: function () { return makeEl('node'); },
            body: { appendChild: function () {}, removeChild: function () {} }
        }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(peerSrc, ctx, { filename: 'pvp-peer.js' });
    return {
        api: ctx.MmgPvp,
        el: function (id) { return els[id]; },
        debug: function () { return ctx.MmgPvp.debugState(); },
        leave: function () {
            try { ctx.MmgPvp.leaveRoom(); } catch (e) { /* already gone */ }
        }
    };
}

function createMockWebSocket(world, roomMod) {
    function MockWS(url) {
        const self = this;
        this.url = String(url);
        this.readyState = 0;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        this._room = null;
        this._left = false;
        world.sockets.push(this);
        const parsed = new URL(this.url);
        const down = parsed.hostname === 'down.test';
        const code = decodeURIComponent(parsed.pathname.split('/').pop() || '');
        const role = parsed.searchParams.get('role');
        const adapter = {
            send: function (text) {
                if (self.onmessage) self.onmessage({ data: text });
            },
            close: function (closeCode, reason) {
                if (self.readyState === 3) return;
                self.readyState = 3;
                if (self.onclose) self.onclose({ code: closeCode, reason: reason });
            }
        };
        this.send = function (data) {
            if (!self._room) throw new Error('socket has no room');
            self._room.message(adapter, data);
        };
        this.close = function () {
            if (self.readyState === 3) return;
            self.readyState = 3;
            if (self._room && !self._left) {
                self._left = true;
                self._room.leave(adapter);
            }
            if (self.onclose) self.onclose({});
        };
        queueMicrotask(function () {
            if (self.readyState === 3) return;
            if (down) {
                self.readyState = 3;
                if (self.onerror) self.onerror({});
                if (self.onclose) self.onclose({});
                return;
            }
            self.readyState = 1;
            if (self.onopen) self.onopen();
            let room = world.rooms.get(code);
            if (!room) {
                room = roomMod.createRoom();
                world.rooms.set(code, room);
            }
            self._room = room;
            roomMod.connectPlayer(room, code, role, adapter);
        });
    }
    return MockWS;
}

async function testClient(roomMod) {
    const world = { rooms: new Map(), sockets: [] };
    const MockWS = createMockWebSocket(world, roomMod);
    const host = loadClient(world, MockWS, { nickname: '房主' });
    const guest = loadClient(world, MockWS, { nickname: '對手' });
    try {
        host.api.createRoom();
        await tick();
        const code = host.debug().code;
        assert(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code), 'host created a short code, got ' + code);
        assert(host.el('pvp-room-msg').textContent.indexOf('房號已開好') !== -1, 'host sees the room as open');
        assert(host.el('pvp-room-code').textContent === code.split('').join(' '), 'room code is shown spaced');
        const hostSock = world.sockets.filter(function (sock) { return sock.url.indexOf('role=host') !== -1; }).pop();
        assert(hostSock && hostSock.url === 'ws://127.0.0.1:8787/room/' + code + '?role=host', 'host dials the relay room, got ' + (hostSock && hostSock.url));

        guest.api.joinRoom(code.toLowerCase());
        await tick();
        assert(guest.debug().phase === 'pick' && host.debug().phase === 'pick', 'both sit on the monster pick step');
        assert(host.debug().connected && guest.debug().connected, 'both sides are connected');
        assert(host.debug().opponentName === '對手', 'guest hello reached the host');
        assert(guest.debug().opponentName === '房主', 'host hello reached the guest');
        const guestSock = world.sockets.filter(function (sock) { return sock.url.indexOf('role=guest') !== -1; }).pop();
        assert(guestSock && guestSock.url.indexOf('/room/' + code + '?role=guest') !== -1, 'guest dials the same room');

        const stranger = loadClient(world, MockWS, { nickname: '第三人' });
        try {
            stranger.api.joinRoom(code);
            await tick();
            assert(stranger.el('pvp-lobby-msg').textContent.indexOf('已經有人') !== -1, 'full room is told to the third player, got ' + stranger.el('pvp-lobby-msg').textContent);
            assert(stranger.debug().phase === 'lobby', 'full room sends the arrival back to the lobby');
        } finally {
            stranger.leave();
        }

        guest.leave();
        await tick();
        assert(host.debug().phase === 'room' && host.debug().connected === false, 'host returns to the waiting room');
        assert(host.el('pvp-room-msg').textContent.indexOf('對手離開') !== -1, 'disconnect is reported to the host');
        assert(host.debug().code === code, 'room code stays up');

        const next = loadClient(world, MockWS, { nickname: '第二位' });
        try {
            next.api.joinRoom(code);
            await tick();
            assert(next.debug().phase === 'pick' && host.debug().phase === 'pick', 'host wait lets the next guest in');
            assert(host.debug().opponentName === '第二位', 'next guest hello was relayed');
        } finally {
            next.leave();
        }
    } finally {
        guest.leave();
        host.leave();
    }

    const world2 = { rooms: new Map(), sockets: [] };
    const Mock2 = createMockWebSocket(world2, roomMod);
    const hostB = loadClient(world2, Mock2, { nickname: '房主' });
    const guestB = loadClient(world2, Mock2, { nickname: '對手' });
    try {
        hostB.api.createRoom();
        await tick();
        guestB.api.joinRoom(hostB.debug().code);
        await tick();
        assert(guestB.debug().phase === 'pick', 'second pair reached pick');
        hostB.leave();
        await tick();
        assert(guestB.el('pvp-lobby-msg').textContent.indexOf('房主離開') !== -1, 'host disconnect is reported, got ' + guestB.el('pvp-lobby-msg').textContent);
        assert(guestB.debug().phase === 'lobby', 'guest is back in the lobby');
    } finally {
        guestB.leave();
        hostB.leave();
    }

    const plain = loadClient({ rooms: new Map(), sockets: [] }, createMockWebSocket({ rooms: new Map(), sockets: [] }, roomMod), { relayUrl: '' });
    try {
        plain.api.createRoom();
        assert(plain.el('pvp-lobby-msg').textContent.indexOf('未設定對戰中繼網址') !== -1, 'missing URL is honest');
        assert(plain.debug().code === '', 'missing URL does not invent a room');
        plain.api.joinRoom('AB3K');
        assert(plain.el('pvp-lobby-msg').textContent.indexOf('未設定對戰中繼網址') !== -1, 'joining also refuses a missing URL');
    } finally {
        plain.leave();
    }

    const badScheme = loadClient({ rooms: new Map(), sockets: [] }, createMockWebSocket({ rooms: new Map(), sockets: [] }, roomMod), { relayUrl: 'https://example.test/relay' });
    try {
        badScheme.api.createRoom();
        assert(badScheme.el('pvp-lobby-msg').textContent.indexOf('ws://') !== -1, 'a non-websocket URL is rejected, got ' + badScheme.el('pvp-lobby-msg').textContent);
    } finally {
        badScheme.leave();
    }

    const badCodeClient = loadClient({ rooms: new Map(), sockets: [] }, createMockWebSocket({ rooms: new Map(), sockets: [] }, roomMod), {});
    try {
        badCodeClient.api.joinRoom('01OI');
        assert(badCodeClient.el('pvp-lobby-msg').textContent.indexOf('0') !== -1, 'confusable code is rejected locally');
        badCodeClient.api.joinRoom('AB');
        assert(badCodeClient.el('pvp-lobby-msg').textContent.indexOf('4') !== -1, 'short code is rejected locally');
        assert(badCodeClient.api.normalizeCode('pvp=AB3K') === 'AB3K', 'share-link codes still normalize');
        assert(badCodeClient.api.normalizeCode('01OI') === '', 'client and relay reject the same confusable letters');
    } finally {
        badCodeClient.leave();
    }

    const downWorld = { rooms: new Map(), sockets: [] };
    const down = loadClient(downWorld, createMockWebSocket(downWorld, roomMod), { relayUrl: 'ws://down.test' });
    try {
        down.api.createRoom();
        await tick();
        assert(down.el('pvp-lobby-msg').textContent.indexOf('連唔到對戰中繼伺服器') !== -1, 'dead relay is honest, got ' + down.el('pvp-lobby-msg').textContent);
        assert(down.debug().phase === 'lobby', 'failed connect returns to the lobby');
    } finally {
        down.leave();
    }
}

function testSources() {
    assert(peerSrc.indexOf("var MMG_PVP_RELAY_URL = '';") !== -1, 'relay URL constant is empty');
    assert(!/peerjs|new Peer\(|MMG_PVP_PEERJS|\bTURN\b|\bSTUN\b|WebRTC/i.test(peerSrc), 'client source has no PeerJS or TURN');
    assert(!/peerjs|PeerJS|\bTURN\b|\bNAT\b/.test(html), 'page has no PeerJS, TURN, or NAT wording');
    assert(!html.includes('unpkg.com/peerjs'), 'page does not load PeerJS');
    assert(/<p class="pvp-footnote">[^<]*WebSocket[^<]*中繼[^<]*<\/p>/.test(html), 'footnote describes the WebSocket relay');
    assert(workerSrc.includes('class RoomRelay'), 'worker defines the Durable Object');
    assert(workerSrc.includes('new WebSocketPair()'), 'worker accepts WebSockets');
    assert(workerSrc.includes('idFromName'), 'one object per room code');
    assert(!/peerjs|\bTURN\b|\bSTUN\b/i.test(workerSrc), 'worker has no PeerJS or TURN');
    assert(wrangler.includes('name = "math-monster-pvp-relay"'), 'wrangler names the worker');
    assert(wrangler.includes('class_name = "RoomRelay"'), 'wrangler binds the room object');
    assert(wrangler.includes('new_sqlite_classes = ["RoomRelay"]'), 'wrangler migration creates the room class');
    assert(!/workers\.dev/.test(wrangler), 'wrangler config does not pin a live hostname');
    assert(readme.includes('npx wrangler@4 dev'), 'readme documents local wrangler');
    assert(readme.includes('npx wrangler@4 login') && readme.includes('npx wrangler@4 deploy'), 'readme documents the deploy commands');
    assert(readme.includes('MMG_PVP_RELAY_URL'), 'readme points at the frontend constant');
}

async function main() {
    const roomMod = await import('../relay/src/room.js');
    testSources();
    await testRoom(roomMod);
    await testClient(roomMod);
    if (process.exitCode) {
        console.error('pvp relay tests failed');
        process.exit(process.exitCode);
    }
    console.log('pvp relay tests passed');
    process.exit(0);
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
