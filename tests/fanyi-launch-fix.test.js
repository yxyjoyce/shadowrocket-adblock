const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const worktree = path.resolve(__dirname, "..");
const plugin = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8");
const lines = plugin.split(/\r?\n/);
const jqLines = lines.filter((line) => line.includes("fanyi-app\\.baidu\\.com\\/transapp\\/v2\\/api\\/launch\\/config") && line.includes("response.json.jq(\""));
assert.equal(jqLines.length, 1, "expected one launch-config V2 jq rule");
const jqMarker = 'response.json.jq("';
const jqLine = jqLines[0];
assert(jqLine.endsWith('")'), "malformed V2 jq action");
const jqExpression = jqLine.slice(jqLine.indexOf(jqMarker) + jqMarker.length, -2).replaceAll('\\"', '"');
const urlPatternMatch = jqLine.match(/^response if \$\{url\} ~= \/(.*)\/ && \$\{response\.status\} == 200 then response\.json\.jq/);
assert(urlPatternMatch, "could not extract URL regex from the plugin rule");
const urlPattern = new RegExp(urlPatternMatch[1]);
assert(urlPattern.test("https://fanyi-app.baidu.com/transapp/v2/api/launch/config"));
assert(urlPattern.test("https://fanyi-app.baidu.com/transapp/v2/api/launch/config?cache=1"));
assert(!urlPattern.test("http://fanyi-app.baidu.com/transapp/v2/api/launch/config"));
assert(!urlPattern.test("https://fanyi-app.baidu.com/transapp/v2/api/launch/config/extra"));
assert(!urlPattern.test("https://other.baidu.com/transapp/v2/api/launch/config"));

const mitmLine = lines.find((line) => line.startsWith("hostname = "));
assert(mitmLine && /(^|, )fanyi-app\.baidu\.com(,|$)/.test(mitmLine), "fanyi-app.baidu.com missing from MITM");

const jqPath = process.argv[2] || path.resolve(worktree, "..", "smzdm-jq-validation", "jq.exe");
const harPath = process.argv[3];
assert(fs.existsSync(jqPath), `jq executable not found: ${jqPath}`);

function runJq(value) {
  const result = spawnSync(jqPath, ["-c", jqExpression], {
    input: JSON.stringify(value),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `jq failed: ${result.stderr || result.error || "unknown error"}`);
  return JSON.parse(result.stdout);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertUnchanged(value, label) {
  assert.deepStrictEqual(runJq(value), value, `${label} changed unexpectedly`);
}

function applyLoonJsonAction(body) {
  try {
    return JSON.stringify(runJq(JSON.parse(body)));
  } catch (error) {
    if (error instanceof SyntaxError) return body;
    throw error;
  }
}

function applyLoonResponse(status, body) {
  return status === 200 ? applyLoonJsonAction(body) : body;
}

const target = {
  errno: 0,
  data: {
    launchSwitch: 1,
    activitySwitch: 0,
    adSwitch: 0,
    functionSwitch: 0,
    defaultList: {
      configID: "fixture",
      info: {
        atype: 41,
        a_url: "https://fanyiapp.cdn.bcebos.com/app/file/d75otr48p1m14q7crivg.png",
        i_url: "https://fanyiapp.cdn.bcebos.com/app/file/d75otss8p1m14q7crj00.png",
        l_url: "https://fanyiapp.cdn.bcebos.com/app/file/d75otus8p1m14q7crj0g.png",
        jump_url: "https://fanyi-app.baidu.com/static/react-activity/page/appMember.html",
        token: "<fixture-token>",
        customJson: { keep: true },
      },
    },
  },
};
const expected = clone(target);
expected.data.launchSwitch = 0;
for (const key of ["a_url", "i_url", "l_url", "jump_url"]) expected.data.defaultList.info[key] = "";
assert.deepStrictEqual(runJq(target), expected, "target fixture was not minimally rewritten");
assert.equal(applyLoonResponse(500, JSON.stringify(target)), JSON.stringify(target), "non-200 response was modified");
const nonZeroErrno = clone(target);
nonZeroErrno.errno = 1;
assertUnchanged(nonZeroErrno, "non-zero errno");

const launchOff = clone(target);
launchOff.data.launchSwitch = 0;
assertUnchanged(launchOff, "launchSwitch=0");
const wrongType = clone(target);
wrongType.data.defaultList.info.atype = 40;
assertUnchanged(wrongType, "non-target atype");
const wrongImage = clone(target);
wrongImage.data.defaultList.info.i_url = "https://fanyiapp.cdn.bcebos.com/app/file/other.png";
assertUnchanged(wrongImage, "non-target image");
for (const value of [null, [], {}, { data: null }, { data: {} }, { data: { launchSwitch: 1 } }, { data: { defaultList: { info: {} } } }]) {
  assertUnchanged(value, "missing or invalid structure");
}
assert.equal(applyLoonJsonAction(""), "", "empty JSON body was not fail-open");
assert.equal(applyLoonJsonAction("not-json"), "not-json", "invalid JSON was not fail-open");

if (harPath) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const entries = har.log.entries.filter((entry) => {
    try {
      const url = new URL(entry.request.url);
      return entry.response.status === 200 && url.hostname === "fanyi-app.baidu.com" && url.pathname === "/transapp/v2/api/launch/config";
    } catch {
      return false;
    }
  });
  assert.equal(entries.length, 1, "HAR should contain one successful launch-config response");
  const content = entries[0].response.content;
  const body = content.encoding === "base64" ? Buffer.from(content.text, "base64").toString("utf8") : content.text;
  const original = JSON.parse(body);
  assert.equal(entries[0].response.status, 200);
  assert.equal(original.errno, 0);
  const replay = applyLoonResponse(entries[0].response.status, body);
  const harExpected = clone(original);
  harExpected.data.launchSwitch = 0;
  for (const key of ["a_url", "i_url", "l_url", "jump_url"]) harExpected.data.defaultList.info[key] = "";
  assert.deepStrictEqual(JSON.parse(replay), harExpected, "HAR response was not minimally rewritten");
  console.log("Fanyi launch jq replay passed: target launchSwitch disabled and four target strings cleared; other fields preserved");
} else {
  console.log("Fanyi launch jq fixture and boundary tests passed");
}
