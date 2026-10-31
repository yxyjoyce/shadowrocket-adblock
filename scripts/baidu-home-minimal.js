// Baidu mobile home: hide only the observed feed and account promotion bubble.
(function () {
  var done = typeof $done === "function" ? $done : function () {};
  var request = typeof $request === "object" && $request ? $request : {};
  var response = typeof $response === "object" && $response ? $response : {};
  var url = String(request.url || "");
  var body = response.body;
  var urlPattern = /^https:\/\/www\.baidu\.com\/$/;
  var anchors = [
    'id="header"',
    'id="userinfo-wrap"',
    "menu-area",
    "square-enterance",
    'id="wiseindex-bdlogo"',
    'id="index-form"',
    'id="wise-index-feed"',
  ];

  if (response.status !== 200 || !urlPattern.test(url) || typeof body !== "string" || body.length === 0) {
    done({});
    return;
  }
  for (var i = 0; i < anchors.length; i += 1) {
    if (body.indexOf(anchors[i]) === -1) {
      done({});
      return;
    }
  }
  if (body.indexOf('id="loon-baidu-home-minimal"') !== -1) {
    done({});
    return;
  }

  var head = body.match(/<head\b[^>]*>/i);
  if (!head) {
    done({});
    return;
  }
  var style = '<style id="loon-baidu-home-minimal">#wise-index-feed{display:none!important}#userinfo-wrap .has-background-userinfo-bubble{display:none!important}</style>';
  var insertAt = head.index + head[0].length;
  done({ body: body.slice(0, insertAt) + style + body.slice(insertAt) });
})();
