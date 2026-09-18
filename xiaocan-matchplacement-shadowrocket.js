(function () {
  var originalBody = $response && typeof $response.body === "string" ? $response.body : "";

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
        return String(headers[keys[i]] == null ? "" : headers[keys[i]]).trim();
      }
    }
    return "";
  }

  function clearMatchPlacementFields(data) {
    var clearFields = [
      "ad_type",
      "ad_source",
      "android_ad_id",
      "android_slot_id",
      "ios_ad_id",
      "ios_slot_id",
      "ad_photo"
    ];

    for (var i = 0; i < clearFields.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(data, clearFields[i])) {
        data[clearFields[i]] = i < 2 ? [] : "";
      }
    }
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

  var legacyBody = replaceLegacyVipPopUp(originalBody);

  try {
    var headers = $request && $request.headers && typeof $request.headers === "object"
      ? $request.headers
      : {};
    var methodname = getHeader(headers, "methodname");
    var servername = getHeader(headers, "servername");
    var body = legacyBody;
    var payload;
    var changed = false;

    try {
      payload = JSON.parse(legacyBody);
    } catch (parseError) {
      finish(legacyBody);
      return;
    }

    if (payload && typeof payload === "object" && !Array.isArray(payload)
      && servername === "Placement"
      && methodname === "PlacementMatchService.BatchMatchPlacement") {
      changed = clearBatchPlacementResources(payload);
    } else if (payload && typeof payload === "object" && !Array.isArray(payload)
      && servername === "SilkwormShareSupport"
      && methodname === "SilkwormShareSupportService.CheckActivityEligibility") {
      changed = clearRedPacketGuide(payload);
    } else if (payload && typeof payload === "object" && !Array.isArray(payload)
      && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      && payload.data.ad_open === 1) {
      payload.data.ad_open = 0;
      changed = true;
      if (methodname === "AdMobileService.MatchPlacement") {
        clearMatchPlacementFields(payload.data);
      }
    }

    if (changed) {
      body = JSON.stringify(payload);
    }
    finish(body);
  } catch (error) {
    finish(legacyBody);
  }
}());
