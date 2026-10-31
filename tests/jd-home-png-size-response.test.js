const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const worktree = path.resolve(__dirname, "..");
const scriptPath = path.join(worktree, "scripts", "jd-home-png-size-response.js");
const script = fs.readFileSync(scriptPath, "utf8");
const pluginLines = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8").split(/\r?\n/);
const remoteScriptPath = "https://raw.githubusercontent.com/yxyjoyce/shadowrocket-adblock/main/scripts/jd-home-png-size-response.js";
const scriptRuleLines = pluginLines.filter((line) => line.includes(`script("${remoteScriptPath}")`));
assert.equal(scriptRuleLines.length, 1, "expected one remote JD PNG response script rule");
const scriptRule = scriptRuleLines[0];
assert(scriptRule.includes("${response.status} == 200"));
assert(scriptRule.includes("requires_body=true") && scriptRule.includes("binary_body_mode=true"));
assert(!scriptRule.includes("request.header['referer']"), "PNG branch must not require a referer");
const webpRuleIndex = pluginLines.findIndex((line) => line.includes("jd-home-webp-size-response.js"));
const pngRuleIndex = pluginLines.findIndex((line) => line.includes(`script("${remoteScriptPath}")`));
const apiRuleIndex = pluginLines.findIndex((line) => line.includes("jd-response-structure-clean.js"));
assert(webpRuleIndex >= 0 && pngRuleIndex > webpRuleIndex && pngRuleIndex < apiRuleIndex, "PNG branch ordering changed");
const urlPatternMatch = scriptRule.match(/\$\{url\} ~= \/(.*)\/ &&/);
assert(urlPatternMatch, "could not extract PNG URL regex from plugin");
const candidatePattern = new RegExp(urlPatternMatch[1]);
const targetUrl = "https://m15.360buyimg.com/mobilecms/jfs/t1/example/abcd1b0131234567.png";
assert(candidatePattern.test(targetUrl));
assert(candidatePattern.test(`${targetUrl}?cache=1`));
assert(!candidatePattern.test(targetUrl.replace(".png", ".png.webp")));
assert(!candidatePattern.test(targetUrl.replace("m15.360buyimg.com", "img30.360buyimg.com")));
assert(!candidatePattern.test(targetUrl.replace("abcd1b0131234567", "abcd1b0141234567")));
assert(!candidatePattern.test(targetUrl.replace("abcd1b0131234567", "ABCD1b0131234567")));

const transparentPng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x7a,
  0x5e, 0xab, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
assert.deepEqual(Array.from(zlib.inflateSync(Buffer.from(transparentPng).subarray(41, 52))), [0, 0, 0, 0, 0], "replacement PNG pixel is not transparent");

function makePng(width, height, valid = true) {
  const bytes = new Uint8Array(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (valid) {
    bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
    bytes[16] = (width >>> 24) & 255;
    bytes[17] = (width >>> 16) & 255;
    bytes[18] = (width >>> 8) & 255;
    bytes[19] = width & 255;
    bytes[20] = (height >>> 24) & 255;
    bytes[21] = (height >>> 16) & 255;
    bytes[22] = (height >>> 8) & 255;
    bytes[23] = height & 255;
  }
  return bytes;
}

function runScript({ url = targetUrl, status = 200, body, headers } = {}) {
  let result;
  const sandbox = {
    Uint8Array,
    $request: { url, headers: {} },
    $response: {
      status,
      headers: headers || {
        "Content-Type": "image/png",
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

function runQxScript({ url = targetUrl, statusCode = "HTTP/1.1 200 OK", body, headers } = {}) {
  let result;
  const sandbox = {
    ArrayBuffer,
    Uint8Array,
    $request: { url, headers: {} },
    $response: {
      statusCode,
      headers: headers || {
        "Content-Type": "image/png",
        "content-length": String(body ? body.length : 0),
        "Content-Encoding": "identity",
        "X-Fixture": "keep",
      },
      bodyBytes: body ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0),
    },
    $done: (value) => { result = value; },
  };
  vm.runInNewContext(script, sandbox, { timeout: 1000 });
  assert.notEqual(result, undefined, "QX script did not call $done");
  return result;
}

function assertPassThrough(result, label) {
  assert.equal(Object.keys(result).length, 0, `${label} was modified unexpectedly`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(bytes) {
  assert(bytes.length >= 33, "PNG is too short");
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG signature changed");
  let offset = 8;
  let sawIHDR = false;
  let sawIEND = false;
  let width;
  let height;
  const idat = [];
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, "PNG chunk header is truncated");
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    assert(end <= bytes.length, "PNG chunk extends beyond body");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const actualCrc = bytes.readUInt32BE(offset + 8 + length);
    const expectedCrc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    assert.equal(actualCrc, expectedCrc, `PNG ${type} CRC mismatch`);
    if (type === "IHDR") {
      assert.equal(offset, 8, "IHDR must be the first PNG chunk");
      assert.equal(length, 13, "IHDR length changed");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      sawIHDR = true;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      assert.equal(length, 0, "IEND must be empty");
      sawIEND = true;
      offset = end;
      break;
    }
    offset = end;
  }
  assert(sawIHDR && sawIEND, "PNG must contain IHDR and IEND");
  assert.equal(offset, bytes.length, "PNG has trailing bytes after IEND");
  return { width, height, idat: Buffer.concat(idat) };
}

function assertTransparent(result) {
  assert(result.body instanceof Uint8Array, "replacement body is not Uint8Array");
  assert.deepEqual(Array.from(result.body), Array.from(transparentPng));
  const parsed = validatePng(Buffer.from(result.body));
  assert.equal(parsed.width, 1);
  assert.equal(parsed.height, 1);
  assert.deepEqual(Array.from(zlib.inflateSync(parsed.idat)), [0, 0, 0, 0, 0], "replacement PNG pixel is not transparent");
  assert.equal(result.headers["Content-Type"], "image/png");
  if (Object.prototype.hasOwnProperty.call(result.headers, "X-Fixture")) assert.equal(result.headers["X-Fixture"], "keep");
  for (const key of Object.keys(result.headers)) {
    assert(!["content-length", "content-encoding", "content-range", "transfer-encoding", "content-md5"].includes(key.toLowerCase()), `stale ${key} header retained`);
  }
}

assertTransparent(runScript({ body: makePng(432, 318) }));
const qxTransparent = runQxScript({ body: makePng(432, 318) });
assert(qxTransparent.bodyBytes instanceof ArrayBuffer, "QX PNG replacement must use bodyBytes");
assertTransparent({ ...qxTransparent, body: new Uint8Array(qxTransparent.bodyBytes) });
assertTransparent(runScript({ body: makePng(432, 318), status: "200" }));
for (const [label, options] of [
  ["wrong-width", { body: makePng(431, 318) }],
  ["wrong-height", { body: makePng(432, 317) }],
  ["invalid-header", { body: makePng(432, 318, false) }],
  ["truncated", { body: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) }],
  ["wrong-status", { body: makePng(432, 318), status: 206 }],
  ["wrong-host", { body: makePng(432, 318), url: targetUrl.replace("m15.360buyimg.com", "img30.360buyimg.com") }],
  ["wrong-path", { body: makePng(432, 318), url: targetUrl.replace("/mobilecms/jfs/t1/", "/other/") }],
  ["wrong-suffix", { body: makePng(432, 318), url: targetUrl.replace(".png", ".png.webp") }],
  ["string-body", { body: "not-binary" }],
]) assertPassThrough(runScript(options), label);

function dimensions(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function headerObject(headers) {
  const output = {};
  for (const header of headers || []) output[header.name] = header.value;
  return output;
}

function replayHar(harPath) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const harName = path.basename(harPath);
  let candidateCount = 0;
  let targetCount = 0;
  let allM15ImageCount = 0;
  for (const entry of har.log.entries) {
    let url;
    try { url = new URL(entry.request.url); } catch { continue; }
    if (url.hostname !== "m15.360buyimg.com") continue;
    const content = entry.response.content || {};
    if (typeof content.text !== "string" || content.text.length === 0) continue;
    const body = Buffer.from(content.text, content.encoding === "base64" ? "base64" : "utf8");
    const result = runScript({ url: url.href, status: entry.response.status, body, headers: headerObject(entry.response.headers) });
    if (!url.pathname.startsWith("/mobilecms/jfs/t1/")) {
      assertPassThrough(result, `${harName} non-target m15 path`);
      continue;
    }
    allM15ImageCount += 1;
    const candidate = candidatePattern.test(url.href);
    const size = dimensions(body);
    const target = candidate && entry.response.status === 200 && size && size.width === 432 && size.height === 318;
    if (candidate) candidateCount += 1;
    if (target) {
      targetCount += 1;
      const sourcePng = validatePng(body);
      assert.equal(sourcePng.width, 432);
      assert.equal(sourcePng.height, 318);
      assertTransparent(result);
      const qxResult = runQxScript({ url: url.href, statusCode: "HTTP/1.1 200 OK", body, headers: headerObject(entry.response.headers) });
      assert(qxResult.bodyBytes instanceof ArrayBuffer, `${harName} QX PNG target did not return bodyBytes`);
      assertTransparent({ ...qxResult, body: new Uint8Array(qxResult.bodyBytes) });
    } else {
      assertPassThrough(result, `${harName} non-target image`);
    }
  }
  return { candidateCount, targetCount, allM15ImageCount };
}

const harPaths = process.argv.slice(2);
if (harPaths.length) {
  const results = harPaths.map(replayHar);
  for (const [index, harPath] of harPaths.entries()) {
    const name = path.basename(harPath);
    if (name.includes("64_")) {
      assert.equal(results[index].candidateCount, 6, "HAR64 candidate PNG count changed");
      assert.equal(results[index].targetCount, 6, "HAR64 target PNG count changed");
    }
    if (name.includes("60_") || name.includes("61_")) assert.equal(results[index].targetCount, 0, `${name} unexpectedly supplied PNG targets`);
  }
  console.log(`JD PNG size response script passed: ${results.reduce((sum, result) => sum + result.targetCount, 0)} target PNG responses rewritten`);
} else {
  console.log("JD PNG size response script synthetic PNG header, IHDR, transparent output and fail-open tests passed");
}
