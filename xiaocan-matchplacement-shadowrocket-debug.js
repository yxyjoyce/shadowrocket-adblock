(function () {
  var response = (typeof $response === "object" && $response) ? $response : {};
  var originalBody = typeof response.body === "string" ? response.body : "";

  function log(message) {
    try {
      if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log(message);
      }
    } catch (ignore) {}
  }

  function finish() {
    // This is an observation-only module: never write a transformed body.
    $done({ body: originalBody });
  }

  function safePath(url) {
    var value = String(url || "");
    var match = value.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+([^?#]*)/i);
    return match && match[1] ? match[1] : "/";
  }

  function headerValue(headers, name) {
    var keys = Object.keys(headers || {});
    for (var i = 0; i < keys.length; i += 1) {
      if (String(keys[i]).toLowerCase() === name) {
        return String(headers[keys[i]] == null ? "" : headers[keys[i]]);
      }
    }
    return "";
  }

  function visible(value) {
    return String(value == null ? "" : value).replace(/[\r\n\t]/g, " ").slice(0, 160);
  }

  try {
    var request = (typeof $request === "object" && $request) ? $request : {};
    var headers = request.headers && typeof request.headers === "object" ? request.headers : null;
    var path = safePath(request.url);
    var headerKeys = headers ? Object.keys(headers).map(function (key) { return String(key); }).sort() : [];
    var methodname = headers ? headerValue(headers, "methodname") : "";
    var servername = headers ? headerValue(headers, "servername") : "";

    log("[Xiaocan-Debug] pattern-hit=true");
    log("[Xiaocan-Debug] script-invoked=true");
    log("[Xiaocan-Debug] path=" + path);
    log("[Xiaocan-Debug] header-keys=" + headerKeys.join(","));
    log("[Xiaocan-Debug] methodname=" + visible(methodname));
    log("[Xiaocan-Debug] servername=" + visible(servername));
    log("[Xiaocan-Debug] body-readable-length=" + String(originalBody.length));

    if (!headers || headerKeys.length === 0) {
      log("[Xiaocan-Debug] correlation=unavailable, original");
    } else if (path === "/rpc") {
      log("[Xiaocan-Debug] correlation=requires-real-device-adaptation; same-/rpc-header-correlation-not-claimed-reliable");
    }

    if (methodname !== "AdMobileService.MatchPlacement") {
      log("[Xiaocan-Debug] would-modify=false");
      finish();
      return;
    }

    var parsed = JSON.parse(originalBody);
    var schemaOk = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && parsed.status && parsed.status.code === 0
      && parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
      && parsed.data.ad_open === 1;
    if (!schemaOk) {
      log("[Xiaocan-Debug] schema=not-match");
      log("[Xiaocan-Debug] would-modify=false");
      finish();
      return;
    }

    var fieldNames = [
      "ad_open", "ad_type", "ad_source", "android_ad_id",
      "android_slot_id", "ios_ad_id", "ios_slot_id", "ad_photo"
    ].filter(function (name) {
      return Object.prototype.hasOwnProperty.call(parsed.data, name);
    });
    log("[Xiaocan-Debug] schema=MatchPlacement");
    log("[Xiaocan-Debug] would-modify=true");
    log("[Xiaocan-Debug] exact-field-names=" + fieldNames.join(","));
  } catch (error) {
    log("[Xiaocan-Debug] observation-error=true; original");
  }

  finish();
}());
