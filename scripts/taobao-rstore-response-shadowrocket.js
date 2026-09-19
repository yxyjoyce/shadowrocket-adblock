/*
 * Taobao response adapter from R-Store.
 * Keeps the response object intact while disabling the confirmed
 * cloudvideo, splash, and poplayer advertising payloads.
 */
function handleTaobaoResponse() {
  const body = $response && $response.body;
  if (!body) {
    $done({});
    return;
  }

  let obj;
  try {
    obj = JSON.parse(body);
  } catch (_) {
    $done({});
    return;
  }

  const url = ($request && $request.url) || "";
  if (url.includes("mtop.taobao.cloudvideo.video.query")) {
    if (obj?.data?.duration) {
      obj.data.duration = "0";
    }
    if (obj?.data?.resources?.length > 0) {
      obj.data.resources = [];
    }
    if (obj?.data?.caches?.length > 0) {
      obj.data.caches = [];
    }
    if (obj?.data?.respTimeInMs) {
      obj.data.respTimeInMs = "3818332800000";
    }
  } else if (url.includes("mtop.taobao.wireless.home.splash.awesome.get")) {
    const sections = obj?.data?.containers?.splash_home_base?.base?.sections;
    if (Array.isArray(sections)) {
      for (const section of sections) {
        const splash = section?.bizData?.["taobao-splash"];
        if (!Array.isArray(splash?.data)) {
          continue;
        }
        for (const item of splash.data) {
          item.waitTime = "0";
          item.times = "0";
          item.hotStart = "false";
          item.haveVoice = "false";
          item.hideTBLogo = "false";
          item.enable4G = "false";
          item.coldStart = "false";
          item.startTime = "3818332800000";
          item.endTime = "3818419199000";
          item.gmtStart = "2090-12-31 00:00:00";
          item.gmtEnd = "2090-12-31 23:59:59";
          item.gmtStartMs = "3818332800000";
          item.gmtEndMs = "3818419199000";
          if (item?.imgUrl) {
            item.imgUrl = "";
          }
          if (item?.videoUrl) {
            item.videoUrl = "";
          }
        }
      }
    }
  } else if (url.includes("poplayer.template.alibaba.com")) {
    if (obj?.res?.images?.length > 0) {
      obj.res.images = [];
    }
    if (obj?.res?.videos?.length > 0) {
      obj.res.videos = [];
    }
    if (obj?.enable) {
      obj.enable = false;
    }
    if (obj?.mainRes?.images?.length > 0) {
      obj.mainRes.images = [];
    }
  }

  $done({ body: JSON.stringify(obj) });
}

handleTaobaoResponse();
