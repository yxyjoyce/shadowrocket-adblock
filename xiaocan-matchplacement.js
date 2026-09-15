/**
 * Quantumult X response-body script for Xiaocan MatchPlacement.
 * Only the exact RPC method is changed; every failure path is fail-open.
 */
(function () {
  var response = (typeof $response === "object" && $response) ? $response : {};
  var originalBody = (typeof response.body === "string") ? response.body : "";

  function passThrough() {
    $done(originalBody);
  }

  try {
    var request = (typeof $request === "object" && $request) ? $request : {};
    var headers = (request.headers && typeof request.headers === "object") ? request.headers : {};
    var methodMatches = false;
    Object.keys(headers).forEach(function (key) {
      if (String(key).toLowerCase() === "methodname" &&
          String(headers[key] == null ? "" : headers[key]).trim() === "AdMobileService.MatchPlacement") {
        methodMatches = true;
      }
    });

    if (!methodMatches || !originalBody) {
      passThrough();
      return;
    }

    var payload = JSON.parse(originalBody);
    if (!payload || typeof payload !== "object" ||
        !payload.data || typeof payload.data !== "object" ||
        payload.data.ad_open !== 1) {
      passThrough();
      return;
    }

    var data = payload.data;
    data.ad_open = 0;
    if (Object.prototype.hasOwnProperty.call(data, "ad_type")) data.ad_type = [];
    if (Object.prototype.hasOwnProperty.call(data, "ad_source")) data.ad_source = [];

    ["android_ad_id", "android_slot_id", "ios_ad_id", "ios_slot_id", "ad_photo"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = "";
    });

    $done(JSON.stringify(payload));
  } catch (error) {
    passThrough();
  }
})();
