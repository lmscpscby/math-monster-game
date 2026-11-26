/**
 * 聖光龍王動態立繪：只喺圖鑑卡、故事放大、大廳 S2 走馬燈播。
 * 戰鬥／組隊仍然用 BEAST_IMAGES 嘅官方 JPG。未顯示唔下載 mp4。
 * node scripts/aurelion-motion-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

function fileHash(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').slice(0, 8);
}

assert(fileHash('assets/monsters/season_aurelion.mp4') === '982656ff', 'mp4 bytes stay the approved file');
assert(fileHash('assets/monsters/season_aurelion_poster.jpg') === '50ddf4a6', 'poster bytes stay the mid-loop still');
assert(fileHash('assets/bg/ui-lobby-s2-badge.png') === '6220ebd8', 'badge bytes stay the cut-out seal');

const renderFn = html.slice(html.indexOf('function renderMonsterElement'), html.indexOf('function lockAurelionMuted'));
assert(renderFn.includes('BEAST_IMAGES[imgKey]'), 'shared portrait helper reads BEAST_IMAGES');
assert(!renderFn.includes('.mp4'), 'shared portrait helper does not emit the video');

const motionReduced = { current: false };
function klass(names) {
  const set = new Set(names || []);
  return {
    contains(name) { return set.has(name); },
    add(name) { set.add(name); },
    remove(name) { set.delete(name); },
    toggle() {}
  };
}

function makeEl() {
  return {
    classList: klass(),
    className: '',
    style: {},
    hidden: false,
    dataset: {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    appendChild() {},
    focus() {}
  };
}

function makeVideo(kind, opts) {
  opts = opts || {};
  const attrs = {
    'data-aurelion-motion': kind,
    'data-src': 'assets/monsters/season_aurelion.mp4?v=982656ff'
  };
  const video = {
    muted: false,
    defaultMuted: false,
    volume: 1,
    paused: true,
    played: 0,
    loaded: 0,
    dataset: {},
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    addEventListener() {},
    pause() { this.paused = true; },
    play() { this.played += 1; this.paused = false; return { catch() {} }; },
    load() { this.loaded += 1; },
    closest(sel) {
      if (sel === '[inert]') return opts.inert ? { inert: true } : null;
      if (sel === '[data-lobby-slide]') return { classList: klass(opts.active ? ['is-active'] : []) };
      return null;
    }
  };
  Object.defineProperty(video, 'src', {
    configurable: true,
    get() { return attrs.src || ''; },
    set(value) { attrs.src = String(value); }
  });
  video._attrs = attrs;
  return video;
}

const views = {
  'view-home': { classList: klass([]) },
  'view-monsters': { classList: klass(['hidden']) },
  'card-zoom-modal': { classList: klass(['hidden']) }
};

const sandbox = {
  console,
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
  clearTimeout() {},
  setInterval() { return 0; },
  clearInterval() {},
  Date, Math, JSON, Number, String, Boolean, Object, Array, Promise, Error, RegExp,
  parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent,
  alert() {},
  confirm() { return false; },
  fetch: async function () { return { ok: false, status: 0, text: async function () { return '{"ok":false}'; } }; },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  performance: { now() { return 0; } },
  navigator: { userAgent: 'node' },
  matchMedia() { return { matches: motionReduced.current, addEventListener() {}, addListener() {} }; },
  document: {
    hidden: false,
    getElementById(id) { return views[id] || makeEl(); },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    createElement() { return makeEl(); },
    addEventListener() {},
    documentElement: makeEl(),
    body: Object.assign(makeEl(), { children: [], classList: klass() })
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const logicAt = html.indexOf('<!-- JAVASCRIPT GAME LOGIC -->');
const scriptStart = html.indexOf('<script>', logicAt) + '<script>'.length;
const scriptEnd = html.lastIndexOf('</script>');
vm.runInContext(html.slice(scriptStart, scriptEnd), sandbox, { filename: 'index.html' });

const still = sandbox.renderMonsterElement('season_aurelion', '聖光龍王・奧瑞利安');
assert(still.includes('assets/monsters/season_aurelion.jpg?v=14a637b1') && !still.includes('.mp4'), 'battle helper still returns the jpg');

const lore = sandbox.seasonLoreHtml(sandbox.getMonsterRuntimeData('season_aurelion', 1));
assert(lore.includes('data-aurelion-motion="lore"') && lore.includes('width="576"') && lore.includes('height="576"'), 'lore portrait is the square clip');
assert(!lore.includes('season_aurelion.jpg'), 'lore portrait does not use the battle jpg');
assert(!lore.includes('autoplay'), 'lore markup does not autoplay');

motionReduced.current = true;
const reducedCard = sandbox.aurelionMotionTag('codex', 'monster-art monster-art--cover', 576, 576, '聖光龍王・奧瑞利安');
assert(reducedCard.startsWith('<img') && reducedCard.includes('season_aurelion_poster.jpg') && !reducedCard.includes('<video'), 'reduced motion codex is the poster still');
motionReduced.current = false;

function sync(video) {
  sandbox.syncAurelionMotion({ querySelectorAll() { return [video]; } });
}

const lobby = makeVideo('lobby', { active: false });
sync(lobby);
assert(lobby.played === 0 && !lobby._attrs.src, 'inactive S2 slide does not fetch the mp4');

lobby.closest = function (sel) {
  if (sel === '[inert]') return null;
  if (sel === '[data-lobby-slide]') return { classList: klass(['is-active']) };
  return null;
};
sync(lobby);
assert(lobby.played === 1 && lobby.muted === true && lobby.volume === 0 && lobby._attrs.src.includes('season_aurelion.mp4?v=982656ff'), 'active S2 slide plays muted');

sandbox.document.hidden = true;
sync(lobby);
assert(lobby.paused === true && lobby._attrs.src.includes('.mp4'), 'hidden page pauses without dropping the file');
sandbox.document.hidden = false;

motionReduced.current = true;
sync(lobby);
assert(lobby.paused === true && !lobby._attrs.src && lobby.loaded === 1, 'reduced motion pauses and returns to the poster');
motionReduced.current = false;

const inertLobby = makeVideo('lobby', { active: true, inert: true });
sync(inertLobby);
assert(inertLobby.played === 0 && !inertLobby._attrs.src, 'inert lobby does not start the clip');

views['view-monsters'].classList.remove('hidden');
const codex = makeVideo('codex');
codex.dataset.inview = '0';
sync(codex);
assert(codex.played === 0 && !codex._attrs.src, 'offscreen codex card waits');
codex.dataset.inview = '1';
sync(codex);
assert(codex.played === 1 && codex._attrs.src.includes('.mp4'), 'visible codex card plays');
views['card-zoom-modal'].classList.remove('hidden');
sync(codex);
assert(codex.paused === true, 'opening lore pauses the card clip');

const loreVideo = makeVideo('lore');
sync(loreVideo);
assert(loreVideo.played === 1 && loreVideo.muted === true, 'open lore portrait plays muted');
views['card-zoom-modal'].classList.add('hidden');
sync(loreVideo);
assert(loreVideo.paused === true, 'closing lore pauses the portrait');

if (process.exitCode) process.exit(process.exitCode);
