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

  function clearBatchPlacementResources(payload) {
    var resources = payload && payload.resources;
    if (!Array.isArray(resources)) return false;
    var changed = false;
    resources.forEach(function (resource) {
      if (!resource || typeof resource !== "object") return;
      if (resource.resource_slug === "OPS_POPUP" ||
          resource.resource_slug === "SHARER_HOME_POPUP") {
        if (!Array.isArray(resource.value) || resource.value.length !== 0) {
          resource.value = [];
          changed = true;
        }
      }
    });
    return changed;
  }

  function clearRedPacketGuide(payload) {
    if (!payload || typeof payload !== "object" ||
        !Object.prototype.hasOwnProperty.call(payload, "show_red_packet_guide")) {
      return false;
    }
    if (payload.show_red_packet_guide === false) return false;
    payload.show_red_packet_guide = false;
    return true;
  }

  try {
    var request = (typeof $request === "object" && $request) ? $request : {};
    var headers = (request.headers && typeof request.headers === "object") ? request.headers : {};
    var methodname = getHeader(headers, "methodname");
    var servername = getHeader(headers, "servername");

    if (servername === "Placement" &&
        methodname === "PlacementMatchService.BatchMatchPlacement") {
      if (!originalBody) {
        passThrough();
        return;
      }
      var placementPayload = JSON.parse(originalBody);
      $done(clearBatchPlacementResources(placementPayload)
        ? JSON.stringify(placementPayload)
        : originalBody);
      return;
    }

    if (servername === "SilkwormShareSupport" &&
        methodname === "SilkwormShareSupportService.CheckActivityEligibility") {
      if (!originalBody) {
        passThrough();
        return;
      }
      var eligibilityPayload = JSON.parse(originalBody);
      $done(clearRedPacketGuide(eligibilityPayload)
        ? JSON.stringify(eligibilityPayload)
        : originalBody);
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

    $done(JSON.stringify(payload));
  } catch (error) {
    passThrough();
  }
})();
