// 书旗小说 getAdInfo：仅关闭自有开屏广告开关，失败时保持原响应。
(function () {
  var done = typeof $done === "function" ? $done : function () {};
  var response = typeof $response === "object" && $response ? $response : {};
  var source = typeof response.body === "string" ? response.body : "";

  if (!source) {
    done({});
    return;
  }

  try {
    var payload = JSON.parse(source);
    if (payload && payload.data && payload.data.extInfo &&
        Object.prototype.hasOwnProperty.call(payload.data.extInfo, "isShowAd")) {
      payload.data.extInfo.isShowAd = 0;
      done({ body: JSON.stringify(payload) });
      return;
    }
  } catch (_) {
    // Fail open: preserve the original response when the payload is not JSON.
  }

  done({});
})();
