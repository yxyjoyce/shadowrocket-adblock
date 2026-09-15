/**
 * Quantumult X observation-only script for QiMao qm_focus configuration.
 * It never changes the response and always fails open.
 */
(function () {
  var response = (typeof $response === "object" && $response) ? $response : {};
  var body = (typeof response.body === "string") ? response.body : "";

  function doneOriginal() {
    $done(body);
  }

  function responseHeader(headers, name) {
    var value = "";
    if (!headers || typeof headers !== "object") return value;
    Object.keys(headers).forEach(function (key) {
      if (String(key).toLowerCase() === name) value = String(headers[key] == null ? "" : headers[key]);
    });
    return value;
  }

  function queryParam(url, name) {
    var queryStart = String(url || "").indexOf("?");
    if (queryStart < 0) return "";
    var query = String(url).slice(queryStart + 1).split("#")[0];
    var result = "";
    query.split("&").forEach(function (part) {
      var separator = part.indexOf("=");
      var rawKey = separator < 0 ? part : part.slice(0, separator);
      if (decodeQuery(rawKey) === name) {
        result = separator < 0 ? "" : decodeQuery(part.slice(separator + 1));
      }
    });
    return result;
  }

  function decodeQuery(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, " "));
    } catch (error) {
      return String(value);
    }
  }

  function isBase64Like(value) {
    var compact = String(value).replace(/\s/g, "");
    return compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(compact);
  }

  function isHexLike(value) {
    var compact = String(value).replace(/\s/g, "");
    return compact.length >= 4 && compact.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(compact);
  }

  function classifyDecoded(decoded) {
    if (!decoded) return "empty";
    var first = decoded.charCodeAt(0);
    if (decoded.replace(/^\s+/, "").charAt(0) === "{" ||
        decoded.replace(/^\s+/, "").charAt(0) === "[") return "JSON-text";
    if (first === 0x1f && decoded.charCodeAt(1) === 0x8b) return "gzip-binary";
    var printable = 0;
    for (var i = 0; i < decoded.length; i += 1) {
      var code = decoded.charCodeAt(i);
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) printable += 1;
    }
    if (printable / decoded.length > 0.85) return "text/custom-or-encrypted";
    return "binary/protobuf-candidate";
  }

  try {
    var url = (typeof $request === "object" && $request) ? String($request.url || "") : "";
    var status = response.status != null ? response.status : response.statusCode;
    var contentType = responseHeader(response.headers, "content-type");
    var modules = queryParam(url, "modules");
    var project = queryParam(url, "project");

    console.log("[QiMao] script invoked");
    console.log("[QiMao] url=" + url);
    console.log("[QiMao] status=" + String(status == null ? "" : status));
    console.log("[QiMao] content-type=" + contentType);
    console.log("[QiMao] body.length=" + String(body.length));
    console.log("[QiMao] body[0:500]=" + body.slice(0, 500));
    console.log("[QiMao] modules=" + modules);
    console.log("[QiMao] project=" + project);

    var outer = JSON.parse(body);
    if (outer && typeof outer === "object" && typeof outer.data === "string") {
      var data = outer.data;
      console.log("[QiMao] data.length=" + String(data.length));
      console.log("[QiMao] data[0:200]=" + data.slice(0, 200));
      console.log("[QiMao] data base64-like=" + String(isBase64Like(data)));
      console.log("[QiMao] data hex-like=" + String(isHexLike(data)));

      if (isBase64Like(data)) {
        if (typeof atob !== "function") {
          console.log("[QiMao] base64 decode=unavailable");
        } else {
          try {
            var decoded = atob(data.replace(/\s/g, ""));
            console.log("[QiMao] base64 decoded.length=" + String(decoded.length));
            console.log("[QiMao] base64 decoded.kind=" + classifyDecoded(decoded));
          } catch (decodeError) {
            console.log("[QiMao] base64 decode=failed");
          }
        }
      }
    }
  } catch (error) {
    console.log("[QiMao] observation error; response unchanged");
  }

  doneOriginal();
})();
