(function () {
  var done = typeof $done === "function" ? $done : function () {};
  var response = typeof $response === "object" && $response ? $response : {};
  var source = typeof response.body === "string" ? response.body : "";
  var payload;
  var encoded = false;

  if (!source) {
    done({});
    return;
  }

  try {
    payload = JSON.parse(source);
  } catch (_) {
    try {
      payload = JSON.parse(decodeURIComponent(source));
      encoded = true;
    } catch (__){
      done({});
      return;
    }
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !payload.MarketingPage || typeof payload.MarketingPage !== "object" ||
      Array.isArray(payload.MarketingPage)) {
    done({});
    return;
  }

  payload.MarketingPage.Enable = false;
  payload.MarketingPage.ImageInfo = [];
  done({ body: encoded ? encodeURIComponent(JSON.stringify(payload)) : JSON.stringify(payload) });
})();
