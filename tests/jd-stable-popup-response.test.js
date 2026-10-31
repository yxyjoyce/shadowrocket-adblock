const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const worktree = path.resolve(__dirname, "..");
const plugin = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8");
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

const imageRuleLines = lines.filter((line) => line.includes("request if ${url} ~= /") && line.includes("m15\\.360buyimg\\.com") && line.includes("reject_img(200)"));
assert.equal(imageRuleLines.length, 5, "expected four exact and one composite JD image reject rules");
const exactImageRuleLines = imageRuleLines.filter((line) => !line.includes("request.header['referer']"));
assert.equal(exactImageRuleLines.length, 4, "expected four exact JD image reject rules");
const imagePatterns = exactImageRuleLines.map((line) => {
  const match = line.match(/^request if \$\{url\} ~= \/(.*)\/ then reject_img\(200\)$/);
  assert(match, "could not extract image URL regex from the plugin rule");
  return new RegExp(match[1]);
});
const compositeLine = imageRuleLines.find((line) => line.includes("request.header['referer']"));
assert(compositeLine, "missing composite home-image rule");
const compositeMatch = compositeLine.match(/^request if \$\{url\} ~= \/(.*)\/ && \$\{request\.header\['referer'\]\} == "([^"]+)" then reject_img\(200\)$/);
assert(compositeMatch, "could not extract composite URL/referer conditions from the plugin rule");
const compositeUrlPattern = new RegExp(compositeMatch[1]);
const compositeReferer = compositeMatch[2];
assert.equal(compositeReferer, "Image_JDAppHome");
const compositeMatches = (url, referer) => compositeUrlPattern.test(url) && referer === compositeReferer;
const expectedImagePaths = new Set([
  "/mobilecms/jfs/t1/535295/1/15284/16310/6ad76d7aF40ccb489/02581b013ea1b837.png.webp",
  "/mobilecms/jfs/t1/542232/20/10106/20235/6ad81abdF82ec8b07/02761b013ebec24e.png.webp",
  "/mobilecms/jfs/t1/562263/29/1650/19727/6ae1d763Fa468ff12/02761b013e4d11bd.png.webp",
  "/mobilecms/jfs/t1/548794/19/11257/17129/6ae1d776F099b7917/02761b013ef71270.png.webp",
]);
for (const pathname of expectedImagePaths) {
  assert(imagePatterns.some((pattern) => pattern.test(`https://m15.360buyimg.com${pathname}`)));
  assert(imagePatterns.some((pattern) => pattern.test(`https://m15.360buyimg.com${pathname}?cache=1`)));
}
assert(!imagePatterns.some((pattern) => pattern.test("https://m15.360buyimg.com/mobilecms/jfs/t1/535295/1/15284/16310/6ad76d7aF40ccb489/02581b013ea1b837.png")));
assert(!imagePatterns.some((pattern) => pattern.test("https://m15.360buyimg.com/mobilecms/jfs/t1/535295/1/15284/16310/6ad76d7aF40ccb489/02581b013ea1b837.png.webp/extra")));
assert(!imagePatterns.some((pattern) => pattern.test("http://m15.360buyimg.com/mobilecms/jfs/t1/535295/1/15284/16310/6ad76d7aF40ccb489/02581b013ea1b837.png.webp")));
assert(!imagePatterns.some((pattern) => pattern.test("https://img30.360buyimg.com/mobilecms/jfs/t1/535295/1/15284/16310/6ad76d7aF40ccb489/02581b013ea1b837.png.webp")));
for (const basename of ["02761b013e4d11bd", "00ae1b013e25e56f", "abcd1b0131234567"]) {
  const url = `https://m15.360buyimg.com/mobilecms/jfs/t1/example/${basename}.png.webp?cache=1`;
  assert(compositeUrlPattern.test(url));
  assert(compositeMatches(url, "Image_JDAppHome"));
  assert(!compositeMatches(url, "OtherReferer"));
  assert(!compositeUrlPattern.test(url.replace("m15.360buyimg.com", "img30.360buyimg.com")));
  assert(!compositeUrlPattern.test(url.replace(".png.webp", ".png")));
}
assert(!compositeUrlPattern.test("https://m15.360buyimg.com/mobilecms/jfs/t1/example/otherprefixabc.png.webp"));
assert(!compositeUrlPattern.test("https://m15.360buyimg.com/mobilecms/jfs/t1/example/abcd1b0141234567.png.webp"));
assert(!compositeUrlPattern.test("https://m15.360buyimg.com/mobilecms/jfs/t1/example/abcd1b013123456.png.webp"));
assert(!compositeUrlPattern.test("https://m15.360buyimg.com/mobilecms/jfs/t1/example/abcd1b01312345678.png.webp"));

const mitmLine = lines.find((line) => line.startsWith("hostname = "));
assert(mitmLine, "MITM hostname line missing");
const mitmHosts = mitmLine.slice("hostname = ".length).split(",").map((host) => host.trim());
assert.equal(mitmHosts.filter((host) => host === "api.m.jd.com").length, 1, "api.m.jd.com MITM must remain exactly once");
assert.equal(mitmHosts.filter((host) => host === "m15.360buyimg.com").length, 1, "m15.360buyimg.com MITM must be added exactly once");

const harPaths = process.argv.slice(2);
if (harPaths.length) {
  let apiTargetCount = 0;
  let apiOtherCount = 0;
  const seenImagePaths = new Set();
  const imageStatuses = new Map([...expectedImagePaths].map((pathname) => [pathname, new Set()]));
  for (const harPath of harPaths) {
    const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
    const harName = path.basename(harPath);
    let compositeSuccessCount = 0;
    let nonHomeTargetCount = 0;
    let normalHomeCount = 0;
    let exactSuccessCount = 0;
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
      if (url.hostname === "m15.360buyimg.com") {
        const referer = (entry.request.headers || []).find((header) => String(header.name).toLowerCase() === "referer")?.value;
        const prefixMatch = compositeUrlPattern.test(url.href);
        const homeCompositeMatch = compositeMatches(url.href, referer);
        if (prefixMatch && referer === compositeReferer) {
          assert(homeCompositeMatch, "home target did not satisfy the extracted composite rule");
          if (entry.response.status === 200) compositeSuccessCount += 1;
        } else if (prefixMatch) {
          nonHomeTargetCount += 1;
          assert(!homeCompositeMatch, "non-home target matched the composite rule");
        } else if (referer === compositeReferer) {
          normalHomeCount += 1;
          assert(!homeCompositeMatch, "normal same-referer icon matched the composite rule");
        }
        if (expectedImagePaths.has(url.pathname)) {
          assert(imagePatterns.some((pattern) => pattern.test(url.href)), "HAR image URL did not match an extracted plugin regex");
          seenImagePaths.add(url.pathname);
          imageStatuses.get(url.pathname).add(entry.response.status);
          if (entry.response.status === 200) exactSuccessCount += 1;
        } else {
          assert(!imagePatterns.some((pattern) => pattern.test(url.href)), "similar normal m15 image matched unexpectedly");
        }
      }
    }
    if (harName.includes("59_")) assert.equal(exactSuccessCount, 1, "HAR59 exact-material fallback count changed");
    if (harName.includes("60_")) assert.equal(compositeSuccessCount, 3, "HAR60 home composite success count changed");
    if (harName.includes("61_")) {
      assert.equal(compositeSuccessCount, 2, "HAR61 home composite success count changed");
      assert.equal(nonHomeTargetCount, 4, "HAR61 non-home target count changed");
      assert.equal(normalHomeCount, 8, "HAR61 normal same-referer icon count changed");
    }
  }
  if (apiTargetCount > 0) {
    assert.equal(apiTargetCount, 2, "HAR set should contain two queryPagePopWindow requests");
    assert(apiOtherCount > 0, "HAR set should provide non-target client.action functionIds");
  }
  if (seenImagePaths.size > 0) {
    for (const pathname of seenImagePaths) assert(expectedImagePaths.has(pathname), "HAR exact image path was not one of the four plugin targets");
    for (const pathname of seenImagePaths) assert(imageStatuses.get(pathname).has(200), `HAR material has no successful response: ${pathname}`);
  }
  assert(apiTargetCount > 0 || seenImagePaths.size > 0, "HAR set contained neither interface nor image evidence");
  console.log(`JD queryPagePopWindow and home-image composite tests passed: ${apiTargetCount} interface targets, ${seenImagePaths.size} exact fallback paths; ${apiOtherCount} other functionIds excluded`);
} else {
  console.log("JD queryPagePopWindow request reject fixture and boundary tests passed");
}
