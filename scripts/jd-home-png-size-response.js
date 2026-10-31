// JD Home PNG：仅对已观察命名范围内且实际尺寸 432x318 的 PNG 返回透明 1x1 PNG。
(function () {
  var done = typeof $done === "function" ? $done : function () {};
  var request = typeof $request === "object" && $request ? $request : {};
  var response = typeof $response === "object" && $response ? $response : {};
  var url = String(request.url || "");
  var urlPattern = /^https:\/\/m15\.360buyimg\.com\/mobilecms\/jfs\/t1\/[^?]*\/[0-9a-f]{4}1b013[0-9a-f]{7}\.png(?:\?.*)?$/;
  var body = response.body;

  if (response.status !== 200 || !urlPattern.test(url) ||
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

  function uint32be(bytes, offset) {
    return ((bytes[offset] * 0x1000000) +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  }

  function dimensions(bytes) {
    if (bytes.length < 33 || !ascii(bytes, 0, "\x89PNG\r\n\x1a\n")) return null;
    if (uint32be(bytes, 8) !== 13 || !ascii(bytes, 12, "IHDR")) return null;
    return { width: uint32be(bytes, 16), height: uint32be(bytes, 20) };
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
  headers["Content-Type"] = "image/png";

  done({
    headers: headers,
    body: new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54,
      0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x7a,
      0x5e, 0xab, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]),
  });
})();
