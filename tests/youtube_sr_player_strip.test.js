'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var filter = require('../scripts/youtube_sr_player_strip.js');

function bytes() {
  return Uint8Array.from(Array.prototype.slice.call(arguments));
}

function concat() {
  var parts = Array.prototype.slice.call(arguments);
  var length = parts.reduce(function (total, part) { return total + part.length; }, 0);
  var result = new Uint8Array(length);
  var offset = 0;
  parts.forEach(function (part) {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function varint(value) {
  var result = [];
  while (value > 127) {
    result.push((value % 128) | 128);
    value = Math.floor(value / 128);
  }
  result.push(value);
  return Uint8Array.from(result);
}

function key(fieldNumber, wireType) {
  return varint(fieldNumber * 8 + wireType);
}

function field(fieldNumber, wireType, value) {
  var payload;
  if (wireType === 0) {
    return concat(key(fieldNumber, wireType), varint(value));
  }
  if (wireType === 1 || wireType === 5) {
    payload = Uint8Array.from(value);
    return concat(key(fieldNumber, wireType), payload);
  }
  if (wireType === 2) {
    payload = value;
    return concat(key(fieldNumber, wireType), varint(payload.length), payload);
  }
  throw new Error('test helper only supports protobuf wire types 0, 1, 2, 5');
}

function equalBytes(actual, expected, message) {
  assert.deepStrictEqual(Array.from(actual), Array.from(expected), message);
}

function includesBytes(haystack, needle) {
  var start;
  var i;
  for (start = 0; start <= haystack.length - needle.length; start += 1) {
    for (i = 0; i < needle.length; i += 1) {
      if (haystack[start + i] !== needle[i]) {
        break;
      }
    }
    if (i === needle.length) {
      return true;
    }
  }
  return false;
}

var unknownRootVarint = field(2, 0, 150);
var unknownRootFixed64 = field(3, 1, [1, 2, 3, 4, 5, 6, 7, 8]);
var normalP2 = field(2, 2, bytes(0xde, 0xad, 0x00, 0xff));
var playbackField1 = field(1, 0, 1234);
var playbackField18 = field(18, 2, bytes(0x81, 0x00, 0x7f));
var playbackUnknownFixed32 = field(19, 5, [9, 8, 7, 6]);
var playbackUnknownFixed64 = field(20, 1, [10, 11, 12, 13, 14, 15, 16, 17]);
var playback = concat(playbackField1, playbackField18, playbackUnknownFixed32, playbackUnknownFixed64);
var normalP9 = field(9, 2, playback);
var removable7 = field(7, 0, 7);
var removable68 = field(68, 5, [21, 22, 23, 24]);
var unknownRootBytes = field(70, 2, bytes(0x01, 0x80, 0x00));
var unknownRootVarintLarge = field(71, 0, 999);
var player = concat(
  unknownRootVarint,
  unknownRootFixed64,
  normalP2,
  removable7,
  normalP9,
  removable68,
  unknownRootBytes,
  unknownRootVarintLarge
);
var rewrittenPlayback = concat(playbackField1, playbackUnknownFixed32, playbackUnknownFixed64);
var expectedPlayer = concat(
  unknownRootVarint,
  unknownRootFixed64,
  normalP2,
  field(9, 2, rewrittenPlayback),
  unknownRootBytes,
  unknownRootVarintLarge
);

var next = concat(
  field(1, 0, 42),
  field(2, 1, [31, 32, 33, 34, 35, 36, 37, 38]),
  field(3, 2, bytes(0x91, 0x00, 0x92, 0x00)),
  field(4, 5, [41, 42, 43, 44])
);
var content = concat(
  field(1, 0, 77),
  field(2, 2, player),
  field(3, 2, next),
  field(4, 5, [51, 52, 53, 54])
);
var contentWithoutPlayerChange = concat(
  field(2, 0, 88),
  field(3, 2, next)
);
var watch = concat(
  field(5, 1, [61, 62, 63, 64, 65, 66, 67, 68]),
  field(1, 2, content),
  field(3, 2, next),
  field(1, 2, contentWithoutPlayerChange),
  field(4, 0, 123)
);
var expectedContent = concat(
  field(1, 0, 77),
  field(2, 2, expectedPlayer),
  field(3, 2, next),
  field(4, 5, [51, 52, 53, 54])
);
var expectedWatch = concat(
  field(5, 1, [61, 62, 63, 64, 65, 66, 67, 68]),
  field(1, 2, expectedContent),
  field(3, 2, next),
  field(1, 2, contentWithoutPlayerChange),
  field(4, 0, 123)
);

var playerResult = filter.filterPlayerMessage(player);
assert.strictEqual(playerResult.valid, true);
assert.strictEqual(playerResult.changed, true);
equalBytes(playerResult.body, expectedPlayer, 'Player output must preserve all unmodified field bytes');
assert.strictEqual(includesBytes(playerResult.body, normalP2), true, 'normal field 2 must remain byte exact');
assert.strictEqual(includesBytes(playerResult.body, playbackField1), true, 'PlaybackTracking field 1 must remain byte exact');
assert.strictEqual(includesBytes(playerResult.body, removable7), false, 'Player field 7 must be removed');
assert.strictEqual(includesBytes(playerResult.body, removable68), false, 'Player field 68 must be removed');
assert.strictEqual(includesBytes(playerResult.body, playbackField18), false, 'PlaybackTracking field 18 must be removed');

var watchResult = filter.filterGetWatchMessage(watch);
assert.strictEqual(watchResult.valid, true);
assert.strictEqual(watchResult.changed, true);
equalBytes(watchResult.body, expectedWatch, 'get_watch must rewrite only Content field 2 Players');
assert.strictEqual(includesBytes(watchResult.body, next), true, 'Content/root field 3 Next bytes must remain exact');
assert.strictEqual(includesBytes(watchResult.body, contentWithoutPlayerChange), true, 'non-target Content bytes must remain exact');

var playerUrl = 'https://youtubei.googleapis.com/youtubei/v1/player?key=test';
var watchUrl = 'https://youtubei.googleapis.com/youtubei/v1/get_watch';
var browseUrl = 'https://youtubei.googleapis.com/youtubei/v1/browse';
equalBytes(filter.transformResponseBody(player, playerUrl).body, expectedPlayer, 'player URL must dispatch to Player filter');
equalBytes(filter.transformResponseBody(watch, watchUrl).body, expectedWatch, 'get_watch URL must dispatch to get_watch filter');
var browseResult = filter.transformResponseBody(player, browseUrl);
assert.strictEqual(browseResult.matched, false);
assert.strictEqual(browseResult.changed, false);
equalBytes(browseResult.body, player, 'browse must remain untouched');

equalBytes(filter.filterPlayerMessage(player.buffer).body, expectedPlayer, 'ArrayBuffer input must be supported');
var padded = new Uint8Array(player.length + 2);
padded.set(player, 1);
equalBytes(filter.filterPlayerMessage(padded.subarray(1, padded.length - 1)).body, expectedPlayer, 'ArrayBuffer view input must be supported');
equalBytes(filter.filterPlayerMessage(new DataView(padded.buffer, 1, player.length)).body, expectedPlayer, 'DataView input must be supported');
equalBytes(filter.filterPlayerMessage(String.fromCharCode.apply(null, Array.from(player))).body, expectedPlayer, 'binary string input must be supported');

var malformed = bytes(0x12, 0x03, 0x01, 0x02);
var malformedResult = filter.filterPlayerMessage(malformed);
assert.strictEqual(malformedResult.valid, false);
assert.strictEqual(malformedResult.changed, false);
equalBytes(malformedResult.body, malformed, 'malformed protobuf must fail open');
var unsupported = bytes(0x0b, 0x01);
var unsupportedResult = filter.filterPlayerMessage(unsupported);
assert.strictEqual(unsupportedResult.valid, false);
equalBytes(unsupportedResult.body, unsupported, 'unsupported wire type must fail open');

var source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'youtube_sr_player_strip.js'), 'utf8');
assert.strictEqual(source.indexOf('bodyBytes'), -1, 'Shadowrocket output must use body, not bodyBytes');
assert.notStrictEqual(source.indexOf('$response.body'), -1, 'runtime must read $response.body');
assert.notStrictEqual(source.indexOf('$done({ body: result.body })'), -1, 'changed runtime output must be Uint8Array body');
assert.strictEqual(source.indexOf('console.log'), -1, 'runtime must not log');

var runtimeOutput;
vm.runInNewContext(source, {
  ArrayBuffer: ArrayBuffer,
  Uint8Array: Uint8Array,
  $request: { url: playerUrl },
  $response: { body: player },
  $done: function (value) { runtimeOutput = value; }
});
assert.strictEqual(ArrayBuffer.isView(runtimeOutput.body), true, 'runtime changed output must be a typed byte view');
equalBytes(runtimeOutput.body, expectedPlayer, 'runtime must write the filtered bytes through body');

console.log('youtube_sr_player_strip tests passed');
