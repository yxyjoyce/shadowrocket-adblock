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

  function getHeader(headers, name) {
    var value = "";
    Object.keys(headers).forEach(function (key) {
      if (String(key).toLowerCase() === name) {
        value = String(headers[key] == null ? "" : headers[key]).trim();
      }
    });
    return value;
  }

  function isSensitiveHeader(key) {
    return /(?:authorization|cookie|token|secret|password|credential|session)/i.test(String(key));
  }

  function observeBatch(body) {
    console.log("[Xiaocan] matched BatchMatchPlacement (observe only)");
    console.log("[Xiaocan] BatchMatchPlacement body.length=" + String(body.length));
    console.log("[Xiaocan] BatchMatchPlacement body[0:1000]=" + body.slice(0, 1000));
    try {
      var payload = JSON.parse(body);
      console.log("[Xiaocan] BatchMatchPlacement top-level keys=" + JSON.stringify(Object.keys(payload || {})));
      var data = payload && payload.data;
      console.log("[Xiaocan] BatchMatchPlacement data keys=" + JSON.stringify(
        data && typeof data === "object" ? Object.keys(data) : []));
      var slugs = [];
      function visit(value) {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        Object.keys(value).forEach(function (key) {
          var child = value[key];
          if (key === "resources" && Array.isArray(child)) {
            child.forEach(function (resource) {
              if (resource && typeof resource === "object" && resource.resource_slug != null) {
                slugs.push(String(resource.resource_slug));
              }
            });
          }
          visit(child);
        });
      }
      visit(data);
      console.log("[Xiaocan] BatchMatchPlacement resource_slug=" +
        (slugs.length ? slugs.join(",") : "(none)"));
    } catch (error) {
      console.log("[Xiaocan] BatchMatchPlacement JSON parse failed");
    }
  }

  try {
    var request = (typeof $request === "object" && $request) ? $request : {};
    var headers = (request.headers && typeof request.headers === "object") ? request.headers : {};
    var safeHeaders = {};
    Object.keys(headers).forEach(function (key) {
      safeHeaders[key] = isSensitiveHeader(key) ? "[REDACTED]" : headers[key];
    });

    console.log("[Xiaocan] script invoked");
    console.log("[Xiaocan] url=" + String(request.url || ""));
    console.log("[Xiaocan] request header keys=" + JSON.stringify(Object.keys(headers)));
    console.log("[Xiaocan] request headers=" + JSON.stringify(safeHeaders));

    var methodname = getHeader(headers, "methodname");
    var servername = getHeader(headers, "servername");
    console.log("[Xiaocan] methodname=" + methodname);
    console.log("[Xiaocan] servername=" + servername);

    if (methodname === "PlacementMatchService.BatchMatchPlacement") {
      observeBatch(originalBody);
      passThrough();
      return;
    }

    if (methodname !== "AdMobileService.MatchPlacement" || !originalBody) {
      passThrough();
      return;
    }

    var payload = JSON.parse(originalBody);
    if (!payload || typeof payload !== "object" || !payload.data ||
        typeof payload.data !== "object") {
      passThrough();
      return;
    }

    var data = payload.data;
    console.log("[Xiaocan] matched MatchPlacement");
    console.log("[Xiaocan] original ad_open=" + String(data.ad_open));
    if (data.ad_open !== 1) {
      passThrough();
      return;
    }

    data.ad_open = 0;
    if (Object.prototype.hasOwnProperty.call(data, "ad_type")) data.ad_type = [];
    if (Object.prototype.hasOwnProperty.call(data, "ad_source")) data.ad_source = [];

    ["android_ad_id", "android_slot_id", "ios_ad_id", "ios_slot_id", "ad_photo"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = "";
    });

    console.log("[Xiaocan] modified ad_open=0");
    $done(JSON.stringify(payload));
  } catch (error) {
    passThrough();
  }
})();
