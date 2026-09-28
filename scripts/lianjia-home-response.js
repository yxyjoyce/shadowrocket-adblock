(() => {
  const homeTarget = /^https?:\/\/apps\.api\.lianjia\.com\/config\/home\/content(?:\?.*)?$/;
  const activityTarget = /^https:\/\/apps\.api\.lianjia\.com\/config\/config\/getactivityconfig(?:\?.*)?$/;
  const done = (body) => $done(body === undefined ? {} : { body });

  if (typeof $request !== "object" || !$request || typeof $request.url !== "string" ||
      (!homeTarget.test($request.url) && !activityTarget.test($request.url)) ||
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

  if (activityTarget.test($request.url)) {
    if (Object.keys(payload.data).length === 0) {
      done();
      return;
    }

    payload.data = {};
    done(JSON.stringify(payload));
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
