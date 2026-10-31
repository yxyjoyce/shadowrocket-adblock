const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const worktree = path.resolve(__dirname, "..");
const plugin = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8");
const scriptPath = path.join(worktree, "scripts", "jd-response-structure-clean.js");
const script = fs.readFileSync(scriptPath, "utf8");
const lines = plugin.split(/\r?\n/);

const responseScriptUrl = "https://raw.githubusercontent.com/yxyjoyce/shadowrocket-adblock/main/scripts/jd-response-structure-clean.js";
const responseLines = lines.filter((line) => line.includes(`script("${responseScriptUrl}")`));
assert.equal(responseLines.length, 1, "expected one original JD structure response script rule");
assert(!plugin.includes("zbsdsb"), "third-party JD script reference must not remain");
assert(!plugin.includes("jd-remove-ads-v2.js"), "third-party JD script filename must not remain");
assert(!script.includes("zbsdsb"), "third-party JD script content must not remain");

const scriptSection = lines.indexOf("[Script]");
const hotWords = lines.findIndex((line) => line.includes("functionId=(hotWords|hotSearchTerms)"));
const liteAdvertising = lines.findIndex((line) => line.includes("functionId=lite_advertising"));
const liteSmartPush = lines.findIndex((line) => line.includes("functionId=lite_SmartPush"));
const responseLineIndex = lines.findIndex((line) => line.includes(`script("${responseScriptUrl}")`));
const rewriteSection = lines.indexOf("[Rewrite]");
const queryReject = lines.findIndex((line) => line.includes("queryPagePopWindow") && line.includes("reject_dict(200)"));
assert(scriptSection >= 0 && rewriteSection >= 0 && queryReject >= 0);
assert(hotWords > scriptSection && liteAdvertising > hotWords && liteSmartPush > liteAdvertising);
assert(responseLineIndex > liteSmartPush, "generic structure response script must follow existing JD-specific handlers");
assert(queryReject > rewriteSection && queryReject < scriptSection, "request reject must remain ahead of response scripts");
assert(responseLines[0].includes("${response.status} == 200"));
assert(responseLines[0].includes("requires_body=true"));

const oldJdRule = lines.find((line) => line.includes("functionId=(start|queryMaterialAdverts)"));
assert(oldJdRule && oldJdRule.includes("(?=&|$)"), "legacy JD request rule needs a functionId boundary");
const oldJdMatch = oldJdRule.match(/^([^ ]+) reject-200$/);
assert(oldJdMatch, "could not extract legacy JD request regex");
const oldJdPattern = new RegExp(oldJdMatch[1]);
assert(oldJdPattern.test("https://api.m.jd.com/client.action?functionId=start"));
assert(oldJdPattern.test("https://api.m.jd.com/client.action?functionId=queryMaterialAdverts&x=1"));
assert(!oldJdPattern.test("https://api.m.jd.com/client.action?functionId=startup"));
assert(!oldJdPattern.test("https://api.m.jd.com/client.action?functionId=queryMaterialAdvertsExtra"));

const responseUrlMatch = responseLines[0].match(/\$\{url\} ~= \/(.*)\/ &&/);
assert(responseUrlMatch, "could not extract response URL regex from the plugin rule");
const responseUrlPattern = new RegExp(responseUrlMatch[1]);
assert(responseUrlPattern.test("https://api.m.jd.com/client.action?functionId=welcomeHome"));
assert(responseUrlPattern.test("https://api.m.jd.com/client.action?foo=1&functionId=welcomeHome"));
assert(responseUrlPattern.test("http://api.m.jd.com/client.action?functionId=welcomeHome"));
assert(!responseUrlPattern.test("https://api.m.jd.com/other.action?functionId=welcomeHome"));
assert(!responseUrlPattern.test("https://other.m.jd.com/client.action?functionId=welcomeHome"));

const mitmLine = lines.find((line) => line.startsWith("hostname = "));
assert(mitmLine, "MITM hostname line missing");
const mitmHosts = mitmLine.slice("hostname = ".length).split(",").map((host) => host.trim());
assert.equal(mitmHosts.filter((host) => host === "api.m.jd.com").length, 1, "api.m.jd.com MITM must remain exactly once");

function run(url, body, status = 200) {
  let result;
  const sandbox = {
    $request: { url },
    $response: { body, status },
    $done: (value) => { result = value || {}; },
  };
  vm.runInNewContext(script, sandbox, { timeout: 1000 });
  assert.notEqual(result, undefined, "script did not call $done");
  return result;
}

function outputBody(result) {
  return result && typeof result.body === "string" ? result.body : undefined;
}

function parseOutput(result, encoded) {
  const body = outputBody(result);
  assert.equal(typeof body, "string", "expected a rewritten response body");
  return JSON.parse(encoded ? Buffer.from(body, "base64").toString("utf8") : body);
}

const jdUrl = "https://api.m.jd.com/client.action?functionId=welcomeHome";
const home = {
  code: 0,
  data: {
    floorList: [
      { type: "bottomXview", id: "candidate-1" },
      { type: "float", id: "candidate-2" },
      { type: "photoCeiling", id: "candidate-3" },
      { type: "recommend", id: "keep-1" },
      { type: "iconToolFloor", id: "tool-1" },
    ],
    webViewFloorList: [{ id: "keep-webview" }],
    ruleFloat: { enabled: true },
    otherField: "保留",
  },
};
const homeOut = parseOutput(run(jdUrl, JSON.stringify(home)), false);
assert.deepEqual(homeOut.data.floorList, [
  { type: "recommend", id: "keep-1" },
  { type: "iconToolFloor", id: "tool-1" },
]);
assert.deepEqual(homeOut.data.webViewFloorList, [{ id: "keep-webview" }]);
assert.deepEqual(homeOut.data.ruleFloat, { enabled: true });
assert.equal(homeOut.data.otherField, "保留");

const mine = {
  code: "0",
  data: {
    floors: [
      { mId: "noticeFloor", data: { commonPopup: { keep: true } } },
      {
        mId: "basefloorinfo",
        data: {
          commonPopup: { remove: true },
          commonPopup_dynamic: { remove: true },
          floatLayer: { remove: true },
          commonTips: [{ keep: true }],
          iconToolFloor: { keep: true },
        },
      },
    ],
    webViewFloorList: [{ id: "keep-webview" }],
  },
};
const mineInput = Buffer.from(JSON.stringify(mine), "utf8").toString("base64");
const mineOut = parseOutput(run(jdUrl, mineInput), true);
const baseFloor = mineOut.data.floors.find((floor) => floor.mId === "basefloorinfo");
assert.equal(Object.prototype.hasOwnProperty.call(baseFloor.data, "commonPopup"), false);
assert.equal(Object.prototype.hasOwnProperty.call(baseFloor.data, "commonPopup_dynamic"), false);
assert.equal(Object.prototype.hasOwnProperty.call(baseFloor.data, "floatLayer"), false);
assert.deepEqual(baseFloor.data.commonTips, [{ keep: true }]);
assert.deepEqual(baseFloor.data.iconToolFloor, { keep: true });
assert.deepEqual(mineOut.data.webViewFloorList, [{ id: "keep-webview" }]);
assert.deepEqual(mineOut.data.floors[0].data.commonPopup, { keep: true });

const rootFloorList = { floorList: [{ type: "float" }, { type: "normal" }] };
assert.deepEqual(parseOutput(run(jdUrl, JSON.stringify(rootFloorList)), false).floorList, [{ type: "normal" }]);
const combined = {
  floorList: [{ type: "bottomXview" }, { type: "normal" }],
  floors: [{ mId: "basefloorinfo", data: { commonPopup: {}, commonPopup_dynamic: {}, floatLayer: {}, keep: true } }],
};
const combinedOut = parseOutput(run(jdUrl, JSON.stringify(combined)), false);
assert.deepEqual(combinedOut.floorList, [{ type: "normal" }]);
assert.deepEqual(combinedOut.floors[0].data, { keep: true });
const combinedB64 = Buffer.from(JSON.stringify(combined), "utf8").toString("base64");
const combinedB64Out = parseOutput(run(jdUrl, combinedB64), true);
assert.deepEqual(combinedB64Out.floorList, [{ type: "normal" }]);
assert.deepEqual(combinedB64Out.floors[0].data, { keep: true });
assert.equal(Object.keys(run(jdUrl, JSON.stringify({ stayWindowModule: { floor: { keep: true } } }))).length, 0, "unrecognized stayWindowModule was changed");

const b64Unchanged = Buffer.from(JSON.stringify({ code: 0, data: { keep: true } }), "utf8").toString("base64");
for (const [label, url, body, status] of [
  ["non-JD", "https://example.test/client.action", JSON.stringify(home), 200],
  ["other-path", "https://api.m.jd.com/other.action?functionId=welcomeHome", JSON.stringify(home), 200],
  ["empty", jdUrl, "", 200],
  ["invalid", jdUrl, "not-json", 200],
  ["valid-base64-non-target", jdUrl, b64Unchanged, 200],
  ["array", jdUrl, "[]", 200],
  ["non-string", jdUrl, Uint8Array.from([1, 2, 3]), 200],
  ["over-2MiB", jdUrl, "{" + "x".repeat(2 * 1024 * 1024) + "}", 200],
  ["HTTP-error", jdUrl, JSON.stringify(home), 500],
]) {
  const result = run(url, body, status);
  assert.equal(Object.keys(result).length, 0, `${label} input was changed`);
}

function replayHar(harPath) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  let count = 0;
  for (const entry of har.log.entries) {
    let url;
    try { url = new URL(entry.request.url); } catch { continue; }
    if (url.hostname !== "api.m.jd.com" || url.pathname !== "/client.action") continue;
    const content = entry.response.content || {};
    if (typeof content.text !== "string" || content.text.length === 0) continue;
    const body = content.encoding === "base64"
      ? Buffer.from(content.text, "base64").toString("utf8")
      : content.text;
    const result = run(url.href, body, entry.response.status);
    assert(result && typeof result === "object", "HAR replay did not return a response object");
    if (typeof result.body === "string") {
      assert(result.body.length > 0, "HAR replay produced an empty rewritten body");
    }
    count += 1;
  }
  return count;
}

const harPaths = process.argv.slice(2);
if (harPaths.length) {
  const harCounts = harPaths.map(replayHar);
  const named = harPaths.map((file, index) => [path.basename(file), harCounts[index]]);
  const har56 = named.find(([name]) => name.includes("56_"));
  if (har56) assert(har56[1] > 0, "HAR56 had no replayable JD client.action response");
  assert(harCounts.every((count) => count >= 0), "HAR replay failed");
  console.log(`JD original structure response script passed: ${harCounts.reduce((sum, count) => sum + count, 0)} replayable API responses`);
} else {
  console.log("JD original structure response script fixture, ordering, UTF-8, Base64 and fail-open tests passed");
}
