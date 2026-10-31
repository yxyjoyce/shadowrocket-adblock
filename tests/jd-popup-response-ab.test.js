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

const domainRuleLines = lines.filter((line) => line === "DOMAIN,m15.360buyimg.com,REJECT");
assert.equal(domainRuleLines.length, 1, "expected one exact m15 domain reject rule");
assert(!lines.some((line) => line.includes("reject_img(200)")), "image rewrite rules should be removed after whole-domain reject");
const blockedDomain = domainRuleLines[0].split(",")[1];
const domainMatches = (hostname) => hostname.toLowerCase() === blockedDomain.toLowerCase();
assert(domainMatches("m15.360buyimg.com"));
assert(domainMatches("M15.360BUYIMG.COM"));
assert(!domainMatches("img.m15.360buyimg.com"));
assert(!domainMatches("m15.360buyimg.com.cdn.example"));
assert(!domainMatches("360buyimg.com"));

const mitmLine = lines.find((line) => line.startsWith("hostname = "));
assert.equal(mitmLine, "hostname = api.m.jd.com", "m15 should be removed from MITM after whole-domain reject");

const harPaths = process.argv.slice(2);
if (harPaths.length) {
  let apiTargetCount = 0;
  let apiOtherCount = 0;
  for (const harPath of harPaths) {
    const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
    for (const entry of har.log.entries) {
      let url;
      try {
        url = new URL(entry.request.url);
      } catch {
        continue;
      }
      if (url.hostname === "api.m.jd.com" && url.pathname === "/client.action") {
        const functionId = url.searchParams.get("functionId");
        if (functionId === "queryPagePopWindow") {
          apiTargetCount += 1;
          assert.equal(entry.response.status, 200, "HAR target response status changed");
          assert(urlPattern.test(url.href), "HAR target URL did not match the extracted plugin regex");
          assert.equal(url.searchParams.get("functionId"), "queryPagePopWindow");
        } else if (functionId) {
          apiOtherCount += 1;
          assert(!urlPattern.test(url.href), "non-target functionId matched unexpectedly");
        }
      }
    }
  }
  assert.equal(apiTargetCount, 2, "HAR set should contain two queryPagePopWindow requests");
  assert(apiOtherCount > 0, "HAR set should provide non-target client.action functionIds");
  console.log(`JD queryPagePopWindow request reject test passed: ${apiTargetCount} HAR targets matched; ${apiOtherCount} other functionIds excluded`);
} else {
  console.log("JD queryPagePopWindow request reject fixture and boundary tests passed");
}
