(function () {
  var request = (typeof $request === "object" && $request) ? $request : {};
  var url = String(request.url || "");
  var startupPattern = /^https?:\/\/wechat\.goddessxzns\.com\/api\/v20\/startup_page(?:\?.*)?$/;
  var astroPattern = /^https?:\/\/wechat\.goddessxzns\.com\/api\/v14\/astro\/update(?:\?.*)?$/;

  if (!startupPattern.test(url) && !astroPattern.test(url)) {
    $done({});
    return;
  }

  try {
    var payload = JSON.parse($response.body);
    if (startupPattern.test(url)) {
      payload.data = null;
    } else {
      payload.data.ad_info.start_page_ad_id = "";
      payload.data.ad_info.ad_shake = false;
    }
    $done({body: JSON.stringify(payload)});
  } catch (error) {
    $done({});
  }
})();
