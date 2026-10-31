// JD response structure cleanup: only remove fields observed as promotion candidates.
(function () {
  var finish = typeof $done === "function" ? $done : function () {};
  var request = typeof $request === "object" && $request ? $request : {};
  var response = typeof $response === "object" && $response ? $response : {};
  var url = String(request.url || "");
  if (!/^https?:\/\/api\.m\.jd\.com\/client\.action(?:\?.*)?$/.test(url) || response.status !== undefined && response.status !== 200) {
    finish({});
    return;
  }
  var body = response.body;
  if (typeof body !== "string" || body.length === 0) {
    finish({});
    return;
  }
  if (body.length > 2 * 1024 * 1024) {
    finish({});
    return;
  }

  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function bytesToUtf8(bytes) {
    var escaped = "";
    for (var i = 0; i < bytes.length; i += 1) {
      var hex = bytes[i].toString(16).toUpperCase();
      escaped += "%" + (hex.length === 1 ? "0" : "") + hex;
    }
    try { return decodeURIComponent(escaped); } catch (e) { return null; }
  }
  function utf8ToBytes(value) {
    var binary;
    try { binary = unescape(encodeURIComponent(value)); } catch (e) { return null; }
    var bytes = [];
    for (var i = 0; i < binary.length; i += 1) bytes.push(binary.charCodeAt(i) & 255);
    return bytes;
  }
  function decodeBase64(value) {
    var input = String(value).replace(/\s+/g, "");
    if (!input || input.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input)) return null;
    var bytes = [];
    for (var i = 0; i < input.length; i += 4) {
      var a = alphabet.indexOf(input[i]);
      var b = alphabet.indexOf(input[i + 1]);
      var c = input[i + 2] === "=" ? 0 : alphabet.indexOf(input[i + 2]);
      var d = input[i + 3] === "=" ? 0 : alphabet.indexOf(input[i + 3]);
      if (a < 0 || b < 0 || c < 0 || d < 0) return null;
      bytes.push((a << 2) | (b >> 4));
      if (input[i + 2] !== "=") bytes.push(((b & 15) << 4) | (c >> 2));
      if (input[i + 3] !== "=") bytes.push(((c & 3) << 6) | d);
    }
    return bytesToUtf8(bytes);
  }
  function encodeBase64(value) {
    var bytes = utf8ToBytes(value);
    if (!bytes) return null;
    var output = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i];
      var hasB = i + 1 < bytes.length;
      var hasC = i + 2 < bytes.length;
      var b = hasB ? bytes[i + 1] : 0;
      var c = hasC ? bytes[i + 2] : 0;
      output += alphabet[a >> 2];
      output += alphabet[((a & 3) << 4) | (b >> 4)];
      output += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
      output += hasC ? alphabet[c & 63] : "=";
    }
    return output;
  }
  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function cleanHome(value) {
    if (!isObject(value) || !Array.isArray(value.floorList)) return false;
    var promoted = { bottomXview: true, float: true, photoCeiling: true };
    var kept = [];
    var changed = false;
    for (var i = 0; i < value.floorList.length; i += 1) {
      var item = value.floorList[i];
      if (isObject(item) && promoted[item.type] === true) changed = true;
      else kept.push(item);
    }
    if (changed) value.floorList = kept;
    return changed;
  }
  function cleanMine(value) {
    if (!isObject(value) || !Array.isArray(value.floors)) return false;
    var changed = false;
    for (var i = 0; i < value.floors.length; i += 1) {
      var floor = value.floors[i];
      if (!isObject(floor) || floor.mId !== "basefloorinfo" || !isObject(floor.data)) continue;
      ["commonPopup", "commonPopup_dynamic", "floatLayer"].forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(floor.data, field)) {
          delete floor.data[field];
          changed = true;
        }
      });
    }
    return changed;
  }
  function cleanPromotionTabs(value) {
    if (!isObject(value) || !isObject(value.promotionTabs) || value.promotionTabs.type !== "promotionTabs") return false;
    var content = value.promotionTabs.content;
    if (!isObject(content) || content.type !== "promotionTabs" || !Array.isArray(content.data) || content.data.length === 0) return false;
    content.data = [];
    return true;
  }

  var parsed;
  var encoded = false;
  try {
    parsed = JSON.parse(body);
  } catch (plainError) {
    var decoded = decodeBase64(body);
    if (decoded === null) { finish({}); return; }
    try { parsed = JSON.parse(decoded); encoded = true; } catch (base64Error) { finish({}); return; }
  }
  if (!isObject(parsed)) { finish({}); return; }
  var targets = [parsed];
  if (isObject(parsed.data)) targets.push(parsed.data);
  var changed = false;
  for (var i = 0; i < targets.length; i += 1) {
    if (cleanHome(targets[i])) changed = true;
    if (cleanMine(targets[i])) changed = true;
    if (cleanPromotionTabs(targets[i])) changed = true;
  }
  if (!changed) { finish({}); return; }
  var output = JSON.stringify(parsed);
  if (encoded) output = encodeBase64(output);
  if (typeof output !== "string") { finish({}); return; }
  finish({ body: output });
})();
