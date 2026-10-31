const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const worktree = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(worktree, "scripts", "baidu-home-minimal.js"), "utf8");
const pluginLines = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8").split(/\r?\n/);
const shadowrocketLines = fs.readFileSync(path.join(worktree, "shadowrocket-adblock.sgmodule"), "utf8").split(/\r?\n/);
const quantumultLines = fs.readFileSync(path.join(worktree, "quantumultx-ad-precise-rewrite.conf"), "utf8").split(/\r?\n/);
const quantumultSupplementLines = fs.readFileSync(path.join(worktree, "quantumultx-ad-precise-supplement.conf"), "utf8").split(/\r?\n/);
const remoteScriptPath = "https://raw.githubusercontent.com/yxyjoyce/shadowrocket-adblock/main/scripts/baidu-home-minimal.js";
const scriptLines = pluginLines.filter((line) => line.includes(`script("${remoteScriptPath}")`));
assert.equal(scriptLines.length, 1, "expected one Baidu home response script rule");
const scriptLine = scriptLines[0];
assert(scriptLine.includes("${response.status} == 200") && scriptLine.includes("requires_body=true"));
assert(script.includes("baidu_home_minimal:"), "fixed privacy-safe event log prefix missing");
assert(!script.includes("console.log(url") && !script.includes("console.log(body"), "privacy data must not be logged");
const urlPatternMatch = scriptLine.match(/\$\{url\} ~= \/(.*)\/ &&/);
assert(urlPatternMatch, "could not extract Loon Baidu home URL regex");
const srLines = shadowrocketLines.filter((line) => line.includes(`script-path=${remoteScriptPath}`));
assert.equal(srLines.length, 1, "expected one Shadowrocket Baidu home response script rule");
const srLine = srLines[0];
assert(srLine.includes("type=http-response") && srLine.includes("requires-body=1") && srLine.includes("max-size=1048576"));
const qxLines = quantumultLines.filter((line) => line.includes(`script-response-body ${remoteScriptPath}`));
assert.equal(qxLines.length, 1, "expected one Quantumult X Baidu home response script rule");
const qxLine = qxLines[0];
assert(qxLine.includes(" url script-response-body "));
const qxSupplementLines = quantumultSupplementLines.filter((line) => line.includes(`script-response-body ${remoteScriptPath}`));
assert.equal(qxSupplementLines.length, 1, "expected one Baidu home rule in the alternate QX supplement");
assert.equal(qxSupplementLines[0], qxLines[0], "QX Baidu home rules must be equivalent in both supported entrypoints");
assert(!shadowrocketLines.some((line) => line.includes("kelee.one/Resource/JavaScript/BaiduSearch")), "old Shadowrocket Baidu script must not remain");
function extractPattern(line, marker) {
  const match = line.match(marker);
  assert(match, `could not extract URL regex from ${line}`);
  return new RegExp(match[1].replaceAll("\\/", "/"));
}
const urlPatterns = [
  ["Loon", new RegExp(urlPatternMatch[1])],
  ["Shadowrocket", extractPattern(srLine, /pattern=(.*), script-path=/)],
  ["Quantumult X", extractPattern(qxLine, /^(.*?) url script-response-body /)],
];
for (const [name, urlPattern] of urlPatterns) {
  for (const url of ["https://www.baidu.com/", "https://m.baidu.com/", "https://www.baidu.com/?tn=home", "https://m.baidu.com/?foo=1&tn=home"]) assert(urlPattern.test(url), `${name} regex rejected allowed home URL: ${url}`);
  for (const url of ["https://www.baidu.com/?wd=foo", "https://www.baidu.com/?foo=1&wd=foo", "https://www.baidu.com/?word=foo", "https://www.baidu.com/?query=foo", "https://www.baidu.com/?q=foo", "https://www.baidu.com/s?wd=foo"]) assert(!urlPattern.test(url), `${name} regex accepted search URL: ${url}`);
  assert(!urlPattern.test("http://www.baidu.com/"));
  assert(!urlPattern.test("https://m.baidu.com/s"));
}
const scriptSection = pluginLines.indexOf("[Script]");
const scriptIndex = pluginLines.indexOf(scriptLine);
assert(scriptSection >= 0 && scriptIndex > scriptSection);
assert(!pluginLines.some((line, index) => index !== scriptIndex && line.includes("www\\.baidu\\.com") && line.includes("response")), "Baidu home response first-match conflict found");
const mitmLine = pluginLines.find((line) => line.startsWith("hostname = "));
assert(mitmLine, "MITM hostname line missing");
const mitmHosts = mitmLine.slice("hostname = ".length).split(",").map((host) => host.trim());
assert.equal(mitmHosts.filter((host) => host === "www.baidu.com").length, 1, "www.baidu.com MITM must remain exactly once");
assert.equal(mitmHosts.filter((host) => host === "m.baidu.com").length, 1, "m.baidu.com MITM must remain exactly once");
const srMitmLines = shadowrocketLines.filter((line) => line.startsWith("hostname = "));
assert(srMitmLines.length > 0, "Shadowrocket MITM hostname line missing");
const srMitmHosts = srMitmLines.flatMap((line) => line.replace(/^hostname = (?:%APPEND%\s+)?/, "").split(",").map((host) => host.trim()));
assert.equal(srMitmHosts.filter((host) => host === "www.baidu.com").length, 1, "Shadowrocket www.baidu.com MITM must remain exactly once");
assert.equal(srMitmHosts.filter((host) => host === "m.baidu.com").length, 1, "Shadowrocket m.baidu.com MITM must remain exactly once");
const qxMitmLine = quantumultLines.find((line) => line.startsWith("hostname = "));
assert(qxMitmLine, "Quantumult X MITM hostname line missing");
const qxMitmHosts = qxMitmLine.slice("hostname = ".length).split(",").map((host) => host.trim());
assert.equal(qxMitmHosts.filter((host) => host === "www.baidu.com").length, 1, "Quantumult X www.baidu.com MITM must be present exactly once");
assert.equal(qxMitmHosts.filter((host) => host === "m.baidu.com").length, 1, "Quantumult X m.baidu.com MITM must be present exactly once");
const qxSupplementMitmLine = quantumultSupplementLines.find((line) => line.startsWith("hostname = "));
assert(qxSupplementMitmLine, "Quantumult X supplement MITM hostname line missing");
const qxSupplementMitmHosts = qxSupplementMitmLine.slice("hostname = ".length).split(",").map((host) => host.trim());
assert.equal(qxSupplementMitmHosts.filter((host) => host === "www.baidu.com").length, 1, "Quantumult X supplement www.baidu.com MITM must be present exactly once");
assert.equal(qxSupplementMitmHosts.filter((host) => host === "m.baidu.com").length, 1, "Quantumult X supplement m.baidu.com MITM must be present exactly once");

const style = '<style id="loon-baidu-home-minimal">#wise-index-feed{display:none!important}#userinfo-wrap .has-background-userinfo-bubble{display:none!important}#header{min-height:100vh}#header #logo{margin-top:max(0px,min(40vh,calc((100vh - 148px)/2 - 61px)))}@supports (height:100svh){#header{min-height:100svh}#header #logo{margin-top:max(0px,min(40svh,calc((100svh - 148px)/2 - 61px)))}}</style>';
assert(script.includes("#header #logo{margin-top:max(0px,min("), "dynamic vertical centering CSS missing");
assert(script.includes("100svh") && script.includes("calc((100svh - 148px)/2 - 61px)"), "small viewport CSS missing");
assert(!script.includes("position:fixed") && !script.includes("position:absolute"), "centering must remain in normal document flow");
const fixture = '<html><head><meta charset="utf-8"></head><body><header id="header"><div id="userinfo-wrap"><span class="menu-area"></span><span class="has-background-userinfo-bubble">小说促销</span><span class="square-enterance"></span></div><div id="wiseindex-bdlogo"></div><form id="index-form"><input></form><section id="wise-index-feed"><script>window.keepFunction=true</script></section></header></body></html>';

function execute(url, body, responseFields, events = []) {
  let result;
  vm.runInNewContext(script, {
    $request: { url },
    $response: responseFields,
    console: { log: (message) => events.push(String(message)) },
    $done: (value) => { result = value || {}; },
  }, { timeout: 1000 });
  assert.notEqual(result, undefined, "script did not call $done");
  return result;
}

function run(url, body, status = 200, events = []) {
  return execute(url, body, { status, body }, events);
}

function runQx(url, body, statusCode, events = []) {
  const response = { body };
  if (arguments.length >= 3) response.statusCode = statusCode;
  return execute(url, body, response, events);
}

const fixtureResult = run("https://www.baidu.com/", fixture);
const fixtureEvents = [];
const fixtureLoggedResult = run("https://www.baidu.com/", fixture, 200, fixtureEvents);
assert.deepEqual(fixtureEvents, ["baidu_home_minimal:injected_feed_present"]);
assert.equal(fixtureLoggedResult.body, fixtureResult.body);
assert.equal(fixtureResult.body.replace(style, ""), fixture, "HTML outside the injected style changed");
assert.equal((fixtureResult.body.match(/loon-baidu-home-minimal/g) || []).length, 1);
assert(fixtureResult.body.includes("#wise-index-feed{display:none!important}"));
assert(fixtureResult.body.includes("#userinfo-wrap .has-background-userinfo-bubble{display:none!important}"));
for (const anchor of ["id=\"header\"", "id=\"userinfo-wrap\"", "menu-area", "has-background-userinfo-bubble", "square-enterance", "id=\"wiseindex-bdlogo\"", "id=\"index-form\"", "id=\"wise-index-feed\""]) assert(fixtureResult.body.includes(anchor));
const noPromotionFixture = fixture.replace(' class="has-background-userinfo-bubble"', '');
const noPromotionResult = run("https://www.baidu.com/", noPromotionFixture);
assert.equal(noPromotionResult.body.replace(style, ""), noPromotionFixture, "optional promotion marker changed other HTML");
assert(noPromotionResult.body.includes("#wise-index-feed{display:none!important}"), "feed should still be hidden without the optional promotion marker");
assert.equal(Object.keys(run("https://www.baidu.com/", fixtureResult.body)).length, 0, "already injected HTML was changed twice");
const alreadyEvents = [];
assert.equal(Object.keys(run("https://www.baidu.com/", fixtureResult.body.replace('id="loon-baidu-home-minimal"', "id='loon-baidu-home-minimal'"), 200, alreadyEvents)).length, 0, "single-quoted injected style was changed twice");
assert.deepEqual(alreadyEvents, ["baidu_home_minimal:skip_already_injected"]);
const singleQuoteFixture = fixture.replace('id="wiseindex-bdlogo"', "id='wiseindex-bdlogo'").replace('id="index-form"', "id='index-form'");
assert(singleQuoteFixture && typeof run("https://m.baidu.com/?tn=home", singleQuoteFixture).body === "string", "single-quoted core anchors were not recognized");
const noFeedFixture = fixture.replace('id="wise-index-feed"', 'id="other-feed"');
const noFeedEvents = [];
assert(run("https://www.baidu.com/", noFeedFixture, 200, noFeedEvents).body.includes("#wise-index-feed{display:none!important}"), "missing optional feed did not remain fail-safe");
assert.deepEqual(noFeedEvents, ["baidu_home_minimal:injected_feed_missing"]);

for (const [label, executeResponse] of [
  ["Loon numeric status", () => run("https://www.baidu.com/", fixture, 200)],
  ["Shadowrocket string status", () => run("https://www.baidu.com/", fixture, "200")],
  ["Quantumult X HTTP status", () => runQx("https://www.baidu.com/", fixture, "HTTP/1.1 200 OK")],
  ["Quantumult X HTTP/2 status", () => runQx("https://www.baidu.com/", fixture, "HTTP/2 200")],
  ["missing status", () => execute("https://www.baidu.com/", fixture, { body: fixture })],
]) {
  assert(executeResponse().body.includes("#wise-index-feed{display:none!important}"), `${label} was not accepted`);
}
for (const [label, executeResponse] of [
  ["numeric non-200", () => run("https://www.baidu.com/", fixture, 304)],
  ["string non-200", () => run("https://www.baidu.com/", fixture, "304")],
  ["Quantumult X non-200", () => runQx("https://www.baidu.com/", fixture, "HTTP/1.1 304 Not Modified")],
]) {
  assert.equal(Object.keys(executeResponse()).length, 0, `${label} was modified`);
}

for (const [label, url, body, status, expectedEvent] of [
  ["search-word", "https://www.baidu.com/?wd=foo", fixture, 200, "skip_status_or_url"],
  ["search-word-later", "https://www.baidu.com/?foo=1&wd=foo", fixture, 200, "skip_status_or_url"],
  ["search-query", "https://www.baidu.com/?query=foo", fixture, 200, "skip_status_or_url"],
  ["search-q", "https://www.baidu.com/?q=foo", fixture, 200, "skip_status_or_url"],
  ["search-result", "https://www.baidu.com/s?wd=foo", fixture, 200, "skip_status_or_url"],
  ["HTTP", "http://www.baidu.com/", fixture, 200, "skip_status_or_url"],
  ["non-200", "https://www.baidu.com/", fixture, 304, "skip_status_or_url"],
  ["empty", "https://www.baidu.com/", "", 200, "skip_empty"],
  ["missing-core-anchor", "https://www.baidu.com/", fixture.replace('id="wiseindex-bdlogo"', 'id="other-logo"'), 200, "skip_core_anchors"],
  ["missing-head", "https://www.baidu.com/", fixture.replace("<head>", "<div>"), 200, "skip_no_head"],
]) {
  const events = [];
  assert.equal(Object.keys(run(url, body, status, events)).length, 0, `${label} input was modified`);
  assert.deepEqual(events, [`baidu_home_minimal:${expectedEvent}`], `${label} emitted an unexpected event`);
}

const harPath = process.argv[2];
if (harPath) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const entry = har.log.entries[97];
  assert(entry, "HAR66 entry 97 missing");
  const entryUrl = new URL(entry.request.url);
  assert.equal(entryUrl.hostname, "www.baidu.com");
  assert.equal(entryUrl.pathname, "/");
  assert.equal(entryUrl.search, "");
  assert.equal(entry.response.status, 200);
  const content = entry.response.content || {};
  assert.equal(typeof content.text, "string");
  const html = content.encoding === "base64" ? Buffer.from(content.text, "base64").toString("utf8") : content.text;
  const events = [];
  const result = run(entryUrl.href, html, entry.response.status, events);
  assert.equal(result.body.replace(style, ""), html, "HAR66 HTML outside injected CSS changed");
  assert.equal((result.body.match(/loon-baidu-home-minimal/g) || []).length, 1);
  assert(result.body.includes("#wise-index-feed{display:none!important}"));
  assert(result.body.includes("#userinfo-wrap .has-background-userinfo-bubble{display:none!important}"));
  assert.deepEqual(events, ["baidu_home_minimal:injected_feed_present"]);
  const qxEvents = [];
  const qxResult = runQx(entryUrl.href, html, "HTTP/1.1 200 OK", qxEvents);
  assert.equal(qxResult.body.replace(style, ""), html, "QX HAR66 HTML outside injected CSS changed");
  assert.equal((qxResult.body.match(/loon-baidu-home-minimal/g) || []).length, 1);
  assert.deepEqual(qxEvents, ["baidu_home_minimal:injected_feed_present"]);
  console.log("Baidu home HAR66 entry 97 HTML response rewrite passed");
} else {
  console.log("Baidu home minimal HTML fixture, URL boundary, anchors, idempotence and fail-open tests passed");
}
