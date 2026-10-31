// JD Home WebP：仅对 Home referer 且实际尺寸 432x318 的 WebP 返回透明 1x1 WebP。
(function () {
  var done = typeof $done === "function" ? $done : function () {};
  var request = typeof $request === "object" && $request ? $request : {};
  var response = typeof $response === "object" && $response ? $response : {};
  var url = String(request.url || "");
  var urlPattern = /^https:\/\/m15\.360buyimg\.com\/mobilecms\/jfs\/t1\/[^?]*\.webp(?:\?.*)?$/;
  var requestHeaders = request.headers || {};
  var referer = requestHeaders.Referer || requestHeaders.referer || requestHeaders.REFERER || "";
  var responseStatus = response.status !== undefined ? response.status : response.statusCode;
  var body = response.body;
  var bodyBytes = response.bodyBytes;

  function statusAllowsResponse(value) {
    if (value === undefined || value === null || value === "") return true;
    if (value === 200 || value === "200") return true;
    return typeof value === "string" && /^HTTP\/\d(?:\.\d)?\s+200(?:\s+OK)?$/i.test(value.trim());
  }

  if (bodyBytes !== undefined) {
    if (typeof ArrayBuffer === "undefined" || !(bodyBytes instanceof ArrayBuffer) && !(bodyBytes instanceof Uint8Array)) bodyBytes = null;
    else body = bodyBytes instanceof Uint8Array ? bodyBytes : new Uint8Array(bodyBytes);
  }

  if (!statusAllowsResponse(responseStatus) || !urlPattern.test(url) || referer !== "Image_JDAppHome" ||
      typeof Uint8Array === "undefined" || !(body instanceof Uint8Array)) {
    done({});
    return;
  }

  function ascii(bytes, offset, value) {
    if (offset + value.length > bytes.length) return false;
    for (var i = 0; i < value.length; i += 1) {
      if (bytes[offset + i] !== value.charCodeAt(i)) return false;
    }
    return true;
  }

  function uint32le(bytes, offset) {
    return (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] * 0x1000000)) >>> 0;
  }

  function dimensions(bytes) {
    if (bytes.length < 20 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) return null;
    var chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    var chunkSize = uint32le(bytes, 16);

    if (chunk === "VP8X") {
      if (chunkSize < 10 || bytes.length < 30) return null;
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }

    if (chunk === "VP8L") {
      if (chunkSize < 5 || bytes.length < 25 || bytes[20] !== 0x2f) return null;
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + ((bytes[22] >> 6) & 0x03) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
    }

    if (chunk === "VP8 ") {
      if (chunkSize < 10 || bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
      return {
        width: bytes[26] | ((bytes[27] & 0x3f) << 8),
        height: bytes[28] | ((bytes[29] & 0x3f) << 8),
      };
    }

    return null;
  }

  var size = dimensions(body);
  if (!size || size.width !== 432 || size.height !== 318) {
    done({});
    return;
  }

  var headers = {};
  for (var key in response.headers || {}) {
    if (Object.prototype.hasOwnProperty.call(response.headers, key)) headers[key] = response.headers[key];
  }
  var removeHeaders = ["content-type", "content-length", "content-encoding", "content-range", "transfer-encoding", "content-md5"];
  for (var header in headers) {
    if (removeHeaders.indexOf(String(header).toLowerCase()) !== -1) delete headers[header];
  }
  headers["Content-Type"] = "image/webp";

  var replacement = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
      0x0a, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
      0x10, 0x88, 0x88, 0x08, 0x00, 0x00,
    ]);
  var output = { headers: headers };
  if (response.bodyBytes !== undefined) output.bodyBytes = replacement.buffer;
  else output.body = replacement;
  done(output);
})();
