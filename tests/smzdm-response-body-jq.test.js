const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const pluginPath = path.resolve(__dirname, "..", "loon-adblock.plugin");
const plugin = fs.readFileSync(pluginPath, "utf8");
const pluginLines = plugin.split(/\r?\n/);
const shadowrocketLines = fs.readFileSync(path.resolve(__dirname, "..", "shadowrocket-adblock.sgmodule"), "utf8").split(/\r?\n/);
const quantumultLines = fs.readFileSync(path.resolve(__dirname, "..", "quantumultx-ad-precise-rewrite.conf"), "utf8").split(/\r?\n/);
const quantumultSupplementLines = fs.readFileSync(path.resolve(__dirname, "..", "quantumultx-ad-precise-supplement.conf"), "utf8").split(/\r?\n/);

const loadingUrl = /^https?:\/\/app-api\.smzdm\.com\/util\/loading(?:\?.*)?$/;
const updateUrl = /^https?:\/\/app-api\.smzdm\.com\/util\/update(?:\?.*)?$/;

function extractJqRule(token) {
  const matches = pluginLines.filter((line) => line.includes(token) && line.includes("response.json.jq(\""));
  assert.equal(matches.length, 1, `expected one V2 jq rule for ${token}`);
  const line = matches[0];
  const startMarker = 'response.json.jq("';
  const start = line.indexOf(startMarker) + startMarker.length;
  assert(line.endsWith('")'), `malformed V2 jq action for ${token}`);
  const encodedExpression = line.slice(start, -2);
  return {
    line,
    expression: encodedExpression.replaceAll('\\"', '"'),
  };
}

const loadingRule = extractJqRule("app-api\\.smzdm\\.com\\/util\\/loading");
const updateRule = extractJqRule("app-api\\.smzdm\\.com\\/util\\/update");
assert(loadingRule.line.startsWith("response if ${url} ~= /^https?:\\/\\/app-api\\.smzdm\\.com"));
assert(updateRule.line.startsWith("response if ${url} ~= /^https?:\\/\\/app-api\\.smzdm\\.com"));
function extractNativeRule(lines, token, action) {
  const matches = lines.filter((line) => line.includes(token) && line.includes(action));
  assert.equal(matches.length, 1, `expected one ${action} rule for ${token}`);
  const line = matches[0];
  const first = line.indexOf("'");
  assert(first >= 0 && line.endsWith("'"), `malformed ${action} rule for ${token}`);
  return { line, expression: line.slice(first + 1, -1) };
}
const srLoadingRule = extractNativeRule(shadowrocketLines, "app-api\\.smzdm\\.com\\/util\\/loading", "http-response-jq");
const srUpdateRule = extractNativeRule(shadowrocketLines, "app-api\\.smzdm\\.com\\/util\\/update", "http-response-jq");
const qxLoadingRule = extractNativeRule(quantumultLines, "app-api\\.smzdm\\.com\\/util\\/loading", "jsonjq-response-body");
const qxUpdateRule = extractNativeRule(quantumultLines, "app-api\\.smzdm\\.com\\/util\\/update", "jsonjq-response-body");
const qxSupplementLoadingRule = extractNativeRule(quantumultSupplementLines, "app-api\\.smzdm\\.com\\/util\\/loading", "jsonjq-response-body");
const qxSupplementUpdateRule = extractNativeRule(quantumultSupplementLines, "app-api\\.smzdm\\.com\\/util\\/update", "jsonjq-response-body");
assert.equal(qxSupplementLoadingRule.line, qxLoadingRule.line, "QX SMZDM loading rules must be equivalent in both supported entrypoints");
assert.equal(qxSupplementUpdateRule.line, qxUpdateRule.line, "QX SMZDM update rules must be equivalent in both supported entrypoints");
for (const [name, line, marker] of [["Shadowrocket loading", srLoadingRule.line, "http-response-jq"], ["Shadowrocket update", srUpdateRule.line, "http-response-jq"], ["Quantumult X loading", qxLoadingRule.line, "jsonjq-response-body"], ["Quantumult X update", qxUpdateRule.line, "jsonjq-response-body"]]) assert(line.includes(marker), `${name} action missing`);
const mitmLine = pluginLines.find((line) => line.startsWith("hostname = "));
assert(mitmLine && /(^|, )app-api\.smzdm\.com(,|$)/.test(mitmLine), "SMZDM API host is missing from MITM");
const srMitmLines = shadowrocketLines.filter((line) => line.startsWith("hostname = "));
assert(srMitmLines.some((line) => /(?:%APPEND% |, )app-api\.smzdm\.com(?:,|$)/.test(line)), "Shadowrocket SMZDM API host is missing from MITM");
const qxMitmLine = quantumultLines.find((line) => line.startsWith("hostname = "));
assert(qxMitmLine && /(^|, )app-api\.smzdm\.com(,|$)/.test(qxMitmLine), "Quantumult X SMZDM API host is missing from MITM");
const qxSupplementMitmLine = quantumultSupplementLines.find((line) => line.startsWith("hostname = "));
assert(qxSupplementMitmLine && /(^|, )app-api\.smzdm\.com(,|$)/.test(qxSupplementMitmLine), "Quantumult X supplement SMZDM API host is missing from MITM");
assert(shadowrocketLines.some((line) => line.includes("acs-m\\.freshippo\\.com\\/gw\\/mtop\\.wdk\\.render\\.querysinglepage") && line.includes("reject-200")), "Shadowrocket Hema endpoint rule missing");
const qxHemaLine = quantumultLines.find((line) => line.includes("acs-m\\.freshippo\\.com\\/gw\\/mtop\\.wdk\\.render\\.querysinglepage") && line.includes("url reject-200"));
assert(qxHemaLine, "Quantumult X Hema endpoint rule missing");
const qxSupplementHemaLine = quantumultSupplementLines.find((line) => line.includes("acs-m\\.freshippo\\.com\\/gw\\/mtop\\.wdk\\.render\\.querysinglepage") && line.includes("url reject-200"));
assert(qxSupplementHemaLine, "Quantumult X supplement Hema endpoint rule missing");
assert.equal(qxSupplementHemaLine, qxHemaLine, "QX Hema rules must be equivalent in both supported entrypoints");
const qxHemaPattern = new RegExp(qxHemaLine.match(/^(.*?) url reject-200/)[1].replaceAll("\\/", "/"));
for (const url of [
  "https://acs-m.freshippo.com/gw/mtop.wdk.render.querysinglepage",
  "https://acs-m.freshippo.com/gw/mtop.wdk.render.querysinglepage/1.0/",
  "https://acs-m.freshippo.com/gw/mtop.wdk.render.querysinglepage?x=1",
]) assert(qxHemaPattern.test(url), `QX Hema rule rejected valid endpoint: ${url}`);
assert(!qxHemaPattern.test("https://acs-m.freshippo.com/gw/mtop.wdk.render.querysinglepageExtra"), "QX Hema rule matched similar prefix");
assert(/(?:, )acs-m\.freshippo\.com(?:,|$)/.test(qxMitmLine), "Quantumult X Hema MITM host is missing");
assert(/(?:, )acs-m\.freshippo\.com(?:,|$)/.test(qxSupplementMitmLine), "Quantumult X supplement Hema MITM host is missing");

function findJq() {
  const candidates = process.env.JQ_BIN ? [process.env.JQ_BIN] : ["jq", "gojq"];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

const jq = findJq();
if (!jq) {
  console.error("SMZDM jq tests NOT RUN: no jq/gojq executable is available");
  process.exitCode = 2;
} else {
  function runJq(expression, value) {
    const result = spawnSync(jq, ["-c", expression], {
      input: JSON.stringify(value),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `jq failed: ${result.stderr || result.error || "unknown error"}`);
    return JSON.parse(result.stdout);
  }

  function runLoonJsonAction(expression, body) {
    try {
      return JSON.stringify(runJq(expression, JSON.parse(body)));
    } catch (error) {
      if (error instanceof SyntaxError) return body;
      throw error;
    }
  }

  function assertUnchanged(expression, value, label) {
    const body = JSON.stringify(value);
    assert.deepStrictEqual(JSON.parse(runLoonJsonAction(expression, body)), value, `${label} changed unexpectedly`);
  }

  const loading = { error_code: 0, data: [{ id: 7107 }, { id: 7108 }] };
  assert.deepStrictEqual(runJq(loadingRule.expression, loading).data, [], "loading array was not cleared");
  for (const [name, expression] of [["SR loading", srLoadingRule.expression], ["QX loading", qxLoadingRule.expression]]) {
    assert.deepStrictEqual(runJq(expression, loading).data, [], `${name} array was not cleared`);
    assert.deepStrictEqual(runJq(expression, { data: { keep: true } }), { data: { keep: true } }, `${name} changed non-array data`);
  }
  assert.deepStrictEqual(runJq(loadingRule.expression, { data: [] }).data, [], "empty loading array changed");
  assertUnchanged(loadingRule.expression, { error_code: 0 }, "loading missing data");
  assertUnchanged(loadingRule.expression, { data: {} }, "loading non-array data");
  assertUnchanged(loadingRule.expression, [], "loading root array");
  assertUnchanged(loadingRule.expression, null, "loading root null");
  assert.equal(runLoonJsonAction(loadingRule.expression, "not-json"), "not-json", "invalid loading JSON was not fail-open");

  const update = {
    error_code: 0,
    data: { operation_float: [{ id: 4065 }], keep: { slot: "x" } },
    other: [1, 2, 3],
  };
  const transformedUpdate = runJq(updateRule.expression, update);
  assert.deepStrictEqual(transformedUpdate.data.operation_float, [], "operation_float was not cleared");
  assert.deepStrictEqual(transformedUpdate.data.keep, update.data.keep, "update data fields were not preserved");
  assert.deepStrictEqual(transformedUpdate.other, update.other, "update root fields were not preserved");
  for (const [name, expression] of [["SR update", srUpdateRule.expression], ["QX update", qxUpdateRule.expression]]) {
    const native = runJq(expression, update);
    assert.deepStrictEqual(native.data.operation_float, [], `${name} operation_float was not cleared`);
    assert.deepStrictEqual(native.data.keep, update.data.keep, `${name} changed sibling data`);
    assert.deepStrictEqual(native.other, update.other, `${name} changed root data`);
  }
  assertUnchanged(updateRule.expression, { data: { operation_float: [] } }, "empty operation_float");
  assertUnchanged(updateRule.expression, { data: { keep: true } }, "missing operation_float");
  assertUnchanged(updateRule.expression, { data: { operation_float: {} } }, "non-array operation_float");
  assertUnchanged(updateRule.expression, { data: [] }, "update array data");
  assertUnchanged(updateRule.expression, { error_code: 0 }, "update missing data");
  assert.equal(runLoonJsonAction(updateRule.expression, "not-json"), "not-json", "invalid update JSON was not fail-open");

  assert(loadingUrl.test("https://app-api.smzdm.com/util/loading?basic_v=0"));
  assert(!loadingUrl.test("https://app-api.smzdm.com/util/loading/extra"));
  assert(updateUrl.test("https://app-api.smzdm.com/util/update?x=1"));
  assert(!updateUrl.test("https://app-api.smzdm.com/util/update/vip_user_verify"));

  const harPath = process.argv[2];
  if (harPath) {
    const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
    const entries = har.log.entries;
    const loadingEntries = entries.filter((entry) => loadingUrl.test(entry.request.url));
    const updateEntries = entries.filter((entry) => updateUrl.test(entry.request.url));
    assert.equal(loadingEntries.length, 1, "HAR should contain one exact loading request");
    assert.equal(updateEntries.length, 1, "HAR should contain one exact update request");

    function responseText(entry) {
      const content = entry.response.content;
      if (content.encoding === "base64") return Buffer.from(content.text, "base64").toString("utf8");
      return content.text;
    }

    const loadingBody = responseText(loadingEntries[0]);
    const loadingOriginal = JSON.parse(loadingBody);
    const loadingReplay = JSON.parse(runLoonJsonAction(loadingRule.expression, loadingBody));
    assert.deepStrictEqual(loadingReplay, { ...loadingOriginal, data: [] }, "HAR loading changed unrelated fields");

    const updateBody = responseText(updateEntries[0]);
    const updateOriginal = JSON.parse(updateBody);
    const updateExpected = JSON.parse(JSON.stringify(updateOriginal));
    updateExpected.data.operation_float = [];
    const updateReplay = JSON.parse(runLoonJsonAction(updateRule.expression, updateBody));
    assert.deepStrictEqual(updateReplay, updateExpected, "HAR update changed fields beyond operation_float");
    console.log(`SMZDM jq replay passed with ${jq}: loading data cleared; update operation_float cleared; entries=${entries.length}`);
  } else {
    console.log(`SMZDM jq variant tests passed with ${jq}`);
  }
}
