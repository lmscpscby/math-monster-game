/**
 * Google Fonts request: keep every family, drop only weights nothing uses.
 * Outfit stays (gacha pill numbers are weight 800). 400 and 600 are not.
 *
 * node scripts/webfont-weights-test.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const peer = fs.readFileSync(path.join(root, 'pvp-peer.css'), 'utf8');
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const links = html.match(/<link[^>]+fonts\.googleapis\.com\/css2\?[^>]+>/g) || [];
assert(links.length === 1, 'one Google Fonts stylesheet, got ' + links.length);
const href = (links[0].match(/href="([^"]+)"/) || [])[1] || '';
assert(href.indexOf('display=swap') !== -1, 'display=swap stays');

const families = [];
href.split('family=').slice(1).forEach(function (part) {
  const spec = decodeURIComponent(part.split('&')[0].replace(/\+/g, ' '));
  const bits = spec.split(':');
  const name = bits[0];
  const weights = (bits[1] || '').replace(/^wght@/, '').split(';').filter(Boolean);
  families.push({ name: name, weights: weights });
});

const expected = [
  { name: 'Outfit', weights: ['800'] },
  { name: 'Noto Sans TC', weights: ['400', '700', '900'] },
  { name: 'Noto Serif TC', weights: ['400', '600', '700', '900'] },
  { name: 'Cinzel', weights: ['600', '800'] },
  { name: 'Cinzel Decorative', weights: ['700', '900'] }
];

assert(families.length === expected.length, 'five families, got ' + families.map(function (f) { return f.name; }).join(', '));
expected.forEach(function (want, i) {
  const got = families[i] || { name: '', weights: [] };
  assert(got.name === want.name, 'family ' + (i + 1) + ' is ' + want.name + ', got ' + got.name);
  assert(got.weights.join(',') === want.weights.join(','), want.name + ' weights ' + want.weights.join(';') + ', got ' + got.weights.join(';'));
});

assert(href.indexOf('Outfit:wght@400') === -1 && href.indexOf('400;600;800') === -1, 'Outfit no longer requests 400 or 600');
assert(href.indexOf('family=Outfit:wght@800') !== -1, 'Outfit still requests 800');
assert(href.indexOf('Noto+Sans+TC:wght@400;700;900') !== -1, 'Noto Sans TC weights stay');
assert(href.indexOf('Noto+Serif+TC:wght@400;600;700;900') !== -1, 'Noto Serif TC weights stay');
assert(href.indexOf('family=Cinzel:wght@600;800') !== -1, 'Cinzel weights stay');
assert(href.indexOf('Cinzel+Decorative:wght@700;900') !== -1, 'Cinzel Decorative weights stay');

const pill = html.slice(html.indexOf('.gacha-pill__value'), html.indexOf('.gacha-pill__value') + 420);
assert(pill.indexOf("font-family: Outfit, 'Noto Sans TC', sans-serif") !== -1, 'gacha numbers still use Outfit');
assert(/font-weight:\s*800/.test(pill), 'gacha numbers still use Outfit weight 800');
assert(html.indexOf("font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Outfit', sans-serif") !== -1, 'body stack still lists Outfit as a fallback');
assert(peer.indexOf('Noto Serif TC') !== -1, 'pvp sheet still uses Noto Serif TC');
assert(fs.existsSync(path.join(root, '.nojekyll')), '.nojekyll stays');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('webfont weights ok');
