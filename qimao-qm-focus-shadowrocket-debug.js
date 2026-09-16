(function () {
  var response = (typeof $response === "object" && $response) ? $response : {};
  var originalBody = typeof response.body === "string" ? response.body : "";

  function log(message) {
    try {
      if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log(message);
      }
    } catch (ignore) {}
  }

  function finish() {
    // This is an observation-only module: never write a transformed body.
    $done({ body: originalBody });
  }

  function safePath(url) {
    var value = String(url || "");
    var match = value.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+([^?#]*)/i);
    return match && match[1] ? match[1] : "/";
  }

  function queryParam(url, name) {
    var value = String(url || "");
    var question = value.indexOf("?");
    if (question < 0) return "";
    var query = value.slice(question + 1).split("#")[0].split("&");
    for (var i = 0; i < query.length; i += 1) {
      var pair = query[i].split("=");
      var key = decode(pair[0]);
      if (key === name) return visible(decode(pair.slice(1).join("=")));
    }
    return "";
  }

  function decode(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (ignore) {
      return String(value || "");
    }
  }

  function visible(value) {
    return String(value == null ? "" : value).replace(/[\r\n\t]/g, " ").slice(0, 80);
  }

  function compact(value) {
    return String(value || "").replace(/\s/g, "");
  }

  function prefixClass(value) {
    var sample = compact(value);
    if (sample.length >= 8 && /^[A-Za-z0-9+/]*={0,2}$/.test(sample) && sample.length % 4 === 0) return "base64";
    if (sample.length >= 4 && sample.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(sample)) return "hex";
    return "other";
  }

  function decodedClass(bytes) {
    if (!bytes) return "empty";
    var trimmed = bytes.replace(/^\s+/, "");
    if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") return "JSON-text";
    if (bytes.charCodeAt(0) === 0x1f && bytes.charCodeAt(1) === 0x8b) return "gzip-binary";
    var printable = 0;
    for (var i = 0; i < bytes.length; i += 1) {
      var code = bytes.charCodeAt(i);
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) printable += 1;
    }
    return printable / bytes.length > 0.85 ? "text-or-encrypted" : "binary-or-protobuf-candidate";
  }

  function decodeClass(value, kind) {
    if (kind === "other") return "not-attempted";
    if (typeof atob !== "function") return "unavailable";
    try {
      var source = compact(value);
      if (kind === "hex") {
        var bytes = "";
        for (var i = 0; i < source.length; i += 2) bytes += String.fromCharCode(parseInt(source.slice(i, i + 2), 16));
        return decodedClass(bytes);
      }
      return decodedClass(atob(source));
    } catch (error) {
      return "failed";
    }
  }

  try {
    var request = (typeof $request === "object" && $request) ? $request : {};
    var status = response.status != null ? response.status : response.statusCode;
    var headers = response.headers && typeof response.headers === "object" ? response.headers : {};
    var contentType = "";
    Object.keys(headers).some(function (key) {
      if (String(key).toLowerCase() === "content-type") {
        contentType = visible(headers[key]);
        return true;
      }
      return false;
    });

    log("[QiMao-Debug] pattern-hit=true");
    log("[QiMao-Debug] script-invoked=true");
    log("[QiMao-Debug] path=" + safePath(request.url));
    log("[QiMao-Debug] modules=" + queryParam(request.url, "modules"));
    log("[QiMao-Debug] project=" + queryParam(request.url, "project"));
    log("[QiMao-Debug] status=" + String(status == null ? "" : status));
    log("[QiMao-Debug] content-type=" + contentType);
    log("[QiMao-Debug] body-readable-length=" + String(originalBody.length));
    log("[QiMao-Debug] would-modify=false");

    var outer;
    try {
      outer = JSON.parse(originalBody);
      log("[QiMao-Debug] outer-json=parse-ok");
    } catch (parseError) {
      log("[QiMao-Debug] outer-json=parse-failed");
      finish();
      return;
    }
    if (!outer || typeof outer !== "object" || typeof outer.data !== "string") {
      log("[QiMao-Debug] data=absent-or-non-string");
      finish();
      return;
    }

    var kind = prefixClass(outer.data);
    log("[QiMao-Debug] data-length=" + String(outer.data.length));
    log("[QiMao-Debug] data-prefix-class=" + kind);
    log("[QiMao-Debug] data-decode-class=" + decodeClass(outer.data, kind));
    log("[QiMao-Debug] decryption=not-assumed");
  } catch (error) {
    log("[QiMao-Debug] observation-error=true; original");
  }

  finish();
}());
