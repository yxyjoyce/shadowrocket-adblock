(() => {
  const target = /^https?:\/\/apps\.api\.lianjia\.com\/config\/home\/content(?:\?.*)?$/;
  const done = (body) => $done(body === undefined ? {} : { body });

  if (typeof $request !== "object" || !$request || typeof $request.url !== "string" || !target.test($request.url) ||
      typeof $response !== "object" || !$response || typeof $response.body !== "string") {
    done();
    return;
  }

  let payload;
  try {
    payload = JSON.parse($response.body);
  } catch (_) {
    done();
    return;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    done();
    return;
  }

  let changed = false;
  if (Object.prototype.hasOwnProperty.call(payload.data, "activityBanner")) {
    payload.data.activityBanner = null;
    changed = true;
  }

  const bannerV2 = payload.data.activityBannerV2;
  if (bannerV2 && typeof bannerV2 === "object" && !Array.isArray(bannerV2) &&
      Array.isArray(bannerV2.list)) {
    bannerV2.list = [];
    changed = true;
  }

  if (!changed) {
    done();
    return;
  }

  done(JSON.stringify(payload));
})();
