(() => {
  const activityTarget = /^https:\/\/apps\.api\.lianjia\.com\/config\/config\/getactivityconfig(?:\?.*)?$/;
  const done = (body) => $done(body === undefined ? {} : { body });

  if (typeof $request !== "object" || !$request || typeof $request.url !== "string" ||
      !activityTarget.test($request.url) ||
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
})();
