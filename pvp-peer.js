/**
 * 1v1 怪獸對戰 — 加密 WebSocket 房間中繼。
 *
 * 對戰訊息經 wss（443）送到 Cloudflare Worker，再由 Durable Object
 * 轉去同一間房嘅對手。唔經點對點。部署步驟喺 relay/README.md。
 *
 * 正式中繼係下面 MMG_PVP_RELAY_URL：wss、無路徑、無尾斜線。
 * 本地 wrangler dev 可以喺載入本檔之前
 * 設定 window.MMG_PVP_RELAY_URL = 'ws://127.0.0.1:8787'。
 * 如果個常數留空，開房時會話未設定。
 *
 * 傷害（房主計，再廣播 sync；客人介面以 sync 嘅 HP 作準）：
 * - 答啱先打到對手。
 *   raw = floor(自己 ATK × 1.8)
 *   dmg = floor(raw × 屬性倍率)
 *   屬性倍率用單人 getElementAdvantageMultiplier（克制 1.5、被克 0.7、否則 1）。
 *   上限 = max(1, floor(對手最大 HP × 0.28))，同單人「單次唔超過約三成」一樣。
 *   唔再用單人嗰個「最少 45」下限，等低等級都要打多題，ATK 先有意義。
 *   dmg 最少 1。8 秒或以內答啱再 ×1.15，但唔超過 floor(上限 × 1.15)。
 * - 答錯打唔中。自己扣 max(8, floor(自己最大 HP × 0.12))，而且唔超過自己最大 HP。
 *   比單人「答錯被 BOSS 重擊」輕，先可以打多幾題；方向一樣係答錯會痛。
 * - 同一題兩邊一齊結算。兩邊 HP 同時 ≤ 0 算打和。
 * - 打滿 24 題未分勝負：剩血高者勝，一樣就打和。
 * 出戰獸只傳 id 同等級，兩邊用 getMonsterRuntimeData 重算，唔信對方自填嘅 ATK／HP。
 */
(function () {
    'use strict';

    var MMG_PVP_RELAY_URL = 'wss://math-monster-pvp-relay.ayaxysew.workers.dev';
    var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var CODE_LEN = 4;
    var CONNECT_WAIT_MS = 12000;
    var PING_MS = 20000;
    var MAX_HOST_TRIES = 5;
    var ROUND_GAP_MS = 1700;
    var MAX_ROUNDS = 24;
    var SPEED_MS = 8000;

    var state = emptyState();
    var uiBound = false;

    function emptyState() {
        return {
            token: 0,
            role: null,
            code: '',
            socket: null,
            connected: false,
            welcomed: false,
            attempt: 0,
            opponentName: '',
            phase: 'lobby',
            rosterPick: null,
            pickLocked: false,
            myBeast: null,
            theirBeast: null,
            myHp: 0,
            theirHp: 0,
            round: 0,
            question: null,
            pendingQuestion: null,
            myChoice: null,
            theirChoice: null,
            myMs: null,
            theirMs: null,
            shownAt: 0,
            questionSettled: true,
            matchOver: false,
            finished: false,
            outcome: null,
            rematchSent: false,
            theirRematch: false,
            advanceTimer: null,
            connectTimer: null,
            pingTimer: null
        };
    }

    function $(id) {
        return document.getElementById(id);
    }

    function relayUrl() {
        var fromWindow = (typeof window.MMG_PVP_RELAY_URL === 'string')
            ? window.MMG_PVP_RELAY_URL.trim()
            : '';
        var base = fromWindow || String(MMG_PVP_RELAY_URL || '').trim();
        return base.replace(/\/+$/, '');
    }

    function socketUrl(code, role) {
        return relayUrl() + '/room/' + code + '?role=' + role;
    }

    function openSocket(code, role) {
        return new WebSocket(socketUrl(code, role));
    }

    function canSend() {
        return !!(state.socket && state.socket.readyState === 1 && state.connected);
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

    function nowMs() {
        if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    function cleanMs(ms) {
        if (ms == null || ms === '') return null;
        var n = Math.floor(Number(ms));
        if (!(n >= 0 && n <= 120000)) return null;
        return n;
    }

    function answerMs() {
        if (!state.shownAt) return null;
        return cleanMs(Math.round(nowMs() - state.shownAt));
    }

    function elementMult(atkElem, defElem) {
        var m = 1;
        try {
            if (typeof getElementAdvantageMultiplier === 'function') {
                m = Number(getElementAdvantageMultiplier(atkElem, defElem));
            }
        } catch (e) {
            m = 1;
        }
        if (m === 1.5 || m === 0.7 || m === 1) return m;
        return 1;
    }

    function damageHit(attacker, defender, ms) {
        var atk = Math.floor(Number(attacker && attacker.atk));
        var maxHp = Math.floor(Number(defender && defender.maxHp));
        if (!(atk >= 0)) atk = 0;
        if (!(maxHp >= 1)) maxHp = 1;
        var mult = elementMult(attacker && attacker.element, defender && defender.element);
        var raw = Math.floor(atk * 1.8);
        var dmg = Math.floor(raw * mult);
        var cap = Math.floor(maxHp * 0.28);
        if (cap < 1) cap = 1;
        if (dmg > cap) dmg = cap;
        if (dmg < 1) dmg = 1;
        var speed = false;
        var msNum = cleanMs(ms);
        if (msNum != null && msNum <= SPEED_MS) {
            var boosted = Math.floor(dmg * 1.15);
            var boostCap = Math.floor(cap * 1.15);
            if (boostCap < 1) boostCap = 1;
            if (boosted > boostCap) boosted = boostCap;
            if (boosted > dmg) {
                dmg = boosted;
                speed = true;
            }
        }
        return { dmg: dmg, speed: speed, mult: mult, cap: cap };
    }

    function selfChip(beast) {
        var maxHp = Math.floor(Number(beast && beast.maxHp));
        if (!(maxHp >= 1)) return 1;
        var chip = Math.floor(maxHp * 0.12);
        if (chip < 8) chip = 8;
        if (chip > maxHp) chip = maxHp;
        return chip;
    }

    function resolveRoundPure(me, them, myOk, theirOk, myMs, theirMs, myHp, theirHp) {
        var myDealt = 0;
        var theirDealt = 0;
        var myChip = 0;
        var theirChip = 0;
        var speedMe = false;
        var speedThem = false;
        myHp = Math.floor(Number(myHp));
        theirHp = Math.floor(Number(theirHp));
        if (!(myHp >= 0)) myHp = 0;
        if (!(theirHp >= 0)) theirHp = 0;
        if (myOk) {
            var hit = damageHit(me, them, myMs);
            myDealt = hit.dmg;
            speedMe = hit.speed;
            theirHp -= myDealt;
        } else {
            myChip = selfChip(me);
            myHp -= myChip;
        }
        if (theirOk) {
            var hit2 = damageHit(them, me, theirMs);
            theirDealt = hit2.dmg;
            speedThem = hit2.speed;
            myHp -= theirDealt;
        } else {
            theirChip = selfChip(them);
            theirHp -= theirChip;
        }
        if (myHp < 0) myHp = 0;
        if (theirHp < 0) theirHp = 0;
        var ko = '';
        if (myHp <= 0 && theirHp <= 0) ko = 'draw';
        else if (theirHp <= 0) ko = 'me';
        else if (myHp <= 0) ko = 'them';
        return {
            myHp: myHp,
            theirHp: theirHp,
            myDealt: myDealt,
            theirDealt: theirDealt,
            myChip: myChip,
            theirChip: theirChip,
            speedMe: speedMe,
            speedThem: speedThem,
            ko: ko
        };
    }

    function winnerFromHp(hostHp, guestHp) {
        if (hostHp <= 0 && guestHp <= 0) return 'draw';
        if (guestHp <= 0) return 'host';
        if (hostHp <= 0) return 'guest';
        return '';
    }

    function clampDmg(n) {
        var x = Math.floor(Number(n));
        if (!(x >= 0 && x <= 99999)) return 0;
        return x;
    }

    function interpretSync(payload) {
        if (!payload || payload.t !== 'sync') return null;
        var roundId = String(payload.roundId || '');
        if (!roundOk(roundId)) return null;
        var hostHp = Math.floor(Number(payload.hostHp));
        var guestHp = Math.floor(Number(payload.guestHp));
        if (!(hostHp >= 0 && hostHp <= 99999)) return null;
        if (!(guestHp >= 0 && guestHp <= 99999)) return null;
        var winner = '';
        var cap = 0;
        if (hostHp <= 0 || guestHp <= 0) {
            winner = winnerFromHp(hostHp, guestHp);
        } else if (payload.cap && (payload.winner === 'host' || payload.winner === 'guest' || payload.winner === 'draw')) {
            winner = payload.winner;
            cap = 1;
        }
        return {
            roundId: roundId,
            hostHp: hostHp,
            guestHp: guestHp,
            winner: winner,
            cap: cap,
            hostDealt: clampDmg(payload.hostDealt),
            guestDealt: clampDmg(payload.guestDealt),
            hostChip: clampDmg(payload.hostChip),
            guestChip: clampDmg(payload.guestChip),
            hostSpeed: payload.hostSpeed ? 1 : 0,
            guestSpeed: payload.guestSpeed ? 1 : 0,
            hostOk: payload.hostOk ? 1 : 0,
            guestOk: payload.guestOk ? 1 : 0
        };
    }

    function roundOk(roundId) {
        var m = /^r(\d{1,2})$/.exec(String(roundId || ''));
        if (!m) return false;
        var n = parseInt(m[1], 10);
        return n >= 1 && n <= MAX_ROUNDS;
    }

    function roundNo(roundId) {
        var m = /^r(\d{1,2})$/.exec(String(roundId || ''));
        return m ? parseInt(m[1], 10) : 0;
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
            answer: String(ans),
            image: ''
        };
    }

    function sanitizeQuestion(msg) {
        if (!msg || msg.t !== 'question') return null;
        var stem = String(msg.stem || '').replace(/[\u0000-\u001f]/g, '').trim();
        if (!stem || stem.length > 1000) return null;
        if (!Array.isArray(msg.options) || msg.options.length < 2 || msg.options.length > 6) return null;
        var options = [];
        for (var i = 0; i < msg.options.length; i++) {
            var opt = String(msg.options[i] == null ? '' : msg.options[i]).replace(/[\u0000-\u001f]/g, '').trim();
            if (!opt || opt.length > 180) return null;
            if (options.indexOf(opt) !== -1) return null;
            options.push(opt);
        }
        var answer = String(msg.answer == null ? '' : msg.answer).replace(/[\u0000-\u001f]/g, '').trim();
        if (!answer || answer.length > 180 || options.indexOf(answer) === -1) return null;
        var roundId = String(msg.roundId || '');
        if (!roundOk(roundId)) return null;
        var image = '';
        if (msg.image) {
            var img = String(msg.image);
            if (/^q-images\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/.test(img)) image = img;
        }
        return { roundId: roundId, stem: stem, options: options, answer: answer, image: image };
    }

    function adaptGenerated(raw, roundId) {
        if (!raw) return null;
        var stem = String(raw.question || '').replace(/[\u0000-\u001f]/g, '').replace(/^【[^】]{0,80}】\s*/, '').trim();
        var answer = String(raw.correctAnswer == null ? '' : raw.correctAnswer).replace(/[\u0000-\u001f]/g, '').trim();
        var options = [];
        var src = Array.isArray(raw.options) ? raw.options : [];
        for (var i = 0; i < src.length; i++) {
            var opt = String(src[i] == null ? '' : src[i]).replace(/[\u0000-\u001f]/g, '').trim();
            if (!opt || options.indexOf(opt) !== -1) continue;
            options.push(opt);
        }
        if (answer && options.indexOf(answer) === -1) options.unshift(answer);
        if (options.length > 6) {
            options = options.slice(0, 6);
            if (answer && options.indexOf(answer) === -1) options[5] = answer;
        }
        var image = '';
        if (raw.image && /^q-images\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/.test(String(raw.image))) {
            image = String(raw.image);
        }
        return sanitizeQuestion({
            t: 'question',
            roundId: roundId,
            stem: stem,
            options: options,
            answer: answer,
            image: image
        });
    }

    function makeBattleQuestion(n) {
        var roundId = 'r' + n;
        var raw = null;
        if (typeof generatePvpQuestion === 'function') {
            try { raw = generatePvpQuestion(); } catch (e) { raw = null; }
        }
        var adapted = adaptGenerated(raw, roundId);
        if (adapted) return adapted;
        var fb = makeQuestion();
        fb.roundId = roundId;
        return sanitizeQuestion({
            t: 'question',
            roundId: roundId,
            stem: fb.stem,
            options: fb.options,
            answer: fb.answer,
            image: ''
        });
    }

    function canonBeast(b) {
        if (!b || typeof b !== 'object') return null;
        var id = String(b.id || '');
        if (!/^[a-z0-9_]{1,32}$/.test(id)) return null;
        var level = Math.floor(Number(b.level));
        if (!(level >= 1 && level <= 40)) return null;
        var maxHp = Math.floor(Number(b.maxHp));
        var atk = Math.floor(Number(b.atk));
        var defn = Math.floor(Number(b.def));
        if (!(maxHp >= 1 && maxHp <= 99999)) return null;
        if (!(atk >= 1 && atk <= 99999)) return null;
        if (!(defn >= 0 && defn <= 99999)) defn = 0;
        var element = String(b.element || '');
        if (!/^[a-z]{1,16}$/.test(element)) return null;
        var name = String(b.name || '').replace(/[\u0000-\u001f]/g, '').trim();
        if (!name || name.length > 32) return null;
        var imgKey = String(b.imgKey || '');
        if (!/^[a-z0-9_]{0,40}$/.test(imgKey)) imgKey = '';
        return { id: id, name: name, element: element, level: level, maxHp: maxHp, atk: atk, def: defn, imgKey: imgKey };
    }

    function resolveLocal(id, level) {
        try {
            if (window.MmgPvpRoster && typeof window.MmgPvpRoster.resolve === 'function') {
                return canonBeast(window.MmgPvpRoster.resolve(id, level));
            }
        } catch (e) { /* 獸鑑未載入 */ }
        return null;
    }

    function ownedRoster() {
        try {
            if (window.MmgPvpRoster && typeof window.MmgPvpRoster.listOwned === 'function') {
                var list = window.MmgPvpRoster.listOwned();
                if (Array.isArray(list)) return list;
            }
        } catch (e) { /* 未登入或獸鑑未載入 */ }
        return [];
    }

    function elementLabel(element) {
        try {
            if (window.MmgPvpRoster && typeof window.MmgPvpRoster.elementLabel === 'function') {
                var zh = window.MmgPvpRoster.elementLabel(element);
                if (zh) return String(zh);
            }
        } catch (e) {}
        return '';
    }

    function beastSrc(beast) {
        try {
            if (beast && window.MmgPvpRoster && typeof window.MmgPvpRoster.imageSrc === 'function') {
                return window.MmgPvpRoster.imageSrc(beast.imgKey) || '';
            }
        } catch (e) {}
        return '';
    }

    function showStep(name) {
        ['lobby', 'room', 'pick', 'fight'].forEach(function (step) {
            var el = $('pvp-step-' + step);
            if (!el) return;
            el.classList.toggle('hidden', step !== name);
        });
        var lead = $('pvp-lead');
        if (lead) lead.classList.toggle('hidden', name === 'pick' || name === 'fight');
        var foot = document.querySelector('#view-pvp .pvp-footnote');
        if (foot) foot.classList.toggle('hidden', name === 'fight');
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
        var code = state.code || '----';
        var who = state.opponentName ? ('對住 ' + state.opponentName) : '等緊對手';
        var pick = $('pvp-pick-kicker');
        if (pick) pick.textContent = '房號 ' + code + ' · ' + who;
        var fight = $('pvp-fight-kicker');
        if (fight) {
            var roundBit = state.round ? ('第 ' + state.round + ' 題 · ') : '';
            fight.textContent = roundBit + '房號 ' + code + ' · ' + who;
        }
    }

    function clearConnectTimer() {
        if (state.connectTimer) {
            clearTimeout(state.connectTimer);
            state.connectTimer = null;
        }
    }

    function clearPing() {
        if (state.pingTimer) {
            clearInterval(state.pingTimer);
            state.pingTimer = null;
        }
    }

    function clearAdvance() {
        if (state.advanceTimer) {
            clearTimeout(state.advanceTimer);
            state.advanceTimer = null;
        }
    }

    function destroySession() {
        state.token += 1;
        clearConnectTimer();
        clearPing();
        clearAdvance();
        var socket = state.socket;
        var token = state.token;
        var fresh = emptyState();
        fresh.token = token;
        Object.keys(state).forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(fresh, k)) delete state[k];
        });
        Object.keys(fresh).forEach(function (k) { state[k] = fresh[k]; });
        if (socket) {
            try { socket.close(); } catch (e) { /* already closed */ }
        }
    }

    function ensureRelay() {
        var url = relayUrl();
        if (!url) {
            showStep('lobby');
            setBusy(false);
            setMsg('pvp-lobby-msg', '未設定對戰中繼網址。請喺 pvp-peer.js 填 MMG_PVP_RELAY_URL，部署中繼之後先開得到房。', 'error');
            return false;
        }
        if (!/^wss:\/\//i.test(url) && !/^ws:\/\//i.test(url)) {
            showStep('lobby');
            setBusy(false);
            setMsg('pvp-lobby-msg', '對戰中繼網址要係 ws:// 或 wss://。請檢查 MMG_PVP_RELAY_URL。', 'error');
            return false;
        }
        if (typeof WebSocket !== 'function') {
            showStep('lobby');
            setBusy(false);
            setMsg('pvp-lobby-msg', '你部瀏覽器未支援 WebSocket。用新版 Chrome 或 Edge 再試。', 'error');
            return false;
        }
        return true;
    }

    function relayErrorText(eventName) {
        if (eventName === 'no-room') return '搵唔到呢間房。請對吓房號，或者等房主開定房先。';
        if (eventName === 'room-full') return '呢間房已經有人。請房主再開一間新房。';
        if (eventName === 'room-taken') return '房號被人用緊。請再開一次房。';
        if (eventName === 'invalid-code') return '房號格式有問題。請再開一次房。';
        if (eventName === 'bad-role') return '入房角色有問題。請離開再開一次。';
        if (eventName === 'host-gone') return '房主離開咗房間。請返去大廳，等新房號再開。';
        if (eventName === 'wrong-room') return '房號同中繼對唔上。請離開再開一次。';
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

    function armConnectWatch(token, socket) {
        clearConnectTimer();
        state.connectTimer = setTimeout(function () {
            if (state.token !== token || state.socket !== socket || state.welcomed) return;
            fail('連唔到對戰中繼伺服器。請檢查網絡，陣間再試。');
        }, CONNECT_WAIT_MS);
    }

    function armKeepalive(token, socket) {
        clearPing();
        state.pingTimer = setInterval(function () {
            if (state.token !== token || state.socket !== socket) return;
            if (!state.socket || state.socket.readyState !== 1) return;
            sendJson({ v: 2, t: 'ping' });
        }, PING_MS);
    }

    function sendJson(payload) {
        if (!state.socket || state.socket.readyState !== 1) return false;
        try {
            state.socket.send(JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }

    function parseMsg(data) {
        if (typeof data !== 'string' || data.length > 40000) return null;
        try {
            var msg = JSON.parse(data);
            if (!msg || typeof msg !== 'object') return null;
            return msg;
        } catch (e) {
            return null;
        }
    }

    function fillArt(el, beast) {
        if (!el) return;
        var key = beast ? (beast.id + ':' + beast.level) : '';
        if (el.dataset.beastId === key && el.childNodes.length) return;
        el.dataset.beastId = key;
        while (el.firstChild) el.removeChild(el.firstChild);
        if (!beast) return;
        var src = beastSrc(beast);
        if (src) {
            var img = document.createElement('img');
            img.src = src;
            img.alt = beast.name;
            el.appendChild(img);
            return;
        }
        var ph = document.createElement('div');
        ph.className = el.classList && el.classList.contains('pvp-card__art') ? 'pvp-card__ph' : 'pvp-beast__ph';
        ph.textContent = beast.name.slice(0, 1);
        el.appendChild(ph);
    }

    function beastMeta(beast) {
        if (!beast) return '';
        var bits = [];
        var el = elementLabel(beast.element);
        if (el) bits.push(el + '系');
        bits.push('Lv.' + beast.level);
        bits.push('ATK ' + beast.atk);
        return bits.join(' · ');
    }

    function paintCreatureRoles() {
        var foeRole = $('pvp-foe-role');
        var meRole = $('pvp-me-role');
        if (foeRole) foeRole.textContent = state.opponentName ? ('對手 · ' + state.opponentName) : '對手';
        if (meRole) meRole.textContent = '我 · ' + myName();
    }

    function paintOneBeast(side) {
        var beast = side === 'me' ? state.myBeast : state.theirBeast;
        var hp = side === 'me' ? state.myHp : state.theirHp;
        var prefix = side === 'me' ? 'pvp-me' : 'pvp-foe';
        var card = $(prefix);
        var nameEl = $(prefix + '-name');
        var metaEl = $(prefix + '-meta');
        var track = $(prefix + '-track');
        var fill = $(prefix + '-fill');
        var hpEl = $(prefix + '-hp');
        if (nameEl) nameEl.textContent = beast ? beast.name : '……';
        if (metaEl) metaEl.textContent = beastMeta(beast);
        fillArt($(prefix + '-art'), beast);
        var maxHp = beast ? beast.maxHp : 0;
        var pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round(hp / maxHp * 100))) : 0;
        if (fill) fill.style.width = pct + '%';
        if (track) track.classList.toggle('is-low', maxHp > 0 && hp > 0 && pct <= 30);
        if (card) card.classList.toggle('is-ko', !!beast && hp <= 0);
        if (hpEl) hpEl.textContent = beast ? ('HP ' + hp + ' / ' + maxHp) : 'HP —';
    }

    function paintCreatures() {
        paintCreatureRoles();
        paintOneBeast('foe');
        paintOneBeast('me');
    }

    function setHit(id, text) {
        var el = $(id);
        if (el) el.textContent = text || '';
    }

    function showFigure(image) {
        var box = $('pvp-figure');
        var img = $('pvp-figure-img');
        var fb = $('pvp-figure-fallback');
        if (!box || !img) return;
        if (!image) {
            box.classList.add('hidden');
            img.removeAttribute('src');
            return;
        }
        box.classList.remove('hidden');
        if (fb) fb.classList.add('hidden');
        img.classList.remove('hidden');
        img.alt = '題目圖片';
        img.onerror = function () {
            img.classList.add('hidden');
            if (fb) fb.classList.remove('hidden');
        };
        img.src = image;
    }

    function showPick() {
        showStep('pick');
        refreshKicker();
        var roster = $('pvp-roster');
        var list = ownedRoster();
        if (state.rosterPick) {
            var still = false;
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].id === state.rosterPick) still = true;
            }
            if (!still) state.rosterPick = null;
        }
        if (roster) {
            while (roster.firstChild) roster.removeChild(roster.firstChild);
            if (!list.length) {
                var empty = document.createElement('p');
                empty.className = 'pvp-msg';
                empty.textContent = '你未有怪獸。去祈願召喚先，再返嚟出戰。';
                roster.appendChild(empty);
            }
            list.forEach(function (beast) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pvp-card';
                if (beast.id === state.rosterPick) btn.classList.add('is-selected');
                btn.disabled = !!state.pickLocked;
                btn.addEventListener('click', function () {
                    if (state.pickLocked || state.phase !== 'pick') return;
                    state.rosterPick = beast.id;
                    showPick();
                });
                if (beast.party) {
                    var badge = document.createElement('div');
                    badge.className = 'pvp-card__badge';
                    badge.textContent = '陣容 ' + beast.party;
                    btn.appendChild(badge);
                }
                var art = document.createElement('div');
                art.className = 'pvp-card__art';
                fillArt(art, beast);
                var name = document.createElement('div');
                name.className = 'pvp-card__name';
                name.textContent = beast.name;
                var meta = document.createElement('div');
                meta.className = 'pvp-card__meta';
                meta.textContent = beastMeta(beast);
                var hp = document.createElement('div');
                hp.className = 'pvp-card__meta';
                hp.textContent = 'HP ' + beast.maxHp;
                btn.appendChild(art);
                btn.appendChild(name);
                btn.appendChild(meta);
                btn.appendChild(hp);
                roster.appendChild(btn);
            });
        }
        var confirmBtn = $('pvp-pick-confirm');
        if (confirmBtn) confirmBtn.disabled = !state.rosterPick || !!state.pickLocked;
        if (!state.pickLocked && !state.theirBeast) {
            setMsg('pvp-pick-msg', list.length ? '揀一隻你擁有嘅獸，再確認出戰。' : '你未有怪獸。去祈願召喚先，再返嚟出戰。', list.length ? null : 'error');
        }
    }

    function confirmPick() {
        if (state.phase !== 'pick' || state.pickLocked) return;
        if (!state.rosterPick) return;
        var level = 1;
        var list = ownedRoster();
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].id === state.rosterPick) level = list[i].level;
        }
        var beast = resolveLocal(state.rosterPick, level);
        if (!beast) {
            setMsg('pvp-pick-msg', '呢隻獸讀唔到。請重新整理再試。', 'error');
            return;
        }
        state.myBeast = beast;
        state.pickLocked = true;
        state.myHp = beast.maxHp;
        if (canSend()) {
            sendJson({ v: 2, t: 'pick', id: beast.id, level: beast.level });
        }
        showPick();
        setMsg('pvp-pick-msg', '已鎖定「' + beast.name + '」。等對手揀…', 'ok');
        bothReady();
    }

    function acceptPick(msg) {
        if (!msg || msg.t !== 'pick') return null;
        return resolveLocal(msg.id, msg.level);
    }

    function bothReady() {
        if (state.phase === 'fight') return;
        if (!state.myBeast || !state.theirBeast) return;
        state.phase = 'fight';
        state.myHp = state.myBeast.maxHp;
        state.theirHp = state.theirBeast.maxHp;
        state.round = 0;
        state.question = null;
        state.questionSettled = true;
        state.matchOver = false;
        state.finished = false;
        state.outcome = null;
        state.rematchSent = false;
        state.theirRematch = false;
        state.myChoice = null;
        state.theirChoice = null;
        showFight();
        var queued = state.pendingQuestion;
        state.pendingQuestion = null;
        if (queued && state.role !== 'host') revealQuestion(queued);
        else if (state.role === 'host') beginRound();
        else setMsg('pvp-quiz-msg', '等房主出第一題…');
    }

    function showFight() {
        showStep('fight');
        refreshKicker();
        paintCreatures();
        var label = $('pvp-round-label');
        if (label) label.textContent = '等題目';
        var stem = $('pvp-stem');
        if (stem) stem.textContent = '';
        var box = $('pvp-options');
        if (box) box.innerHTML = '';
        var log = $('pvp-round-log');
        if (log) log.textContent = '';
        setHit('pvp-foe-hit', '');
        setHit('pvp-me-hit', '');
        showFigure('');
        hideMatchEnd();
    }

    function revealQuestion(q) {
        state.question = q;
        state.round = roundNo(q.roundId);
        state.myChoice = null;
        state.theirChoice = null;
        state.myMs = null;
        state.theirMs = null;
        state.questionSettled = false;
        state.shownAt = nowMs();
        state.phase = 'fight';
        showStep('fight');
        refreshKicker();
        paintCreatures();
        var label = $('pvp-round-label');
        if (label) label.textContent = '第 ' + state.round + ' 題';
        var stem = $('pvp-stem');
        if (stem) stem.textContent = q.stem;
        showFigure(q.image || '');
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
        setHit('pvp-foe-hit', '');
        setHit('pvp-me-hit', '');
        setMsg('pvp-quiz-msg', '揀一個答案。');
    }

    function paintOptions() {
        var box = $('pvp-options');
        if (!box || !state.question) return;
        var reveal = !!state.questionSettled || (!!state.myChoice && !!state.theirChoice);
        var buttons = box.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            var choice = buttons[i].textContent;
            buttons[i].disabled = !!state.myChoice || !!state.matchOver;
            buttons[i].classList.toggle('is-picked', choice === state.myChoice && !reveal);
            buttons[i].classList.toggle('is-correct', reveal && choice === state.question.answer);
            buttons[i].classList.toggle(
                'is-wrong',
                reveal && choice === state.myChoice && choice !== state.question.answer
            );
        }
    }

    function localOutcome(winner) {
        if (winner === 'draw') return 'draw';
        if (winner === 'host') return state.role === 'host' ? 'win' : 'lose';
        if (winner === 'guest') return state.role === 'guest' ? 'win' : 'lose';
        return '';
    }

    function roundLogText(parsed) {
        var mineHost = state.role === 'host';
        var myOk = mineHost ? parsed.hostOk : parsed.guestOk;
        var theirOk = mineHost ? parsed.guestOk : parsed.hostOk;
        var myDealt = mineHost ? parsed.hostDealt : parsed.guestDealt;
        var theirDealt = mineHost ? parsed.guestDealt : parsed.hostDealt;
        var myChip = mineHost ? parsed.hostChip : parsed.guestChip;
        var theirChip = mineHost ? parsed.guestChip : parsed.hostChip;
        var mySpeed = mineHost ? parsed.hostSpeed : parsed.guestSpeed;
        var theirSpeed = mineHost ? parsed.guestSpeed : parsed.hostSpeed;
        var a = myOk
            ? ('你打中 −' + myDealt + (mySpeed ? '（快答加成）' : ''))
            : ('你答錯，反噬 −' + myChip);
        var b = theirOk
            ? ('對手打中你 −' + theirDealt + (theirSpeed ? '（快答加成）' : ''))
            : ('對手答錯，反噬 −' + theirChip);
        var line = a + '　' + b;
        if (parsed.cap) line = '打滿 24 題，血量高嗰邊贏。　' + line;
        return line;
    }

    function paintHits(parsed) {
        var toGuest = parsed.hostDealt + parsed.guestChip;
        var toHost = parsed.guestDealt + parsed.hostChip;
        var toMe = state.role === 'host' ? toHost : toGuest;
        var toThem = state.role === 'host' ? toGuest : toHost;
        setHit('pvp-me-hit', toMe > 0 ? ('−' + toMe) : '');
        setHit('pvp-foe-hit', toThem > 0 ? ('−' + toThem) : '');
    }

    function hideMatchEnd() {
        var box = $('pvp-result');
        if (box) {
            box.classList.add('hidden');
            box.innerHTML = '';
        }
        var again = $('pvp-rematch-btn');
        var back = $('pvp-back-lobby-btn');
        if (again) again.classList.add('hidden');
        if (back) back.classList.add('hidden');
    }

    function paintRematch() {
        var again = $('pvp-rematch-btn');
        var back = $('pvp-back-lobby-btn');
        if (again) {
            again.classList.toggle('hidden', !state.matchOver);
            again.disabled = !!state.rematchSent || !canSend();
            again.textContent = state.rematchSent ? '等對手…' : '再揀獸打過';
        }
        if (back) back.classList.toggle('hidden', !state.matchOver);
    }

    function renderMatchEnd() {
        var title = '打和。';
        if (state.outcome === 'win') title = '你贏咗！';
        else if (state.outcome === 'lose') title = '你輸咗。';
        var box = $('pvp-result');
        if (box) {
            box.classList.remove('hidden');
            box.innerHTML = '';
            var h = document.createElement('p');
            h.className = 'pvp-result__title';
            h.textContent = title;
            var p = document.createElement('p');
            p.className = 'pvp-result__detail';
            var mine = state.myBeast ? state.myBeast.name : '我方';
            var theirs = state.theirBeast ? state.theirBeast.name : (state.opponentName || '對手');
            p.textContent = mine + ' HP ' + state.myHp + '　' + theirs + ' HP ' + state.theirHp;
            box.appendChild(h);
            box.appendChild(p);
        }
        if (state.outcome === 'win') setMsg('pvp-quiz-msg', '打贏啦。可以再揀獸打過，或者返去大廳。', 'ok');
        else if (state.outcome === 'lose') setMsg('pvp-quiz-msg', '今場輸咗。可以再揀獸打過。');
        else setMsg('pvp-quiz-msg', '兩邊一齊倒下。可以再揀獸打過。');
        paintOptions();
        paintRematch();
    }

    function finishMatch(outcome) {
        state.matchOver = true;
        state.finished = true;
        state.outcome = outcome;
        clearAdvance();
        renderMatchEnd();
        paintCreatures();
    }

    function applyResolution(payload) {
        var parsed = interpretSync(payload);
        if (!parsed || !state.question || parsed.roundId !== state.question.roundId) return;
        if (state.matchOver && state.questionSettled) return;
        var hp = state.role === 'host'
            ? { my: parsed.hostHp, their: parsed.guestHp }
            : { my: parsed.guestHp, their: parsed.hostHp };
        state.myHp = hp.my;
        state.theirHp = hp.their;
        state.questionSettled = true;
        var log = $('pvp-round-log');
        if (log) log.textContent = roundLogText(parsed);
        paintHits(parsed);
        paintCreatures();
        paintOptions();
        var outcome = localOutcome(parsed.winner);
        if (outcome) {
            finishMatch(outcome);
            return;
        }
        state.matchOver = false;
        state.finished = false;
        state.outcome = null;
        hideMatchEnd();
        if (state.role === 'host') scheduleNext();
        else setMsg('pvp-quiz-msg', '下一題就到…');
    }

    function scheduleNext() {
        clearAdvance();
        var token = state.token;
        state.advanceTimer = setTimeout(function () {
            if (state.token !== token || state.matchOver || state.role !== 'host') return;
            beginRound();
        }, ROUND_GAP_MS);
    }

    function settleRound() {
        if (state.role !== 'host' || state.questionSettled || state.matchOver || !state.question) return;
        if (!state.myChoice || !state.theirChoice || !state.myBeast || !state.theirBeast) return;
        var mineOk = state.myChoice === state.question.answer;
        var theirsOk = state.theirChoice === state.question.answer;
        var result = resolveRoundPure(
            state.myBeast,
            state.theirBeast,
            mineOk,
            theirsOk,
            state.myMs,
            state.theirMs,
            state.myHp,
            state.theirHp
        );
        var winner = '';
        var cap = 0;
        if (result.ko === 'draw') winner = 'draw';
        else if (result.ko === 'me') winner = 'host';
        else if (result.ko === 'them') winner = 'guest';
        else if (state.round >= MAX_ROUNDS) {
            cap = 1;
            if (result.myHp === result.theirHp) winner = 'draw';
            else winner = result.myHp > result.theirHp ? 'host' : 'guest';
        }
        var payload = {
            v: 2,
            t: 'sync',
            roundId: state.question.roundId,
            hostHp: result.myHp,
            guestHp: result.theirHp,
            hostDealt: result.myDealt,
            guestDealt: result.theirDealt,
            hostChip: result.myChip,
            guestChip: result.theirChip,
            hostSpeed: result.speedMe ? 1 : 0,
            guestSpeed: result.speedThem ? 1 : 0,
            hostOk: mineOk ? 1 : 0,
            guestOk: theirsOk ? 1 : 0,
            winner: winner,
            cap: cap
        };
        if (canSend()) sendJson(payload);
        applyResolution(payload);
    }

    function maybeSettle() {
        paintOptions();
        if (state.role !== 'host') {
            if (state.myChoice && state.theirChoice && !state.questionSettled) {
                setMsg('pvp-quiz-msg', '兩邊都交咗卷，等房主結算…');
            }
            return;
        }
        if (!state.myChoice || !state.theirChoice || state.questionSettled || state.matchOver) return;
        settleRound();
    }

    function pick(choice) {
        if (state.phase !== 'fight' || !state.question || state.myChoice || state.matchOver || state.questionSettled) return;
        if (state.question.options.indexOf(choice) === -1) return;
        state.myChoice = choice;
        state.myMs = answerMs();
        paintOptions();
        if (canSend()) {
            var payload = { v: 2, t: 'answer', roundId: state.question.roundId, choice: choice };
            if (state.myMs != null) payload.ms = state.myMs;
            sendJson(payload);
        }
        if (!state.theirChoice) setMsg('pvp-quiz-msg', '你揀咗「' + choice + '」。等對手交卷…');
        maybeSettle();
    }

    function beginRound() {
        if (state.role !== 'host' || state.matchOver || state.phase !== 'fight') return;
        if (!canSend() || !state.myBeast || !state.theirBeast) return;
        if (state.question && !state.questionSettled) return;
        var next = (state.round || 0) + 1;
        if (next > MAX_ROUNDS) return;
        var q = makeBattleQuestion(next);
        if (!q) {
            fail('出題失敗。請離開再開一次。');
            return;
        }
        state.pendingQuestion = null;
        sendJson({
            v: 2,
            t: 'question',
            roundId: q.roundId,
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            image: q.image || ''
        });
        revealQuestion(q);
    }

    function enterPick(preselectId) {
        clearAdvance();
        state.phase = 'pick';
        state.pickLocked = false;
        state.myBeast = null;
        state.theirBeast = null;
        state.pendingQuestion = null;
        state.myHp = 0;
        state.theirHp = 0;
        state.round = 0;
        state.question = null;
        state.myChoice = null;
        state.theirChoice = null;
        state.myMs = null;
        state.theirMs = null;
        state.questionSettled = true;
        state.matchOver = false;
        state.finished = false;
        state.outcome = null;
        state.rematchSent = false;
        state.theirRematch = false;
        state.rosterPick = preselectId || null;
        try {
            if (typeof resetPvpQuestionMemory === 'function') resetPvpQuestionMemory();
        } catch (e) { /* 出題記憶係主頁先至有 */ }
        showPick();
    }

    function enterRoomWait(text) {
        clearAdvance();
        var token = state.token;
        var role = state.role;
        var code = state.code;
        var socket = state.socket;
        var attempt = state.attempt;
        var pingTimer = state.pingTimer;
        var fresh = emptyState();
        fresh.token = token;
        fresh.role = role;
        fresh.code = code;
        fresh.socket = socket;
        fresh.phase = 'room';
        fresh.attempt = attempt;
        fresh.welcomed = true;
        fresh.pingTimer = pingTimer;
        Object.keys(fresh).forEach(function (k) { state[k] = fresh[k]; });
        showStep('room');
        paintCode(state.code);
        setMsg('pvp-room-msg', text, text ? 'error' : null);
        sendJson({ v: 2, t: 'wait' });
    }

    function markPeerPresent(token) {
        if (state.token !== token) return;
        if (state.connected && state.phase !== 'room') return;
        state.connected = true;
        clearConnectTimer();
        sendJson({ v: 2, t: 'hello', name: myName() });
        if (state.phase === 'room') enterPick(null);
        setBusy(false);
    }

    function onPeerLeft(token) {
        if (state.token !== token) return;
        var over = state.matchOver;
        var socket = state.socket;
        state.connected = false;
        clearAdvance();
        if (over) {
            state.socket = null;
            clearPing();
            if (socket) {
                try { socket.close(); } catch (e) { /* already closed */ }
            }
            setMsg('pvp-quiz-msg', '對手離開咗房間。', 'error');
            paintRematch();
            return;
        }
        if (state.role === 'host' && socket && socket.readyState === 1) {
            enterRoomWait('對手離開咗。房號仲用得，可以再等人入房。');
            return;
        }
        fail('連線中斷。對手可能離開咗，或者網絡斷開。');
    }

    function onData(msg, token, socket) {
        if (state.token !== token || state.socket !== socket || !msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') {
            state.opponentName = sanitizeName(msg.name);
            refreshKicker();
            paintCreatureRoles();
            return;
        }
        if (msg.t === 'ping' || msg.t === 'wait') return;
        if (msg.t === 'pick') {
            if (state.phase !== 'pick' || state.theirBeast) return;
            var beast = acceptPick(msg);
            if (!beast) {
                setMsg('pvp-pick-msg', '對手揀嘅獸認唔出。請雙方重新整理。', 'error');
                return;
            }
            state.theirBeast = beast;
            state.theirHp = beast.maxHp;
            if (!state.pickLocked) setMsg('pvp-pick-msg', '對手已揀好。輪到你確認出戰。', 'ok');
            bothReady();
            return;
        }
        if (msg.t === 'question') {
            if (state.role === 'host') return;
            var q = sanitizeQuestion(msg);
            if (!q) {
                fail('收到嘅題目唔完整。請房主離開再開一次。');
                return;
            }
            if (state.matchOver) return;
            if (!state.myBeast || !state.theirBeast || state.phase !== 'fight') {
                state.pendingQuestion = q;
                return;
            }
            revealQuestion(q);
            return;
        }
        if (msg.t === 'answer') {
            if (state.phase !== 'fight' || !state.question || state.matchOver) return;
            if (String(msg.roundId || '') !== state.question.roundId) return;
            if (state.theirChoice) return;
            var choice = String(msg.choice == null ? '' : msg.choice);
            if (state.question.options.indexOf(choice) === -1) return;
            state.theirChoice = choice;
            state.theirMs = cleanMs(msg.ms);
            if (!state.myChoice && !state.questionSettled) setMsg('pvp-quiz-msg', '對手已交卷，等你揀答案。');
            maybeSettle();
            return;
        }
        if (msg.t === 'sync') {
            if (state.role !== 'guest') return;
            applyResolution(msg);
            return;
        }
        if (msg.t === 'rematch') {
            if (!state.matchOver) return;
            state.theirRematch = true;
            if (state.rematchSent) startRepick();
            else setMsg('pvp-quiz-msg', '對手想再打。撳「再揀獸打過」就得。', 'ok');
            paintRematch();
        }
    }

    function requestRematch() {
        if (!state.matchOver || state.rematchSent) return;
        if (!canSend()) {
            setMsg('pvp-quiz-msg', '連線已經斷開，請返去大廳再開一局。', 'error');
            paintRematch();
            return;
        }
        state.rematchSent = true;
        sendJson({ v: 2, t: 'rematch' });
        if (state.theirRematch) startRepick();
        else setMsg('pvp-quiz-msg', '等對手一齊再揀獸…', 'ok');
        paintRematch();
    }

    function startRepick() {
        if (!canSend()) {
            setMsg('pvp-quiz-msg', '連線已經斷開，請返去大廳再開一局。', 'error');
            return;
        }
        var prev = state.myBeast ? state.myBeast.id : null;
        enterPick(prev);
    }

    function onRelay(msg, token, socket) {
        if (state.token !== token || state.socket !== socket) return;
        var eventName = String(msg.e || '');
        if (eventName === 'welcome') {
            state.welcomed = true;
            clearConnectTimer();
            publishHash(state.code);
            paintCode(state.code);
            if (state.role === 'host') {
                setMsg('pvp-room-msg', '房號已開好。叫對手輸入房號，或者將連結傳俾佢。', 'ok');
                setBusy(false);
                if (msg.peer) markPeerPresent(token);
                return;
            }
            if (msg.peer) {
                markPeerPresent(token);
                return;
            }
            fail(relayErrorText('no-room'));
            return;
        }
        if (eventName === 'peer-joined') {
            markPeerPresent(token);
            return;
        }
        if (eventName === 'peer-left') {
            onPeerLeft(token);
            return;
        }
        if (eventName === 'pong') return;
        if (eventName === 'room-taken' && state.role === 'host' && state.attempt < MAX_HOST_TRIES - 1 && !state.welcomed) {
            var nextTry = state.attempt + 1;
            state.socket = null;
            try { socket.close(); } catch (e) { /* server is closing it too */ }
            setMsg('pvp-room-msg', '房號被人用緊，幫你換緊另一個…');
            tryHost(token, nextTry);
            return;
        }
        if (eventName === 'room-taken' || eventName === 'room-full' || eventName === 'no-room' || eventName === 'invalid-code' || eventName === 'bad-role' || eventName === 'host-gone' || eventName === 'wrong-room') {
            fail(relayErrorText(eventName));
        }
    }

    function bindSocket(socket, token) {
        armConnectWatch(token, socket);
        armKeepalive(token, socket);
        socket.onmessage = function (ev) {
            if (state.token !== token || state.socket !== socket) return;
            var msg = parseMsg(ev && ev.data);
            if (!msg) return;
            if (msg.t === 'relay') {
                onRelay(msg, token, socket);
                return;
            }
            onData(msg, token, socket);
        };
        socket.onerror = function () { /* onclose carries the failure */ };
        socket.onclose = function () {
            if (state.token !== token || state.socket !== socket) return;
            if (!state.welcomed) {
                fail('連唔到對戰中繼伺服器。請檢查網絡，陣間再試。');
                return;
            }
            fail('同對戰中繼伺服器嘅連線中斷。請再試一次。');
        };
    }

    function tryHost(token, attempt) {
        if (state.token !== token) return;
        if (!ensureRelay()) return;
        clearPing();
        var code = randomCode();
        var socket;
        try {
            socket = openSocket(code, 'host');
        } catch (e) {
            fail('開房失敗。請再試一次。');
            return;
        }
        state.socket = socket;
        state.role = 'host';
        state.code = code;
        state.phase = 'room';
        state.attempt = attempt;
        state.welcomed = false;
        state.connected = false;
        paintCode('');
        setMsg('pvp-room-msg', '等緊對戰中繼伺服器開房…');
        bindSocket(socket, token);
    }

    function createRoom() {
        if (!ensureRelay()) return;
        destroySession();
        var token = state.token;
        setBusy(true);
        showStep('room');
        state.phase = 'room';
        setMsg('pvp-lobby-msg', '');
        tryHost(token, 0);
    }

    function joinRoom(raw) {
        var code = normalizeCode(raw);
        if (!code) {
            setMsg('pvp-lobby-msg', explainBadCode(raw), 'error');
            return;
        }
        if (!ensureRelay()) return;
        destroySession();
        var token = state.token;
        var socket;
        try {
            socket = openSocket(code, 'guest');
        } catch (e) {
            fail('入房失敗。請再試一次。');
            return;
        }
        state.socket = socket;
        state.role = 'guest';
        state.code = code;
        state.phase = 'room';
        state.welcomed = false;
        state.connected = false;
        setBusy(true);
        showStep('room');
        paintCode(code);
        setMsg('pvp-lobby-msg', '');
        setMsg('pvp-room-msg', '等緊對戰中繼伺服器，跟住入房 ' + code + '…');
        bindSocket(socket, token);
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
        var pickLeave = $('pvp-pick-leave');
        if (pickLeave) pickLeave.addEventListener('click', function () { leaveToLobby('已離開房間。'); });
        var confirmBtn = $('pvp-pick-confirm');
        if (confirmBtn) confirmBtn.addEventListener('click', function () { confirmPick(); });
        var rematch = $('pvp-rematch-btn');
        if (rematch) rematch.addEventListener('click', function () { requestRematch(); });
        var back = $('pvp-back-lobby-btn');
        if (back) back.addEventListener('click', function () { leaveToLobby('可以再開一局。'); });
    }

    function onEnterView() {
        bindUi();
        if (state.socket) return;
        showStep('lobby');
        setBusy(false);
        var code = codeFromHash();
        var input = $('pvp-join-code');
        if (input && code && !String(input.value || '').trim()) input.value = code;
    }

    function onLeaveView() {
        var view = $('view-pvp');
        if (view && !view.classList.contains('hidden')) return;
        if (!state.socket) return;
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
        rules: {
            damageHit: damageHit,
            selfChip: selfChip,
            resolveRound: resolveRoundPure,
            interpretSync: interpretSync,
            adaptGenerated: adaptGenerated,
            sanitizeQuestion: sanitizeQuestion,
            cleanMs: cleanMs
        },
        debugState: function () {
            return {
                role: state.role,
                code: state.code,
                connected: state.connected,
                phase: state.phase,
                opponentName: state.opponentName,
                myBeast: state.myBeast ? state.myBeast.id : '',
                theirBeast: state.theirBeast ? state.theirBeast.id : '',
                myHp: state.myHp,
                theirHp: state.theirHp,
                round: state.round,
                stem: state.question ? state.question.stem : '',
                options: state.question ? state.question.options.slice() : [],
                answer: state.question ? state.question.answer : '',
                myChoice: state.myChoice,
                theirChoice: state.theirChoice,
                finished: state.finished,
                matchOver: state.matchOver,
                outcome: state.outcome
            };
        }
    };
})();
