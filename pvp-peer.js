/**
 * 1v1 數學對戰試作 — PeerJS Cloud 信令（純前端，無自建後端）。
 *
 * 預設連去公開 PeerJS Cloud（0.peerjs.com）。唔使申請 key：
 * 留空 MMG_PVP_PEERJS_KEY 就用程式庫內建嘅公開 key「peerjs」。
 *
 * 如果公開 key 日後被拒，先去 https://peerjs.com/server/cloud
 * 申請免費 key，然後填下面呢個常數，或者喺載入本檔之前設定
 * window.MMG_PVP_PEERJS_KEY。
 *
 * 可選：自建 PeerServer（MVP 唔用）。載入本檔之前設定，例如：
 *   window.MMG_PVP_PEER_CONFIG = {
 *     host: 'your-peer-server.example',
 *     port: 443,
 *     path: '/',
 *     secure: true
 *   };
 *
 * 未加 TURN。預設只靠 PeerJS 自帶嘅 STUN。學校 Wi‑Fi／對稱 NAT
 * 有機會通唔到，之後先至需要 TURN。
 */
(function () {
    'use strict';

    var MMG_PVP_PEERJS_KEY = '';
    var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var CODE_LEN = 4;
    var ID_PREFIX = 'mmg-';
    var ICE_WAIT_MS = 20000;

    var state = emptyState();
    var uiBound = false;

    function emptyState() {
        return {
            token: 0,
            role: null,
            code: '',
            peer: null,
            conn: null,
            connected: false,
            opponentName: '',
            question: null,
            myChoice: null,
            theirChoice: null,
            finished: false,
            outcome: null,
            iceTimer: null
        };
    }

    function $(id) {
        return document.getElementById(id);
    }

    function resolvedKey() {
        var fromWindow = (typeof window.MMG_PVP_PEERJS_KEY === 'string')
            ? window.MMG_PVP_PEERJS_KEY.trim()
            : '';
        if (fromWindow) return fromWindow;
        return String(MMG_PVP_PEERJS_KEY || '').trim();
    }

    function makePeer(id) {
        var opts = {};
        var key = resolvedKey();
        if (key) opts.key = key;
        var extra = window.MMG_PVP_PEER_CONFIG;
        if (extra && typeof extra === 'object') {
            ['host', 'port', 'path', 'secure', 'key', 'debug', 'config'].forEach(function (k) {
                if (extra[k] !== undefined && extra[k] !== null && extra[k] !== '') opts[k] = extra[k];
            });
        }
        if (id) return new Peer(id, opts);
        return new Peer(opts);
    }

    function randomCode() {
        var buf = new Uint32Array(CODE_LEN);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(buf);
        } else {
            for (var i = 0; i < CODE_LEN; i++) buf[i] = Math.floor(Math.random() * 4294967295);
        }
        var out = '';
        for (var j = 0; j < CODE_LEN; j++) out += CODE_ALPHABET[buf[j] % CODE_ALPHABET.length];
        return out;
    }

    function normalizeCode(raw) {
        var s = String(raw || '').trim().toUpperCase();
        if (!s) return '';
        var fromHash = /PVP=([A-Z0-9]{4})(?:[^A-Z0-9]|$)/.exec(s);
        if (fromHash) {
            s = fromHash[1];
        } else {
            s = s.replace(/\s+/g, '');
            s = s.replace(/^MMG-?/, '');
            s = s.replace(/[^A-Z0-9]/g, '');
        }
        if (s.length !== CODE_LEN) return '';
        if (/[01OI]/.test(s)) return '';
        return s;
    }

    function codeFromHash() {
        return normalizeCode(String(location.hash || '').replace(/^#/, ''));
    }

    function shareUrl(code) {
        var url = new URL(location.href);
        url.hash = 'pvp=' + code;
        return url.toString();
    }

    function publishHash(code) {
        var next = '#pvp=' + code;
        if (location.hash === next) return;
        try {
            history.replaceState(null, '', location.pathname + location.search + next);
        } catch (e) {
            location.hash = 'pvp=' + code;
        }
    }

    function clearHash() {
        if (!/^#pvp=/i.test(location.hash || '')) return;
        try {
            history.replaceState(null, '', location.pathname + location.search);
        } catch (e) {
            location.hash = '';
        }
    }

    function myName() {
        var n = '';
        try {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.nickname) {
                n = String(currentUser.nickname);
            }
        } catch (e) { /* 未登入就用「玩家」 */ }
        return sanitizeName(n);
    }

    function sanitizeName(raw) {
        var n = String(raw || '').replace(/[\u0000-\u001f]/g, '').trim();
        if (!n) n = '玩家';
        if (n.length > 16) n = n.slice(0, 16);
        return n;
    }

    function makeQuestion() {
        var a = 2 + Math.floor(Math.random() * 8);
        var b = 2 + Math.floor(Math.random() * 8);
        var roll = Math.floor(Math.random() * 3);
        var stem;
        var ans;
        if (roll === 0) {
            stem = '計算：' + a + ' + ' + b + ' = ?';
            ans = a + b;
        } else if (roll === 1) {
            var hi = Math.max(a, b) + 2;
            var lo = Math.min(a, b);
            stem = '計算：' + hi + ' − ' + lo + ' = ?';
            ans = hi - lo;
        } else {
            stem = '計算：' + a + ' × ' + b + ' = ?';
            ans = a * b;
        }
        var nums = [ans];
        var deltas = [1, -1, 2, -2, 10, -10, a, b, 3];
        for (var i = 0; i < deltas.length && nums.length < 4; i++) {
            var n = ans + deltas[i];
            if (n >= 0 && nums.indexOf(n) === -1) nums.push(n);
        }
        while (nums.length < 4) {
            var extra = ans + nums.length + 3;
            if (nums.indexOf(extra) === -1) nums.push(extra);
        }
        for (var j = nums.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var tmp = nums[j];
            nums[j] = nums[k];
            nums[k] = tmp;
        }
        return {
            roundId: 'r1',
            stem: stem,
            options: nums.map(function (n) { return String(n); }),
            answer: String(ans)
        };
    }

    function sanitizeQuestion(msg) {
        if (!msg || msg.t !== 'question') return null;
        var stem = String(msg.stem || '').replace(/[\u0000-\u001f]/g, '').trim();
        if (!stem || stem.length > 180) return null;
        if (!Array.isArray(msg.options) || msg.options.length < 2 || msg.options.length > 6) return null;
        var options = [];
        for (var i = 0; i < msg.options.length; i++) {
            var opt = String(msg.options[i] == null ? '' : msg.options[i]).replace(/[\u0000-\u001f]/g, '').trim();
            if (!opt || opt.length > 24) return null;
            if (options.indexOf(opt) !== -1) return null;
            options.push(opt);
        }
        var answer = String(msg.answer == null ? '' : msg.answer);
        if (options.indexOf(answer) === -1) return null;
        var roundId = String(msg.roundId || 'r1');
        if (!/^[A-Za-z0-9_-]{1,16}$/.test(roundId)) roundId = 'r1';
        return { roundId: roundId, stem: stem, options: options, answer: answer };
    }

    function showStep(name) {
        ['lobby', 'room', 'quiz'].forEach(function (step) {
            var el = $('pvp-step-' + step);
            if (!el) return;
            el.classList.toggle('hidden', step !== name);
        });
    }

    function setMsg(id, text, kind) {
        var el = $(id);
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-ok', kind === 'ok');
    }

    function setBusy(busy) {
        ['pvp-create-btn', 'pvp-join-btn'].forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.disabled = !!busy;
        });
    }

    function paintCode(code) {
        var el = $('pvp-room-code');
        var url = $('pvp-room-url');
        if (el) el.textContent = code ? code.split('').join(' ') : '····';
        if (url) url.textContent = code ? shareUrl(code) : '';
    }

    function refreshKicker() {
        var kicker = $('pvp-quiz-kicker');
        if (!kicker) return;
        var who = state.opponentName ? ('對住 ' + state.opponentName) : '已接通';
        kicker.textContent = '房號 ' + (state.code || '----') + ' · ' + who;
    }

    function clearIceTimer() {
        if (state.iceTimer) {
            clearTimeout(state.iceTimer);
            state.iceTimer = null;
        }
    }

    function destroySession() {
        state.token += 1;
        clearIceTimer();
        var conn = state.conn;
        var peer = state.peer;
        state.conn = null;
        state.peer = null;
        state.connected = false;
        state.role = null;
        state.code = '';
        state.opponentName = '';
        state.question = null;
        state.myChoice = null;
        state.theirChoice = null;
        state.finished = false;
        state.outcome = null;
        if (conn) {
            try { conn.close(); } catch (e) { /* already closed */ }
        }
        if (peer) {
            peer._mmgIgnore = true;
            try { peer.destroy(); } catch (e) { /* already destroyed */ }
        }
    }

    function ensureLib() {
        if (typeof Peer === 'function') return true;
        showStep('lobby');
        setBusy(false);
        setMsg('pvp-lobby-msg', '載入唔到 PeerJS。請檢查網絡（CDN）再重新整理。', 'error');
        return false;
    }

    function messageForPeerError(err) {
        var type = err && err.type;
        if (type === 'peer-unavailable') {
            return '搵唔到呢間房。請對吓房號，或者等房主開定房先。';
        }
        if (type === 'unavailable-id') {
            return '房號被人用緊。請再開一次房。';
        }
        if (type === 'invalid-key') {
            return 'PeerJS Cloud 拒絕咗把鎖匙。請喺 pvp-peer.js 填 MMG_PVP_PEERJS_KEY。';
        }
        if (type === 'browser-incompatible') {
            return '你部瀏覽器未支援 WebRTC。用 Chrome 或 Edge 再試。';
        }
        if (type === 'invalid-id') {
            return '房號格式有問題。請再開一次房。';
        }
        if (type === 'webrtc') {
            return '點對點連線失敗。可能係防火牆擋住，請再試。學校網絡之後可能要加 TURN。';
        }
        if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed' || type === 'ssl-unavailable' || type === 'disconnected') {
            return '連唔到 PeerJS Cloud。請檢查網絡，陣間再試。';
        }
        return '連線失敗。請再試一次。';
    }

    function fail(text) {
        destroySession();
        clearHash();
        showStep('lobby');
        setBusy(false);
        setMsg('pvp-lobby-msg', text, 'error');
    }

    function explainBadCode(raw) {
        var s = String(raw || '').toUpperCase();
        if (/[01OI]/.test(s)) {
            return '房號唔好用 0、O、1、I，以免同字母睇錯。請房主再講一次。';
        }
        return '房號要 4 位字母或數字。請對吓再入。';
    }

    function armIceWatch(token) {
        clearIceTimer();
        state.iceTimer = setTimeout(function () {
            if (state.token !== token || state.connected) return;
            setMsg(
                'pvp-room-msg',
                '連線好耐都未通。可能係 NAT 或防火牆擋住點對點（學校 Wi‑Fi 有時會咁）。可以離開再試；而家未用 TURN。',
                'error'
            );
        }, ICE_WAIT_MS);
    }

    function sendJson(conn, payload) {
        try {
            conn.send(payload);
            return true;
        } catch (e) {
            return false;
        }
    }

    function showQuiz(q) {
        showStep('quiz');
        refreshKicker();
        var stem = $('pvp-stem');
        if (stem) stem.textContent = q.stem;
        var box = $('pvp-options');
        if (box) {
            box.innerHTML = '';
            q.options.forEach(function (opt) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'pvp-opt';
                b.textContent = opt;
                b.addEventListener('click', function () { pick(opt); });
                box.appendChild(b);
            });
        }
        var result = $('pvp-result');
        if (result) {
            result.classList.add('hidden');
            result.innerHTML = '';
        }
        var again = $('pvp-again-btn');
        if (again) again.classList.add('hidden');
        setMsg('pvp-quiz-msg', '揀一個答案。');
        setBusy(false);
    }

    function paintOptions() {
        var box = $('pvp-options');
        if (!box || !state.question) return;
        var buttons = box.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            var choice = buttons[i].textContent;
            buttons[i].disabled = !!state.myChoice;
            buttons[i].classList.toggle('is-picked', choice === state.myChoice && !state.finished);
            buttons[i].classList.toggle('is-correct', !!state.finished && choice === state.question.answer);
            buttons[i].classList.toggle(
                'is-wrong',
                !!state.finished && choice === state.myChoice && choice !== state.question.answer
            );
        }
    }

    function renderResult() {
        var q = state.question;
        if (!q) return;
        var title = '雙方都答錯。';
        if (state.outcome === 'both') title = '雙方都答啱！';
        else if (state.outcome === 'win') title = '你贏咗！';
        else if (state.outcome === 'lose') title = '你輸咗。';
        var who = state.opponentName || '對手';
        var box = $('pvp-result');
        if (box) {
            box.classList.remove('hidden');
            box.innerHTML = '';
            var h = document.createElement('p');
            h.className = 'pvp-result__title';
            h.textContent = title;
            var p = document.createElement('p');
            p.className = 'pvp-result__detail';
            p.textContent = '正確答案：' + q.answer
                + '　你揀：' + (state.myChoice || '—')
                + '　' + who + '揀：' + (state.theirChoice || '—');
            box.appendChild(h);
            box.appendChild(p);
        }
        setMsg('pvp-quiz-msg', '');
        paintOptions();
        var again = $('pvp-again-btn');
        if (again) again.classList.remove('hidden');
    }

    function maybeFinish() {
        if (state.finished || !state.question || !state.myChoice || !state.theirChoice) return;
        var q = state.question;
        var mineOk = state.myChoice === q.answer;
        var theirsOk = state.theirChoice === q.answer;
        if (mineOk && theirsOk) state.outcome = 'both';
        else if (mineOk) state.outcome = 'win';
        else if (theirsOk) state.outcome = 'lose';
        else state.outcome = 'neither';
        state.finished = true;
        renderResult();
    }

    function pick(choice) {
        if (!state.question || state.myChoice || state.finished) return;
        if (state.question.options.indexOf(choice) === -1) return;
        state.myChoice = choice;
        paintOptions();
        if (state.conn && state.conn.open) {
            sendJson(state.conn, {
                v: 1,
                t: 'answer',
                roundId: state.question.roundId,
                choice: choice
            });
        }
        if (!state.theirChoice) setMsg('pvp-quiz-msg', '你揀咗「' + choice + '」。等對手交卷…');
        maybeFinish();
    }

    function onChannelOpen(conn, token) {
        if (state.token !== token || state.conn !== conn) return;
        state.connected = true;
        clearIceTimer();
        sendJson(conn, { v: 1, t: 'hello', name: myName() });
        if (state.role === 'host') {
            var q = makeQuestion();
            state.question = q;
            state.myChoice = null;
            state.theirChoice = null;
            state.finished = false;
            state.outcome = null;
            sendJson(conn, {
                v: 1,
                t: 'question',
                roundId: q.roundId,
                stem: q.stem,
                options: q.options,
                answer: q.answer
            });
            showQuiz(q);
        } else {
            setMsg('pvp-room-msg', '已接通房主，等題目…', 'ok');
        }
    }

    function handleRemoteClose(token) {
        var wasHost = state.role === 'host';
        var peer = state.peer;
        var finished = state.finished;
        state.conn = null;
        state.connected = false;
        if (finished) {
            setMsg('pvp-quiz-msg', '對手離開咗房間。', 'error');
            return;
        }
        if (wasHost && peer && !peer.destroyed && !peer._mmgIgnore) {
            state.question = null;
            state.myChoice = null;
            state.theirChoice = null;
            state.opponentName = '';
            showStep('room');
            paintCode(state.code);
            setMsg('pvp-room-msg', '對手離開咗。房號仲用得，可以再等人入房。', 'error');
            return;
        }
        // 等 peer-unavailable 先講「搵唔到房」；冇更具體嘅錯先至話中斷。
        setTimeout(function () {
            if (state.token !== token) return;
            fail('連線中斷。對手可能離開咗，或者網絡斷開。');
        }, 50);
    }

    function onData(msg, token, conn) {
        if (state.token !== token || state.conn !== conn || !msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') {
            state.opponentName = sanitizeName(msg.name);
            refreshKicker();
            return;
        }
        if (msg.t === 'full') {
            fail('呢間房已經有人。請房主再開一間新房。');
            return;
        }
        if (msg.t === 'question') {
            var q = sanitizeQuestion(msg);
            if (!q) {
                fail('收到嘅題目唔完整。請房主離開再開一次。');
                return;
            }
            state.question = q;
            state.myChoice = null;
            state.theirChoice = null;
            state.finished = false;
            state.outcome = null;
            showQuiz(q);
            return;
        }
        if (msg.t === 'answer') {
            if (!state.question || String(msg.roundId || '') !== state.question.roundId) return;
            var choice = String(msg.choice == null ? '' : msg.choice);
            if (state.question.options.indexOf(choice) === -1) return;
            state.theirChoice = choice;
            if (!state.finished && state.myChoice) setMsg('pvp-quiz-msg', '對手都交咗卷。', 'ok');
            else if (!state.finished) setMsg('pvp-quiz-msg', '對手已交卷，等你揀答案。');
            maybeFinish();
        }
    }

    function armConn(conn, token) {
        if (!conn) return;
        armIceWatch(token);
        conn.on('data', function (msg) { onData(msg, token, conn); });
        conn.on('close', function () {
            if (state.token !== token || state.conn !== conn) return;
            handleRemoteClose(token);
        });
        conn.on('error', function () {
            if (state.token !== token || state.conn !== conn || state.finished) return;
            setMsg('pvp-room-msg', '同對手嘅連線出錯。可以離開再試。', 'error');
        });
        if (conn.open) onChannelOpen(conn, token);
        else conn.on('open', function () { onChannelOpen(conn, token); });
    }

    function handlePeerError(err, token, peer) {
        if (!peer || peer._mmgIgnore || state.token !== token) return;
        var type = err && err.type;
        console.warn('[pvp] PeerJS', type || err);
        if (type === 'unavailable-id') return;
        fail(messageForPeerError(err));
    }

    function watchPeer(peer, token) {
        peer.on('error', function (err) { handlePeerError(err, token, peer); });
        peer.on('disconnected', function () {
            if (state.token !== token || peer._mmgIgnore) return;
            if (state.connected && state.conn && state.conn.open) return;
            fail('同 PeerJS Cloud 嘅連線中斷。請再試一次。');
        });
    }

    function rejectExtra(conn) {
        var sendFull = function () {
            sendJson(conn, { v: 1, t: 'full' });
            try { conn.close(); } catch (e) { /* ignore */ }
        };
        if (conn.open) sendFull();
        else conn.on('open', sendFull);
    }

    function tryHost(token, attempt) {
        if (state.token !== token) return;
        if (!ensureLib()) return;
        var code = randomCode();
        var peer;
        try {
            peer = makePeer(ID_PREFIX + code);
        } catch (e) {
            fail('開房失敗。請再試一次。');
            return;
        }
        state.peer = peer;
        state.role = 'host';
        state.code = code;
        paintCode('');
        setMsg('pvp-room-msg', '等緊 PeerJS Cloud 開房…');
        var opened = false;
        peer.on('open', function (id) {
            if (state.token !== token || state.peer !== peer) return;
            opened = true;
            var actual = String(id || '');
            if (actual.indexOf(ID_PREFIX) === 0) {
                code = actual.slice(ID_PREFIX.length).toUpperCase();
                state.code = code;
            }
            publishHash(code);
            paintCode(code);
            setMsg('pvp-room-msg', '房號已開好。叫對手輸入房號，或者將連結傳俾佢。', 'ok');
            setBusy(false);
        });
        peer.on('connection', function (conn) {
            if (state.token !== token || state.peer !== peer || state.conn || state.finished) {
                rejectExtra(conn);
                return;
            }
            state.conn = conn;
            state.finished = false;
            state.myChoice = null;
            state.theirChoice = null;
            state.question = null;
            state.outcome = null;
            armConn(conn, token);
        });
        peer.on('error', function (err) {
            if (!peer || peer._mmgIgnore || state.token !== token || state.peer !== peer) return;
            if (err && err.type === 'unavailable-id' && attempt < 5 && !opened) {
                console.warn('[pvp] room id taken, retrying');
                peer._mmgIgnore = true;
                if (state.peer === peer) state.peer = null;
                try { peer.destroy(); } catch (e) { /* ignore */ }
                setMsg('pvp-room-msg', '房號被人用緊，幫你換緊另一個…');
                tryHost(token, attempt + 1);
                return;
            }
            handlePeerError(err, token, peer);
        });
        peer.on('disconnected', function () {
            if (state.token !== token || peer._mmgIgnore || state.peer !== peer) return;
            if (state.connected && state.conn && state.conn.open) return;
            fail('同 PeerJS Cloud 嘅連線中斷。請再試一次。');
        });
    }

    function createRoom() {
        if (!ensureLib()) return;
        destroySession();
        var token = state.token;
        setBusy(true);
        showStep('room');
        setMsg('pvp-lobby-msg', '');
        tryHost(token, 0);
    }

    function joinRoom(raw) {
        var code = normalizeCode(raw);
        if (!code) {
            setMsg('pvp-lobby-msg', explainBadCode(raw), 'error');
            return;
        }
        if (!ensureLib()) return;
        destroySession();
        var token = state.token;
        state.role = 'guest';
        state.code = code;
        setBusy(true);
        showStep('room');
        paintCode(code);
        setMsg('pvp-lobby-msg', '');
        setMsg('pvp-room-msg', '等緊 PeerJS Cloud，跟住入房 ' + code + '…');
        var peer;
        try {
            peer = makePeer(null);
        } catch (e) {
            fail('入房失敗。請再試一次。');
            return;
        }
        state.peer = peer;
        watchPeer(peer, token);
        peer.on('open', function () {
            if (state.token !== token || state.peer !== peer) return;
            publishHash(code);
            var conn;
            try {
                conn = peer.connect(ID_PREFIX + code, {
                    reliable: true,
                    serialization: 'json',
                    metadata: { name: myName() }
                });
            } catch (e) {
                fail('入房失敗。請再試一次。');
                return;
            }
            if (!conn) {
                fail('入房失敗。請再試一次。');
                return;
            }
            state.conn = conn;
            setMsg('pvp-room-msg', '搵到信令，等緊同房主接通…');
            armConn(conn, token);
        });
    }

    function leaveToLobby(note) {
        destroySession();
        clearHash();
        showStep('lobby');
        setBusy(false);
        setMsg('pvp-lobby-msg', note || '', note ? 'ok' : null);
    }

    function copyText(text, okMsg) {
        function done(ok) {
            var msg = ok ? okMsg : '複製唔到，請長按房號自己抄。';
            if (typeof showSyncToast === 'function') showSyncToast(msg);
            else setMsg('pvp-room-msg', msg, ok ? 'ok' : 'error');
        }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            done(ok);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
        } else {
            fallback();
        }
    }

    function bindUi() {
        if (uiBound) return;
        if (!$('view-pvp')) return;
        uiBound = true;
        var createBtn = $('pvp-create-btn');
        if (createBtn) createBtn.addEventListener('click', function () { createRoom(); });
        var form = $('pvp-join-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var input = $('pvp-join-code');
                joinRoom(input ? input.value : '');
            });
        }
        var input = $('pvp-join-code');
        if (input) {
            input.addEventListener('input', function () {
                var cleaned = String(input.value || '').toUpperCase();
                if (cleaned !== input.value) input.value = cleaned;
            });
        }
        var copyCode = $('pvp-copy-code');
        if (copyCode) {
            copyCode.addEventListener('click', function () {
                if (!state.code) return;
                copyText(state.code, '已複製房號 ' + state.code);
            });
        }
        var copyLink = $('pvp-copy-link');
        if (copyLink) {
            copyLink.addEventListener('click', function () {
                if (!state.code) return;
                copyText(shareUrl(state.code), '已複製入房連結');
            });
        }
        var leaveBtn = $('pvp-leave-btn');
        if (leaveBtn) leaveBtn.addEventListener('click', function () { leaveToLobby('已離開房間。'); });
        var again = $('pvp-again-btn');
        if (again) again.addEventListener('click', function () { leaveToLobby('可以再開一局。上一題唔會再同步。'); });
    }

    function onEnterView() {
        bindUi();
        if (state.peer) return;
        showStep('lobby');
        setBusy(false);
        var code = codeFromHash();
        var input = $('pvp-join-code');
        if (input && code && !String(input.value || '').trim()) input.value = code;
    }

    function onLeaveView() {
        var view = $('view-pvp');
        if (view && !view.classList.contains('hidden')) return;
        if (!state.peer && !state.conn) return;
        destroySession();
        clearHash();
        showStep('lobby');
        setBusy(false);
    }

    function offerHashJoin() {
        if (!codeFromHash()) return;
        if (typeof switchView !== 'function') return;
        switchView('pvp');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUi);
    } else {
        bindUi();
    }

    window.MmgPvp = {
        onEnterView: onEnterView,
        onLeaveView: onLeaveView,
        offerHashJoin: offerHashJoin,
        createRoom: createRoom,
        joinRoom: joinRoom,
        leaveRoom: function () { leaveToLobby('已離開房間。'); },
        normalizeCode: normalizeCode,
        makeQuestion: makeQuestion,
        debugState: function () {
            return {
                role: state.role,
                code: state.code,
                connected: state.connected,
                opponentName: state.opponentName,
                stem: state.question ? state.question.stem : '',
                options: state.question ? state.question.options.slice() : [],
                answer: state.question ? state.question.answer : '',
                myChoice: state.myChoice,
                theirChoice: state.theirChoice,
                finished: state.finished,
                outcome: state.outcome
            };
        }
    };
})();
