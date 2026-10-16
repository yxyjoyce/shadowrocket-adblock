'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var script = fs.readFileSync(path.join(root, 'scripts', 'cmbchina-getmarketconfig-response.js'), 'utf8');
var plugin = fs.readFileSync(path.join(root, 'loon-adblock.plugin'), 'utf8');
var targetUrl = 'https://webappcfg.paas.cmbchina.com/v1/func/getmarketconfig';

assert.ok(plugin.indexOf('response if ${url} ~= /^https:\\/\\/webappcfg\\.paas\\.cmbchina\\.com\\/v1\\/func\\/getmarketconfig(?:\\?.*)?$/') >= 0);
assert.ok(plugin.indexOf('cmbchina-getmarketconfig-response.js') >= 0);
assert.ok(plugin.indexOf('requires_body=true') >= 0);
assert.ok(plugin.indexOf('hostname = webappcfg.paas.cmbchina.com') >= 0);

function run(body, url) {
  var result;
  vm.runInNewContext(script, {
    JSON: JSON,
    Array: Array,
    decodeURIComponent: decodeURIComponent,
    encodeURIComponent: encodeURIComponent,
    $request: { url: url || targetUrl },
    $response: { body: body },
    $done: function (value) { result = value; }
  });
  return result;
}

function decodeOutput(value) {
  var body = value && value.body;
  assert.strictEqual(typeof body, 'string');
  try {
    return JSON.parse(body);
  } catch (_) {
    return JSON.parse(decodeURIComponent(body));
  }
}

function decodeInput(body) {
  try {
    return JSON.parse(body);
  } catch (_) {
    return JSON.parse(decodeURIComponent(body));
  }
}

function assertFailOpen(value) {
  assert.ok(value && typeof value === 'object');
  assert.strictEqual(Object.keys(value).length, 0);
}

var payload = {
  MarketingPage: { Enable: true, ImageInfo: [{ ImageUrl: 'https://example.invalid/ad.png' }], Duration: 2 },
  MarketingVideo: { Enable: true, Url: 'https://example.invalid/video.mp4' },
  PopupWindow: { Enable: true },
  untouched: { nested: ['value'] }
};
var output = run(encodeURIComponent(JSON.stringify(payload)));
var changed = decodeOutput(output);
assert.strictEqual(changed.MarketingPage.Enable, false);
assert.deepStrictEqual(changed.MarketingPage.ImageInfo, []);
assert.strictEqual(changed.MarketingPage.Duration, 2);
assert.deepStrictEqual(changed.MarketingVideo, payload.MarketingVideo);
assert.deepStrictEqual(changed.PopupWindow, payload.PopupWindow);
assert.deepStrictEqual(changed.untouched, payload.untouched);

output = run(JSON.stringify(payload));
changed = decodeOutput(output);
assert.strictEqual(changed.MarketingPage.Enable, false);
assert.deepStrictEqual(changed.MarketingPage.ImageInfo, []);

assertFailOpen(run('%not-json%'));
assertFailOpen(run(JSON.stringify({ MarketingVideo: { Enable: true } })));
assertFailOpen(run(JSON.stringify(['not', 'a', 'config'])));

var harPath = process.argv[2];
if (harPath) {
  var har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  var entries = har.log.entries.filter(function (entry) {
    return /^https:\/\/webappcfg\.paas\.cmbchina\.com\/v1\/func\/getmarketconfig(?:\?.*)?$/.test(entry.request.url);
  });
  assert.strictEqual(entries.length, 1, 'HAR target response count');
  var content = entries[0].response.content;
  var harBody = content.encoding === 'base64'
    ? Buffer.from(content.text, 'base64').toString('utf8')
    : content.text;
  var original = decodeInput(harBody);
  changed = decodeOutput(run(harBody, entries[0].request.url));
  var expected = JSON.parse(JSON.stringify(original));
  expected.MarketingPage.Enable = false;
  expected.MarketingPage.ImageInfo = [];
  assert.deepStrictEqual(changed, expected);
  console.log('CMB China HAR replay passed: %d target response', entries.length);
}

console.log('CMB China response script synthetic tests passed');
