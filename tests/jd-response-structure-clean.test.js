const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const worktree = path.resolve(__dirname, "..");
const plugin = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8");
const scriptPath = path.join(worktree, "scripts", "jd-response-structure-clean.js");
const script = fs.readFileSync(scriptPath, "utf8");
const lines = plugin.split(/\r?\n/);
const shadowrocketLines = fs.readFileSync(path.join(worktree, "shadowrocket-adblock.sgmodule"), "utf8").split(/\r?\n/);
const quantumultLines = fs.readFileSync(path.join(worktree, "quantumultx-ad-precise-rewrite.conf"), "utf8").split(/\r?\n/);
const quantumultSupplementLines = fs.readFileSync(path.join(worktree, "quantumultx-ad-precise-supplement.conf"), "utf8").split(/\r?\n/);

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

const srQueryReject = shadowrocketLines.find((line) => line.includes("functionId=queryPagePopWindow") && line.includes("reject-dict"));
assert(srQueryReject, "Shadowrocket queryPagePopWindow reject-dict missing");
const srResponseLine = shadowrocketLines.find((line) => line.includes(`script-path=${responseScriptUrl}`));
assert(srResponseLine && srResponseLine.includes("type=http-response") && srResponseLine.includes("requires-body=true"), "Shadowrocket JD response script missing");
const srMitmHosts = shadowrocketLines
  .filter((line) => line.startsWith("hostname = "))
  .flatMap((line) => line.replace(/^hostname = (?:%APPEND%\s+)?/, "").split(",").map((host) => host.trim()));
assert(srMitmHosts.includes("api.m.jd.com"), "Shadowrocket api.m.jd.com MITM missing");
assert(srMitmHosts.includes("m15.360buyimg.com"), "Shadowrocket m15.360buyimg.com MITM missing");
const qxQueryReject = quantumultLines.find((line) => line.includes("functionId=queryPagePopWindow") && line.includes("url reject-dict"));
assert(qxQueryReject, "Quantumult X queryPagePopWindow reject-dict missing");
const qxSupplementQueryReject = quantumultSupplementLines.find((line) => line.includes("functionId=queryPagePopWindow") && line.includes("url reject-dict"));
assert.equal(qxSupplementQueryReject, qxQueryReject, "QX JD request rules must be equivalent in both supported entrypoints");
const qxResponseLine = quantumultLines.find((line) => line.includes(`script-response-body ${responseScriptUrl}`));
assert(qxResponseLine, "Quantumult X JD response script missing");
const qxSupplementResponseLine = quantumultSupplementLines.find((line) => line.includes(`script-response-body ${responseScriptUrl}`));
assert.equal(qxSupplementResponseLine, qxResponseLine, "QX JD response rules must be equivalent in both supported entrypoints");
const qxMitmLine = quantumultLines.find((line) => line.startsWith("hostname = "));
assert(qxMitmLine && /(?:, )api\.m\.jd\.com(?:,|$)/.test(qxMitmLine), "Quantumult X api.m.jd.com MITM missing");
assert(/(?:, )m15\.360buyimg\.com(?:,|$)/.test(qxMitmLine), "Quantumult X m15.360buyimg.com MITM missing");
const qxSupplementMitmLine = quantumultSupplementLines.find((line) => line.startsWith("hostname = "));
assert(qxSupplementMitmLine && /(?:, )api\.m\.jd\.com(?:,|$)/.test(qxSupplementMitmLine), "Quantumult X supplement api.m.jd.com MITM missing");
assert(/(?:, )m15\.360buyimg\.com(?:,|$)/.test(qxSupplementMitmLine), "Quantumult X supplement m15.360buyimg.com MITM missing");
for (const basename of ["02581b013ea1b837", "02761b013ebec24e", "02761b013e4d11bd", "02761b013ef71270"]) {
  assert(shadowrocketLines.some((line) => line.includes(basename) && line.includes("reject-img")), `Shadowrocket exact image rule missing: ${basename}`);
  assert(quantumultLines.some((line) => line.includes(basename) && line.includes("reject-img")), `Quantumult X exact image rule missing: ${basename}`);
  assert(quantumultSupplementLines.some((line) => line.includes(basename) && line.includes("reject-img")), `Quantumult X supplement exact image rule missing: ${basename}`);
}
assert(shadowrocketLines.some((line) => line.includes("jd-home-webp-size-response.js") && line.includes("binary-body-mode=true")), "Shadowrocket WebP size response rule missing");
assert(shadowrocketLines.some((line) => line.includes("jd-home-png-size-response.js") && line.includes("binary-body-mode=true")), "Shadowrocket PNG size response rule missing");
assert(quantumultLines.some((line) => line.includes("jd-home-webp-size-response.js")), "Quantumult X WebP size response rule missing");
assert(quantumultLines.some((line) => line.includes("jd-home-png-size-response.js")), "Quantumult X PNG size response rule missing");
assert(quantumultSupplementLines.some((line) => line.includes("jd-home-webp-size-response.js")), "Quantumult X supplement WebP size response rule missing");
assert(quantumultSupplementLines.some((line) => line.includes("jd-home-png-size-response.js")), "Quantumult X supplement PNG size response rule missing");

const oldJdRule = lines.find((line) => line.includes("functionId=(start|queryMaterialAdverts)"));
assert(oldJdRule && oldJdRule.includes("(?=&|$)"), "legacy JD request rule needs a functionId boundary");
const oldJdMatch = oldJdRule.match(/^([^ ]+) reject-200$/);
assert(oldJdMatch, "could not extract legacy JD request regex");
const oldJdPattern = new RegExp(oldJdMatch[1]);
assert(oldJdPattern.test("https://api.m.jd.com/client.action?functionId=start"));
assert(oldJdPattern.test("https://api.m.jd.com/client.action?functionId=queryMaterialAdverts&x=1"));
assert(!oldJdPattern.test("https://api.m.jd.com/client.action?functionId=startup"));
assert(!oldJdPattern.test("https://api.m.jd.com/client.action?functionId=queryMaterialAdvertsExtra"));
const srOldJdRule = shadowrocketLines.find((line) => line.includes("functionId=(start|queryMaterialAdverts)"));
assert(srOldJdRule && srOldJdRule.includes("(?=&|$)"), "Shadowrocket legacy JD functionId boundary missing");

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

function runQx(url, body, statusCode = "HTTP/1.1 200 OK", headers = {}) {
  let result;
  vm.runInNewContext(script, {
    $request: { url, headers },
    $response: { statusCode, body },
    $done: (value) => { result = value || {}; },
  }, { timeout: 1000 });
  assert.notEqual(result, undefined, "QX JD script did not call $done");
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
const srStringStatusOut = parseOutput(run(jdUrl, JSON.stringify(home), "200"), false);
assert.deepEqual(srStringStatusOut.data.floorList, homeOut.data.floorList, "string HTTP status was not accepted");
const qxStatusOut = parseOutput(runQx(jdUrl, JSON.stringify(home), "HTTP/1.1 200 OK", { "Content-Type": "application/json" }), false);
assert.deepEqual(qxStatusOut.data.floorList, homeOut.data.floorList, "QX statusCode was not accepted");

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
const promotion = {
  code: 0,
  promotionTabs: {
    type: "promotionTabs",
    content: {
      type: "promotionTabs",
      data: [{ isCycFrame: "1", tabName: "推广" }],
      keepContentField: "keep",
    },
    keepPromotionField: true,
  },
  data: {
    promotionTabs: {
      type: "promotionTabs",
      content: { type: "promotionTabs", data: [{ tabName: "另一推广" }] },
    },
    floorList: [{ type: "normal" }],
  },
  keepRootField: "keep",
};
const promotionOut = parseOutput(run(jdUrl, JSON.stringify(promotion)), false);
assert.deepEqual(promotionOut.promotionTabs.content.data, []);
assert.equal(promotionOut.promotionTabs.content.keepContentField, "keep");
assert.equal(promotionOut.promotionTabs.keepPromotionField, true);
assert.deepEqual(promotionOut.data.promotionTabs.content.data, []);
assert.deepEqual(promotionOut.data.floorList, [{ type: "normal" }]);
assert.equal(promotionOut.keepRootField, "keep");
const promotionB64 = Buffer.from(JSON.stringify(promotion), "utf8").toString("base64");
const promotionB64Out = parseOutput(run(jdUrl, promotionB64), true);
assert.deepEqual(promotionB64Out.promotionTabs.content.data, []);
assert.deepEqual(promotionB64Out.data.promotionTabs.content.data, []);
for (const [label, body] of [
  ["promotion-missing", JSON.stringify({ promotionTabs: { type: "other", content: { type: "promotionTabs", data: [{}] } } })],
  ["promotion-content-type", JSON.stringify({ promotionTabs: { type: "promotionTabs", content: { type: "other", data: [{}] } } })],
  ["promotion-empty", JSON.stringify({ promotionTabs: { type: "promotionTabs", content: { type: "promotionTabs", data: [] } } })],
  ["promotion-non-array", JSON.stringify({ promotionTabs: { type: "promotionTabs", content: { type: "promotionTabs", data: {} } } })],
]) {
  assert.equal(Object.keys(run(jdUrl, body)).length, 0, `${label} was changed unexpectedly`);
}
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
assert.equal(Object.keys(runQx(jdUrl, JSON.stringify(home), "HTTP/1.1 304 Not Modified")).length, 0, "QX non-200 input was changed");

function replayHar(harPath) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  let count = 0;
  let promotionTargetCount = 0;
  let promotionRewriteCount = 0;
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
    const before = (() => { try { return JSON.parse(body); } catch { return null; } })();
    const target = before && before.promotionTabs && before.promotionTabs.type === "promotionTabs" && before.promotionTabs.content && before.promotionTabs.content.type === "promotionTabs" && Array.isArray(before.promotionTabs.content.data) && before.promotionTabs.content.data.length > 0;
    if (target) {
      promotionTargetCount += 1;
      const scriptMarker = entry._loon && entry._loon.script;
      const scriptApplied = Array.isArray(scriptMarker)
        ? scriptMarker.includes("jd_response_structure_clean")
        : scriptMarker === "jd_response_structure_clean";
      assert(scriptApplied, "HAR promotionTabs target was not marked by the expected response script");
      assert(result && typeof result.body === "string", "promotionTabs target was not rewritten");
      const after = JSON.parse(result.body);
      assert.deepEqual(after.promotionTabs.content.data, []);
      const expected = JSON.parse(JSON.stringify(before));
      expected.promotionTabs.content.data = [];
      assert.deepEqual(after, expected, "HAR promotionTabs replay changed fields outside content.data");
      promotionRewriteCount += 1;
    }
    count += 1;
  }
  return { count, promotionTargetCount, promotionRewriteCount };
}

const harPaths = process.argv.slice(2);
if (harPaths.length) {
  const harResults = harPaths.map(replayHar);
  const named = harPaths.map((file, index) => [path.basename(file), harResults[index]]);
  const har56 = named.find(([name]) => name.includes("56_"));
  if (har56) assert(har56[1].count > 0, "HAR56 had no replayable JD client.action response");
  const har64 = named.find(([name]) => name.includes("64_"));
  if (har64) {
    assert.equal(har64[1].promotionTargetCount, 1, "HAR64 promotionTabs target count changed");
    assert.equal(har64[1].promotionRewriteCount, 1, "HAR64 promotionTabs rewrite count changed");
  }
  assert(harResults.every((result) => result.count >= 0), "HAR replay failed");
  console.log(`JD original structure response script passed: ${harResults.reduce((sum, result) => sum + result.count, 0)} replayable API responses`);
} else {
  console.log("JD original structure response script fixture, ordering, UTF-8, Base64 and fail-open tests passed");
}
