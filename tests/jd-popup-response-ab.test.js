const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const worktree = path.resolve(__dirname, "..");
const plugin = fs.readFileSync(path.join(worktree, "diagnostics", "jd-popup-response-ab-test.plugin"), "utf8");
const lines = plugin.split(/\r?\n/);
const ruleLines = lines.filter((line) => line.includes("request if ${url} ~= /") && line.includes("queryPagePopWindow") && line.includes("reject_dict(200)"));
assert.equal(ruleLines.length, 1, "expected one JD queryPagePopWindow request reject rule");
const ruleLine = ruleLines[0];
const urlPatternMatch = ruleLine.match(/^request if \$\{url\} ~= \/(.*)\/ then reject_dict\(200\)$/);
assert(urlPatternMatch, "could not extract URL regex from the plugin rule");
const urlPattern = new RegExp(urlPatternMatch[1]);
assert(urlPattern.test("https://api.m.jd.com/client.action?functionId=queryPagePopWindow"));
assert(urlPattern.test("https://api.m.jd.com/client.action?foo=1&functionId=queryPagePopWindow&bar=2"));
assert(!urlPattern.test("http://api.m.jd.com/client.action?functionId=queryPagePopWindow"));
assert(!urlPattern.test("https://api.m.jd.com/client.action?functionId=queryPagePopWindowExtra"));
assert(!urlPattern.test("https://api.m.jd.com/client.action?foo=functionId=queryPagePopWindow"));
assert(!urlPattern.test("https://api.m.jd.com/other.action?functionId=queryPagePopWindow"));
assert(!urlPattern.test("https://other.m.jd.com/client.action?functionId=queryPagePopWindow"));
assert(!urlPattern.test("https://img30.360buyimg.com/client.action?functionId=queryPagePopWindow"));

const mitmLine = lines.find((line) => line.startsWith("hostname = "));
assert.equal(mitmLine, "hostname = api.m.jd.com", "diagnostic MITM scope must be api.m.jd.com only");

if (process.argv[2]) {
  const harPath = process.argv[2];
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const targetEntries = [];
  const otherClientEntries = [];
  for (const entry of har.log.entries) {
    try {
      const url = new URL(entry.request.url);
      if (url.hostname !== "api.m.jd.com" || url.pathname !== "/client.action") continue;
      const functionId = url.searchParams.get("functionId");
      if (functionId === "queryPagePopWindow") targetEntries.push({ entry, url });
      else if (functionId) otherClientEntries.push({ entry, url, functionId });
    } catch {
      // Ignore malformed HAR URLs; they are not valid request candidates.
    }
  }
  assert.equal(targetEntries.length, 2, "HAR should contain two queryPagePopWindow requests");
  for (const { entry, url } of targetEntries) {
    assert.equal(entry.response.status, 200, "HAR target response status changed");
    assert(urlPattern.test(url.href), "HAR target URL did not match the extracted plugin regex");
    assert.equal(url.pathname, "/client.action");
    assert.equal(url.searchParams.get("functionId"), "queryPagePopWindow");
  }
  assert(otherClientEntries.length > 0, "HAR should provide non-target client.action functionIds");
  for (const { url } of otherClientEntries) assert(!urlPattern.test(url.href), "non-target functionId matched unexpectedly");
  console.log(`JD queryPagePopWindow request reject test passed: ${targetEntries.length} HAR targets matched; ${otherClientEntries.length} other functionIds excluded`);
} else {
  console.log("JD queryPagePopWindow request reject fixture and boundary tests passed");
}
