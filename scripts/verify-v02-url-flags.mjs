// Preview scenes are listed once in url-flags.js; index.html's menu redirect must let each through.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PREVIEWS} from '../web/v02/weekend/url-flags.js';
const html = readFileSync('web/v02/weekend/index.html', 'utf8');
const inline = JSON.parse(html.match(/!(\[[^\]]*-preview[^\]]*\])\.some/)[1]);
assert.deepEqual([...inline].sort(), [...PREVIEWS].sort(), 'index.html lets every preview in url-flags.js skip the menu');
const game = readFileSync('web/v02/weekend/game.js', 'utf8');
assert(!/URLSearchParams\(\s*location\.search/.test(game), 'game.js reads URL flags through url-flags.js');
console.log(`PASS ${PREVIEWS.length} preview flags agree`);
