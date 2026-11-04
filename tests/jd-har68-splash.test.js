const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const worktree = path.resolve(__dirname, "..");
const targetUrl = "https://m.360buyimg.com/mobilecms/s1125x2436_jfs/t1/555828/25/8020/120295/6ae7eba6Fd0ac3a8b/0258465984150614.jpg.avif";
const targetUrlWithQuery = `${targetUrl}?cache=1`;
const wrongPath = targetUrl.replace("0258465984150614.jpg.avif", "other.jpg.avif");
const wrongHost = targetUrl.replace("m.360buyimg.com", "m15.360buyimg.com");
const exactPath = "m\\.360buyimg\\.com\\/mobilecms\\/s1125x2436_jfs\\/t1\\/555828\\/25\\/8020\\/120295\\/6ae7eba6Fd0ac3a8b\\/0258465984150614\\.jpg\\.avif";

const loon = fs.readFileSync(path.join(worktree, "loon-adblock.plugin"), "utf8");
const shadowrocket = fs.readFileSync(path.join(worktree, "shadowrocket-adblock.sgmodule"), "utf8");
const qx = fs.readFileSync(path.join(worktree, "quantumultx-ad-precise-rewrite.conf"), "utf8");
const qxSupplement = fs.readFileSync(path.join(worktree, "quantumultx-ad-precise-supplement.conf"), "utf8");

const loonLine = loon.split(/\r?\n/).find((line) => line.includes("s1125x2436_jfs"));
assert(loonLine, "Loon HAR68 rule missing");
assert(loonLine.includes('${request.header[\'referer\']} == "download_Image_JDAppHome"'), "Loon HAR68 rule must retain the observed Referer guard");
assert(loonLine.includes("reject_img(200)"), "Loon HAR68 rule must return an image reject response");
const loonUrlMatch = loonLine.match(/~= \/(.*)\/ &&/);
assert(loonUrlMatch, "Loon HAR68 URL regex missing");
const loonPattern = new RegExp(loonUrlMatch[1]);
assert(loonPattern.test(targetUrl) && loonPattern.test(targetUrlWithQuery), "Loon HAR68 target URL must match");
assert(loonPattern.test(wrongPath), "Loon URL prefix intentionally covers future HAR68 AVIF rotations");
assert(!loonPattern.test(wrongHost), "Loon HAR68 URL pattern must stay on m.360buyimg.com");

function assertExactUrlRule(text, action, label) {
  const line = text.split(/\r?\n/).find((candidate) => candidate.includes("s1125x2436_jfs") && candidate.includes(action));
  assert(line, `${label} HAR68 rule missing`);
  assert(line.includes("555828") && line.includes("0258465984150614"), `${label} HAR68 rule must use the observed full path`);
  const patternText = line.split(action)[0].trim();
  const pattern = new RegExp(patternText);
  assert(pattern.test(targetUrl) && pattern.test(targetUrlWithQuery), `${label} target URL must match`);
  assert(!pattern.test(wrongPath) && !pattern.test(wrongHost), `${label} rule must exclude nearby assets and m15 host`);
}

assertExactUrlRule(shadowrocket, "- reject-img", "Shadowrocket");
assertExactUrlRule(qx, "url reject-img", "Quantumult X");
assertExactUrlRule(qxSupplement, "url reject-img", "Quantumult X supplement");

for (const [label, text] of [["Loon", loon], ["Shadowrocket", shadowrocket], ["Quantumult X", qx], ["Quantumult X supplement", qxSupplement]]) {
  assert(text.includes("m.360buyimg.com"), `${label} m.360buyimg.com hostname missing`);
  assert(!text.includes("m.360buyimg.com,REJECT"), `${label} must not reject the whole m.360buyimg.com host`);
}

console.log("JD HAR68 splash positive/negative path and host-boundary tests passed");
