(function () {
  var originalBody = $response && typeof $response.body === "string" ? $response.body : "";

  function log(message) {
    try {
      if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log(message);
      }
    } catch (ignore) {}
  }

  function finish(body) {
    $done({ body: body });
  }

  function replaceLegacyVipPopUp(body) {
    return body.replace(/"vip_pop_up":0/g, '"vip_pop_up":2');
  }

  function getHeader(headers, name) {
    var keys = Object.keys(headers);
    for (var i = 0; i < keys.length; i += 1) {
      if (keys[i].toLowerCase() === name) {
        return String(headers[keys[i]] || "");
      }
    }
    return "";
  }

  try {
    log("[Xiaocan] script invoked");
    var requestUrl = String($request && $request.url || "");
    log("[Xiaocan] url=" + requestUrl.replace(/[?#].*$/, ""));
    var headers = $request && $request.headers && typeof $request.headers === "object"
      ? $request.headers
      : {};
    var methodname = getHeader(headers, "methodname");
    var servername = getHeader(headers, "servername");

    log("[Xiaocan] methodname=" + methodname);
    log("[Xiaocan] servername=" + servername);

    if (methodname !== "AdMobileService.MatchPlacement") {
      finish(replaceLegacyVipPopUp(originalBody));
      return;
    }

    var obj = JSON.parse(originalBody);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)
      || !obj.status || obj.status.code !== 0
      || !obj.data || typeof obj.data !== "object" || Array.isArray(obj.data)
      || obj.data.ad_open !== 1) {
      finish(originalBody);
      return;
    }

    log("[Xiaocan] matched MatchPlacement");
    log("[Xiaocan] original ad_open=" + obj.data.ad_open);
    obj.data.ad_open = 0;
    var clearFields = [
      "ad_type",
      "ad_source",
      "android_ad_id",
      "android_slot_id",
      "ios_ad_id",
      "ios_slot_id",
      "ad_photo"
    ];

    for (var j = 0; j < clearFields.length; j += 1) {
      if (Object.prototype.hasOwnProperty.call(obj.data, clearFields[j])) {
        obj.data[clearFields[j]] = j < 2 ? [] : "";
      }
    }

    log("[Xiaocan] modified ad_open=0");
    finish(JSON.stringify(obj));
  } catch (error) {
    finish(originalBody);
  }
}());
