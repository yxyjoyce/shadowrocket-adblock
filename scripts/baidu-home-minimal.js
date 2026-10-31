// Baidu mobile home: hide only the observed feed and account promotion bubble.
(function () {
  var done = typeof $done === "function" ? $done : function () {};
  var request = typeof $request === "object" && $request ? $request : {};
  var response = typeof $response === "object" && $response ? $response : {};
  var url = String(request.url || "");
  var body = response.body;
  var coreAnchors = [
    /id\s*=\s*["']wiseindex-bdlogo["']/i,
    /id\s*=\s*["']index-form["']/i,
  ];
  function logEvent(event) {
    if (typeof console !== "undefined" && console && typeof console.log === "function") console.log("baidu_home_minimal:" + event);
  }
  function finish(value, event) {
    logEvent(event);
    done(value);
  }
  function allowedUrl(value) {
    var match = value.match(/^https:\/\/(?:www|m)\.baidu\.com\/(?:\?([^#]*))?$/);
    if (!match) return false;
    var query = match[1] || "";
    if (!query) return true;
    var parts = query.split("&");
    for (var i = 0; i < parts.length; i += 1) {
      var key = parts[i].split("=")[0];
      if (key === "wd" || key === "word" || key === "query" || key === "q") return false;
    }
    return true;
  }

  if (response.status !== 200 || !allowedUrl(url)) {
    finish({}, "skip_status_or_url");
    return;
  }
  if (typeof body !== "string" || body.length === 0) {
    finish({}, "skip_empty");
    return;
  }
  for (var i = 0; i < coreAnchors.length; i += 1) {
    if (!coreAnchors[i].test(body)) {
      finish({}, "skip_core_anchors");
      return;
    }
  }
  if (/id\s*=\s*["']loon-baidu-home-minimal["']/i.test(body)) {
    finish({}, "skip_already_injected");
    return;
  }

  var head = body.match(/<head\b[^>]*>/i);
  if (!head) {
    finish({}, "skip_no_head");
    return;
  }
  var style = '<style id="loon-baidu-home-minimal">#wise-index-feed{display:none!important}#userinfo-wrap .has-background-userinfo-bubble{display:none!important}#header{min-height:100vh}#header #logo{margin-top:max(0px,min(40vh,calc((100vh - 148px)/2 - 61px)))}@supports (height:100svh){#header{min-height:100svh}#header #logo{margin-top:max(0px,min(40svh,calc((100svh - 148px)/2 - 61px)))}}</style>';
  var insertAt = head.index + head[0].length;
  finish({ body: body.slice(0, insertAt) + style + body.slice(insertAt) }, /id\s*=\s*["']wise-index-feed["']/i.test(body) ? "injected_feed_present" : "injected_feed_missing");
})();
