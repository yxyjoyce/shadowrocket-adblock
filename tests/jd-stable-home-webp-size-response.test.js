const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const worktree = path.resolve(__dirname, "..");
const scriptPath = path.join(worktree, "scripts", "jd-home-webp-size-response.js");
const script = fs.readFileSync(scriptPath, "utf8");
const remoteScriptPath = "https://raw.githubusercontent.com/yxyjoyce/shadowrocket-adblock/main/scripts/jd-home-webp-size-response.js";
const pluginLines = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8").split(/\r?\n/);
const compositePluginLine = pluginLines.find((line) => line.includes("request.header['referer']") && line.includes("reject_img(200)"));
assert(compositePluginLine, "composite request rule missing from plugin");
const compositePluginMatch = compositePluginLine.match(/^request if \$\{url\} ~= \/(.*)\/ &&/);
assert(compositePluginMatch, "composite request URL regex missing from plugin");
const candidateTargetPattern = new RegExp(compositePluginMatch[1]);
const scriptRuleLines = pluginLines.filter((line) => line.includes(`script("${remoteScriptPath}")`));
assert.equal(scriptRuleLines.length, 1, "expected one remote JD WebP response script rule");
const scriptRule = scriptRuleLines[0];
assert(!scriptRule.includes('script("scripts/jd-home-webp-size-response.js")'));
assert(scriptRule.includes("${response.status} == 200"));
assert(scriptRule.includes('${request.header[\'referer\']} == "Image_JDAppHome"'));
assert(scriptRule.includes("requires_body=true") && scriptRule.includes("binary_body_mode=true"));
const scriptSectionIndex = pluginLines.indexOf("[Script]");
const firstScriptRule = pluginLines.slice(scriptSectionIndex + 1).find((line) => line.trim() && !line.trim().startsWith("#"));
assert.equal(firstScriptRule, scriptRule, "JD WebP response script is not first among response scripts");
const targetUrl = "https://m15.360buyimg.com/mobilecms/jfs/t1/example/abcd1b0131234567.png.webp?cache=1";
const transparentWebP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x0a, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x10, 0x88, 0x88, 0x08, 0x00, 0x00,
]);
assert.equal(Buffer.from(transparentWebP).toString("hex"), "5249464616000000574542505650384c0a0000002f000000108888080000", "transparent WebP bytes changed");

function makeWebP(kind, width, height) {
  const bytes = new Uint8Array(kind === "VP8X" ? 30 : kind === "VP8L" ? 25 : 30);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const chunk = kind === "VP8" ? "VP8 " : kind;
  for (let i = 0; i < 4; i += 1) bytes[12 + i] = chunk.charCodeAt(i);
  const chunkSize = kind === "VP8X" ? 10 : kind === "VP8L" ? 5 : 10;
  bytes[16] = chunkSize;
  if (kind === "VP8X") {
    const w = width - 1;
    const h = height - 1;
    bytes[24] = w & 0xff;
    bytes[25] = (w >> 8) & 0xff;
    bytes[26] = (w >> 16) & 0xff;
    bytes[27] = h & 0xff;
    bytes[28] = (h >> 8) & 0xff;
    bytes[29] = (h >> 16) & 0xff;
  } else if (kind === "VP8L") {
    const w = width - 1;
    const h = height - 1;
    bytes[20] = 0x2f;
    bytes[21] = w & 0xff;
    bytes[22] = ((w >> 8) & 0x3f) | ((h & 0x03) << 6);
    bytes[23] = (h >> 2) & 0xff;
    bytes[24] = (h >> 10) & 0x0f;
  } else {
    bytes.set([0x9d, 0x01, 0x2a], 23);
    bytes[26] = width & 0xff;
    bytes[27] = (width >> 8) & 0x3f;
    bytes[28] = height & 0xff;
    bytes[29] = (height >> 8) & 0x3f;
  }
  return bytes;
}

function runScript({ url = targetUrl, referer = "Image_JDAppHome", status = 200, body, responseHeaders } = {}) {
  let result;
  const sandbox = {
    Uint8Array,
    $request: { url, headers: referer === null ? {} : { Referer: referer } },
    $response: {
      status,
      headers: responseHeaders || {
        "Content-Type": "image/webp",
        "content-length": String(body ? body.length : 0),
        "Content-Encoding": "identity",
        "X-Fixture": "keep",
      },
      body,
    },
    $done: (value) => { result = value; },
  };
  vm.runInNewContext(script, sandbox, { timeout: 1000 });
  assert.notEqual(result, undefined, "script did not call $done");
  return result;
}

function assertTransparent(result) {
  assert(result.body instanceof Uint8Array, "replacement body is not Uint8Array");
  assert.deepStrictEqual(Array.from(result.body), Array.from(transparentWebP));
  assert.equal(result.headers["Content-Type"], "image/webp");
  if (Object.prototype.hasOwnProperty.call(result.headers, "X-Fixture")) assert.equal(result.headers["X-Fixture"], "keep");
  for (const key of Object.keys(result.headers)) {
    assert(!["content-length", "content-encoding", "content-range", "transfer-encoding", "content-md5"].includes(key.toLowerCase()), `stale ${key} header retained`);
  }
}

function assertPassThrough(result, label) {
  assert.equal(Object.keys(result).length, 0, `${label} was modified unexpectedly`);
}

for (const kind of ["VP8X", "VP8", "VP8L"]) {
  assertTransparent(runScript({ body: makeWebP(kind, 432, 318) }));
  assertPassThrough(runScript({ body: makeWebP(kind, 431, 318) }), `${kind} wrong width`);
}
assertPassThrough(runScript({ body: makeWebP("VP8X", 432, 318), referer: "OtherReferer" }), "non-home referer");
assertPassThrough(runScript({ body: makeWebP("VP8X", 432, 318), status: 206 }), "non-200 response");
assertPassThrough(runScript({ body: Uint8Array.from([0, 1, 2, 3]) }), "invalid WebP");
assertPassThrough(runScript({ body: "not-binary" }), "string body");
assertPassThrough(runScript({ body: makeWebP("VP8X", 432, 318), url: "https://img30.360buyimg.com/mobilecms/jfs/t1/example/abcd1b0131234567.png.webp" }), "other host");
assertPassThrough(runScript({ body: makeWebP("VP8X", 432, 318), url: "https://m15.360buyimg.com/other/example/abcd1b0131234567.png.webp" }), "other path");

function ascii(bytes, offset, value) {
  return value.split("").every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

function dimensions(bytes) {
  if (bytes.length < 20 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
  if (chunk === "VP8L") return { width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8), height: 1 + ((bytes[22] >> 6) & 0x03) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10) };
  if (chunk === "VP8 ") return { width: bytes[26] | ((bytes[27] & 0x3f) << 8), height: bytes[28] | ((bytes[29] & 0x3f) << 8) };
  return null;
}

function headerObject(headers) {
  const output = {};
  for (const header of headers || []) output[header.name] = header.value;
  return output;
}

const harPaths = process.argv.slice(2);
let targetCount = 0;
let nonHomeTargetCount = 0;
let normalHomeCount = 0;
for (const harPath of harPaths) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const harName = path.basename(harPath);
  let successfulTargets = 0;
  for (const entry of har.log.entries) {
    let url;
    try {
      url = new URL(entry.request.url);
    } catch {
      continue;
    }
    if (url.hostname !== "m15.360buyimg.com" || !url.pathname.startsWith("/mobilecms/jfs/t1/") || !url.pathname.endsWith(".webp")) continue;
    const referer = (entry.request.headers || []).find((header) => String(header.name).toLowerCase() === "referer")?.value;
    const candidateTarget = candidateTargetPattern.test(url.href);
    const content = entry.response.content || {};
    if (!content.text) {
      if (candidateTarget && referer !== "Image_JDAppHome") nonHomeTargetCount += 1;
      else if (!candidateTarget && referer === "Image_JDAppHome") normalHomeCount += 1;
      continue;
    }
    const body = Uint8Array.from(Buffer.from(content.text, content.encoding === "base64" ? "base64" : "utf8"));
    const size = dimensions(body);
    const target = entry.response.status === 200 && referer === "Image_JDAppHome" && size && size.width === 432 && size.height === 318;
    const result = runScript({ url: url.href, referer, status: entry.response.status, body, responseHeaders: headerObject(entry.response.headers) });
    if (target) {
      targetCount += 1;
      successfulTargets += 1;
      assertTransparent(result);
    } else {
      if (referer !== "Image_JDAppHome" && size && size.width === 432 && size.height === 318) nonHomeTargetCount += 1;
      if (referer === "Image_JDAppHome" && (!size || size.width !== 432 || size.height !== 318)) normalHomeCount += 1;
      assertPassThrough(result, `${harName} non-target image`);
    }
  }
  if (harName.includes("60_")) assert.equal(successfulTargets, 3, "HAR60 target count changed");
  if (harName.includes("61_")) assert.equal(successfulTargets, 2, "HAR61 target count changed");
}
if (harPaths.length) {
  assert.equal(targetCount, 5, "HAR target total changed");
  assert.equal(nonHomeTargetCount, 4, "non-home target count changed");
  assert.equal(normalHomeCount, 8, "normal same-referer image count changed");
  console.log(`JD WebP size response script passed: ${targetCount} targets rewritten; ${nonHomeTargetCount} non-home targets and ${normalHomeCount} normal home images preserved`);
} else {
  console.log("JD WebP size response script synthetic tests passed for VP8X, VP8, VP8L and fail-open cases");
}
