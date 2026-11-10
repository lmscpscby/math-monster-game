/**
 * Two-seat room pipe for 雲霄決鬥場.
 *
 * The relay does not grade answers or read HP. It seats a host and one
 * guest, forwards their JSON game frames, and emits presence of its own.
 * Frames with t === "relay" are never forwarded, so a player cannot spoof
 * "the other side left" or "room full".
 *
 * Seat control (also not forwarded):
 * - ping → pong, so a school proxy does not idle-drop the waiting host
 * - wait  → host is ready for the next guest (sent again after a guest leaves)
 *
 * A guest who arrives while the host is seated but not waiting (mid-match,
 * or the result screen) gets room-full. That keeps a finished match from
 * picking up a stranger on the same code.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 4;
export const MAX_MESSAGE_CHARS = 32768;

export function isValidRoomCode(code) {
    if (typeof code !== 'string' || code.length !== CODE_LEN) return false;
    for (let i = 0; i < code.length; i++) {
        if (CODE_ALPHABET.indexOf(code.charAt(i)) === -1) return false;
    }
    return true;
}

function deliver(socket, text) {
    if (!socket || typeof socket.send !== 'function') return false;
    try {
        socket.send(text);
        return true;
    } catch (e) {
        return false;
    }
}

function closeSocket(socket, reason) {
    if (!socket || typeof socket.close !== 'function') return;
    try { socket.close(4000, reason || ''); } catch (e) { /* already closed */ }
}

function sendObj(socket, obj) {
    return deliver(socket, JSON.stringify(obj));
}

function sendAndClose(socket, error) {
    sendObj(socket, { t: 'relay', e: error });
    closeSocket(socket, error);
}

export function createRoom() {
    let host = null;
    let guest = null;
    let accepting = false;
    let code = '';

    function seatOf(socket) {
        if (socket && socket === host) return 'host';
        if (socket && socket === guest) return 'guest';
        return '';
    }

    function peerOf(role) {
        if (role === 'host') return guest;
        if (role === 'guest') return host;
        return null;
    }

    return {
        join(role, socket, roomCode) {
            if (code && roomCode && code !== roomCode) {
                sendAndClose(socket, 'wrong-room');
                return { ok: false, error: 'wrong-room' };
            }
            if (role === 'host') {
                if (host) {
                    sendAndClose(socket, 'room-taken');
                    return { ok: false, error: 'room-taken' };
                }
                host = socket;
                if (roomCode) code = roomCode;
                accepting = true;
                sendObj(socket, { t: 'relay', e: 'welcome', role: 'host', peer: !!guest, code: code });
                return { ok: true, role: 'host' };
            }
            if (role === 'guest') {
                if (!host) {
                    sendAndClose(socket, 'no-room');
                    return { ok: false, error: 'no-room' };
                }
                if (guest || !accepting) {
                    sendAndClose(socket, 'room-full');
                    return { ok: false, error: 'room-full' };
                }
                guest = socket;
                accepting = false;
                if (roomCode) code = roomCode;
                // Tell the host first so its hello has a seated guest to land on.
                sendObj(host, { t: 'relay', e: 'peer-joined', role: 'guest' });
                sendObj(socket, { t: 'relay', e: 'welcome', role: 'guest', peer: true, code: code });
                return { ok: true, role: 'guest' };
            }
            sendAndClose(socket, 'bad-role');
            return { ok: false, error: 'bad-role' };
        },

        message(socket, raw) {
            const role = seatOf(socket);
            if (!role) return { ok: false, error: 'not-in-room' };
            if (typeof raw !== 'string') return { ok: false, error: 'bad-payload' };
            if (raw.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'too-large' };
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (e) {
                return { ok: false, error: 'bad-json' };
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return { ok: false, error: 'bad-json' };
            }
            if (parsed.t === 'relay') return { ok: false, error: 'reserved' };
            if (parsed.t === 'ping') {
                sendObj(socket, { t: 'relay', e: 'pong' });
                return { ok: true, pong: true };
            }
            if (parsed.t === 'wait') {
                if (role !== 'host') return { ok: false, error: 'not-host' };
                if (guest) return { ok: false, error: 'busy' };
                accepting = true;
                return { ok: true, waiting: true };
            }
            const peer = peerOf(role);
            if (!peer) return { ok: false, error: 'no-peer' };
            if (!deliver(peer, raw)) return { ok: false, error: 'send-failed' };
            return { ok: true };
        },

        leave(socket) {
            const role = seatOf(socket);
            if (!role) return { ok: false, error: 'not-in-room' };
            if (role === 'host') {
                host = null;
                accepting = false;
                if (guest) {
                    const seated = guest;
                    guest = null;
                    sendObj(seated, { t: 'relay', e: 'host-gone' });
                    closeSocket(seated, 'host-gone');
                }
                return { ok: true, role: 'host' };
            }
            guest = null;
            accepting = false;
            if (host) sendObj(host, { t: 'relay', e: 'peer-left', role: 'guest' });
            return { ok: true, role: 'guest' };
        },

        seats() {
            return { host: !!host, guest: !!guest, accepting: accepting, code: code };
        }
    };
}

export function connectPlayer(room, code, role, socket) {
    if (!isValidRoomCode(code)) {
        sendAndClose(socket, 'invalid-code');
        return { ok: false, error: 'invalid-code' };
    }
    if (role !== 'host' && role !== 'guest') {
        sendAndClose(socket, 'bad-role');
        return { ok: false, error: 'bad-role' };
    }
    return room.join(role, socket, code);
}
