'use strict';

var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var source = cp.execFileSync('git', ['show', 'HEAD:shadowrocket-adblock.sgmodule'], { cwd: root, encoding: 'utf8' });
var plugin = fs.readFileSync(path.join(root, 'loon-adblock.plugin'), 'utf8');

function sectionText(text, name) {
  var lines = text.replace(/\r/g, '').split('\n');
  var start = lines.indexOf('[' + name + ']');
  var end = lines.length;
  var i;
  if (start < 0) {
    return [];
  }
  for (i = start + 1; i < lines.length; i += 1) {
    if (/^\[[^\]]+\]$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function active(lines) {
  return lines.filter(function (line) {
    var value = line.trim();
    return value !== '' && value.charAt(0) !== '#';
  });
}

function convertUrlRewrite(line) {
  var match = line.match(/\s+-\s+(reject(?:-(?:200|dict|img))?)\s*$/);
  assert(match, 'unparsed URL Rewrite: ' + line);
  return line.slice(0, match.index).trimEnd() + ' ' + match[1];
}

function convertBodyRewrite(line) {
  var body;
  var match;
  assert(/^http-response-jq\s+/.test(line), 'unparsed Body Rewrite: ' + line);
  body = line.replace(/^http-response-jq\s+/, '');
  match = body.match(/^(\S+)\s+([\s\S]+)$/);
  assert(match, 'unparsed Body Rewrite fields: ' + line);
  return match[1] + ' response-body-json-jq ' + match[2];
}

function parseScript(line) {
  var match = line.match(/^(.+?)\s*=\s*type=(http-request|http-response),\s*(.*)$/);
  var tail;
  var fields = {};
  var options = {};
  if (!match) {
    throw new Error('unparsed Script: ' + line);
  }
  tail = match[3];
  var fieldRegex = /(?:^|,\s*)(pattern|script-path|requires-body|max-size|timeout|engine|argument|binary-body-mode)=/g;
  var matches = [];
  var fieldMatch;
  while ((fieldMatch = fieldRegex.exec(tail))) {
    matches.push({ key: fieldMatch[1], valueStart: fieldRegex.lastIndex, markerStart: fieldMatch.index });
  }
  matches.forEach(function (item, index) {
    var valueEnd = index + 1 < matches.length ? matches[index + 1].markerStart : tail.length;
    fields[item.key] = tail.slice(item.valueStart, valueEnd);
  });
  if (!fields.pattern || !fields['script-path']) {
    throw new Error('missing Script fields: ' + line);
  }
  options = fields;
  return {
    name: match[1].trim(),
    phase: match[2] === 'http-request' ? 'request' : 'response',
    pattern: options.pattern,
    scriptPath: options['script-path'],
    argument: options.argument,
    requiresBody: options['requires-body'] === 'true' || options['requires-body'] === '1',
    binaryBodyMode: options['binary-body-mode'] === 'true' || options['binary-body-mode'] === '1',
    timeout: options.timeout
  };
}

function escapeRegexDelimiter(pattern) {
  var result = '';
  var i;
  var slashCount;
  for (i = 0; i < pattern.length; i += 1) {
    if (pattern[i] !== '/') {
      result += pattern[i];
      continue;
    }
    slashCount = 0;
    while (i - slashCount - 1 >= 0 && pattern[i - slashCount - 1] === '\\') {
      slashCount += 1;
    }
    result += slashCount % 2 === 0 ? '\\/' : '/';
  }
  return result;
}

function convertScript(line) {
  var item = parseScript(line);
  var options = ['tag=' + JSON.stringify(item.name)];
  var call = 'script(' + JSON.stringify(item.scriptPath);
  if (item.argument !== undefined) {
    call += ', ' + JSON.stringify(item.argument);
  }
  call += ')';
  if (item.timeout !== undefined) {
    options.push('timeout=' + item.timeout);
  }
  if (item.requiresBody) {
    options.push('requires_body=true');
  }
  if (item.binaryBodyMode) {
    options.push('binary_body_mode=true');
  }
  return item.phase + ' if ${url} ~= /' + escapeRegexDelimiter(item.pattern) + '/ then ' + call + ' with ' + options.join(', ');
}

function sourceSection(name) {
  return sectionText(source, name);
}

var sourceRules = active(sourceSection('Rule'));
var pluginRules = active(sectionText(plugin, 'Rule'));
assert.strictEqual(pluginRules.length, sourceRules.length, 'Rule count');
assert.deepStrictEqual(pluginRules, sourceRules.map(function (line) {
  return line.replace(/DST-PORT/g, 'DEST-PORT');
}), 'Rule conversion');
assert.strictEqual(pluginRules.some(function (line) { return line.indexOf('DST-PORT') >= 0; }), false, 'DST-PORT must not remain');

var sourceRewrites = active(sourceSection('URL Rewrite'));
var pluginRewriteLines = active(sectionText(plugin, 'Rewrite'));
var pluginRewrites = pluginRewriteLines.filter(function (line) { return /(?:^|\s)reject(?:-(?:200|dict|img))?$/.test(line); });
assert.strictEqual(pluginRewrites.length, sourceRewrites.length, 'URL Rewrite count');
assert.deepStrictEqual(pluginRewrites, sourceRewrites.map(convertUrlRewrite), 'URL Rewrite conversion');
function actionCounts(lines) {
  var counts = {};
  lines.forEach(function (line) {
    var match = line.match(/(?:^|\s)(reject(?:-(?:200|dict|img))?)$/);
    assert(match, 'unparsed reject action: ' + line);
    counts[match[1]] = (counts[match[1]] || 0) + 1;
  });
  return counts;
}
assert.deepStrictEqual(actionCounts(pluginRewrites), actionCounts(sourceRewrites), 'reject action counts');

var sourceBodies = active(sourceSection('Body Rewrite'));
var bodyLines = pluginRewriteLines.filter(function (line) { return line.indexOf('response-body-json-jq') >= 0; });
assert.strictEqual(sourceBodies.length, 84, 'source jq baseline');
assert.strictEqual(bodyLines.length, sourceBodies.length, 'Body Rewrite count');
assert.deepStrictEqual(bodyLines, sourceBodies.map(convertBodyRewrite), 'Body Rewrite conversion');
bodyLines.forEach(function (line) {
  assert.strictEqual(line.indexOf('regex response-body-json-jq') === 0, false, 'Body Rewrite must not use regex literal prefix');
});

var sourceMaps = active(sourceSection('Map Local'));
var pluginMapConversions = pluginRewriteLines.filter(function (line) { return line.indexOf('mock-response-body') >= 0; });
assert.deepStrictEqual(pluginMapConversions, [
  '^https?:\\/\\/ap\\.(dongqiudi|dongdianqiu)\\.com\\/plat\\/v4 mock-response-body data-type=javascript data-path=https://raw.githubusercontent.com/ddgksf2013/Scripts/master/dongqiudi.js status-code=200',
  '^https:\\/\\/rr[\\w-]+\\.googlevideo\\.com\\/initplayback\\? mock-response-body data-type=text data="" status-code=200'
], 'Map Local conversion');
assert.strictEqual(sourceMaps.length, 2, 'source Map Local count');
assert.strictEqual(pluginMapConversions.length, sourceMaps.length, 'Map Local count');

var sourceScripts = active(sourceSection('Script'));
var pluginScripts = active(sectionText(plugin, 'Script'));
assert.strictEqual(sourceScripts.length, 137, 'source Script baseline');
assert.strictEqual(pluginScripts.length, sourceScripts.length, 'Script count');
assert.deepStrictEqual(pluginScripts, sourceScripts.map(convertScript), 'Script v2 conversion');
['keepStyle', '微信公众号去广告', '高德地图去广告'].forEach(function (name) {
  var sourceLine = sourceScripts.filter(function (line) { return line.indexOf(name + '=') === 0 || line.indexOf(name + ' =') === 0; })[0];
  assert(sourceLine, 'historical script entry missing in source: ' + name);
  assert.strictEqual(pluginScripts.indexOf(convertScript(sourceLine)) >= 0, true, 'historical script conversion: ' + name);
});
pluginScripts.forEach(function (line) {
  var patternPart = line.split(' then ')[0];
  assert.strictEqual(/,\s*(?:requires-body|max-size|timeout|engine|script-path|argument|binary-body-mode)=/.test(patternPart), false, 'script property leaked into pattern: ' + line);
});
assert.strictEqual(pluginScripts.filter(function (line) { return line.indexOf('youtubei\\.googleapis\\.com') >= 0 && line.indexOf('(player|get_watch)') >= 0; }).length, 1, 'YouTube player/get_watch script');
assert.strictEqual(pluginScripts.filter(function (line) { return /lianjia-home-response\.js/.test(line); }).length, 1, 'Lianjia script');
assert.strictEqual(pluginScripts.filter(function (line) { return /xiaocan-matchplacement-shadowrocket\.js/.test(line); }).length, 1, 'Xiaocan script');

function hostSet(lines) {
  var result = new Set();
  lines.forEach(function (line) {
    if (/^hostname\s*=/.test(line)) {
      line.replace(/^hostname\s*=\s*/, '').replace(/^%APPEND%\s*/, '').split(',').forEach(function (host) {
        host = host.trim();
        if (host && host !== '%APPEND%') {
          result.add(host);
        }
      });
    }
  });
  return Array.from(result).sort();
}
assert.deepStrictEqual(hostSet(active(sourceSection('MITM'))), hostSet(active(sectionText(plugin, 'Mitm'))), 'MITM hostname set');

assert.strictEqual(plugin.indexOf('#!name = 去开屏2.0去广告') >= 0, true, 'name metadata');
assert.strictEqual(plugin.indexOf('#!desc = 已抓包400余应用去开屏') >= 0, true, 'desc metadata');
assert.strictEqual(plugin.indexOf('#!type = normal') >= 0, true, 'type metadata');
assert.strictEqual(plugin.indexOf('#!loon_version = 3.5.1(983)') >= 0, true, 'Loon version metadata');
['[URL Rewrite]', '[Body Rewrite]', '[Map Local]', 'type=http-', 'requires-body', 'binary-body-mode', 'max-size', 'engine=', '%APPEND%', 'h2 = true'].forEach(function (forbidden) {
  assert.strictEqual(plugin.indexOf(forbidden), -1, 'forbidden Loon plugin token: ' + forbidden);
});
assert.strictEqual(plugin.indexOf('^https:\\/\\/rr[\\w-]+\\.googlevideo\\.com\\/initplayback\\? mock-response-body data-type=text data="" status-code=200') >= 0, true, 'initplayback mock');
assert.strictEqual(plugin.indexOf('youtubei.googleapis.com') >= 0, true, 'YouTube MITM');
assert.strictEqual(plugin.indexOf('rr*.googlevideo.com') >= 0, true, 'googlevideo MITM');

console.log('Loon plugin validation passed: Rule=%d Rewrite=%d BodyRewrite=%d Map=%d Script=%d', sourceRules.length, sourceRewrites.length, sourceBodies.length, sourceMaps.length, sourceScripts.length);
