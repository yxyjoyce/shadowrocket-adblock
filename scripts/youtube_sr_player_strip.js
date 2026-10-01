'use strict';

function toUint8Array(value) {
  var result;
  var i;

  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === 'string') {
    result = new Uint8Array(value.length);
    for (i = 0; i < value.length; i += 1) {
      result[i] = value.charCodeAt(i) & 255;
    }
    return result;
  }
  return null;
}

function readVarint(bytes, start, end) {
  var position = start;
  var value = 0;
  var shift = 0;
  var count;
  var byte;

  for (count = 0; count < 10; count += 1) {
    if (position >= end) {
      return null;
    }
    byte = bytes[position];
    position += 1;
    if (shift <= 49) {
      value += (byte & 127) * Math.pow(2, shift);
    } else {
      value = Infinity;
    }
    if (count === 9 && byte > 1) {
      return null;
    }
    if ((byte & 128) === 0) {
      if (value > 9007199254740991) {
        return null;
      }
      return { end: position, value: value };
    }
    if (count === 9) {
      return null;
    }
    shift += 7;
  }
  return null;
}

function parseFields(bytes, start, end) {
  var fields = [];
  var position = start;
  var key;
  var fieldNumber;
  var wireType;
  var length;
  var valueStart;
  var valueEnd;
  var headerEnd;
  var fixedSize;

  while (position < end) {
    var fieldStart = position;
    key = readVarint(bytes, position, end);
    if (!key || !isFinite(key.value)) {
      return null;
    }
    position = key.end;
    fieldNumber = Math.floor(key.value / 8);
    wireType = key.value & 7;
    if (fieldNumber < 1 || fieldNumber > 0x1fffffff) {
      return null;
    }
    valueStart = position;
    headerEnd = valueStart;

    if (wireType === 0) {
      valueEnd = readVarint(bytes, position, end);
      if (!valueEnd) {
        return null;
      }
      position = valueEnd.end;
    } else if (wireType === 1) {
      fixedSize = 8;
      if (position + fixedSize > end) {
        return null;
      }
      position += fixedSize;
    } else if (wireType === 2) {
      headerEnd = position;
      length = readVarint(bytes, position, end);
      if (!length || !isFinite(length.value) || length.value < 0 || Math.floor(length.value) !== length.value) {
        return null;
      }
      position = length.end;
      valueStart = position;
      if (length.value > end - position) {
        return null;
      }
      position += length.value;
    } else if (wireType === 5) {
      fixedSize = 4;
      if (position + fixedSize > end) {
        return null;
      }
      position += fixedSize;
    } else {
      return null;
    }

    fields.push({
      number: fieldNumber,
      wireType: wireType,
      start: fieldStart,
      headerEnd: headerEnd,
      valueStart: valueStart,
      valueEnd: position,
      end: position
    });
  }
  return fields;
}

function encodeVarint(value) {
  var bytes = [];
  var byte;

  while (value > 127) {
    byte = (value % 128) | 128;
    bytes.push(byte);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return new Uint8Array(bytes);
}

function copyRange(bytes, start, end) {
  var result = new Uint8Array(end - start);
  var i;
  for (i = start; i < end; i += 1) {
    result[i - start] = bytes[i];
  }
  return result;
}

function concatBytes(parts) {
  var length = 0;
  var offset = 0;
  var result;
  var i;
  var part;

  for (i = 0; i < parts.length; i += 1) {
    length += parts[i].length;
  }
  result = new Uint8Array(length);
  for (i = 0; i < parts.length; i += 1) {
    part = parts[i];
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function rewritePlaybackTracking(bytes, start, end) {
  var fields = parseFields(bytes, start, end);
  var parts = [];
  var changed = false;
  var i;
  var field;

  if (!fields) {
    return null;
  }
  for (i = 0; i < fields.length; i += 1) {
    field = fields[i];
    if (field.number === 18) {
      changed = true;
    } else {
      parts.push(copyRange(bytes, field.start, field.end));
    }
  }
  return {
    body: changed ? concatBytes(parts) : copyRange(bytes, start, end),
    changed: changed,
    valid: true
  };
}

function rewritePlayerBytes(bytes) {
  var fields = parseFields(bytes, 0, bytes.length);
  var parts = [];
  var changed = false;
  var nested;
  var field;
  var i;

  if (!fields) {
    return { body: bytes, changed: false, valid: false };
  }
  for (i = 0; i < fields.length; i += 1) {
    field = fields[i];
    if (field.number === 7 || field.number === 68) {
      changed = true;
      continue;
    }
    if (field.number === 9 && field.wireType === 2) {
      nested = rewritePlaybackTracking(bytes, field.valueStart, field.valueEnd);
      if (!nested) {
        return { body: bytes, changed: false, valid: false };
      }
      if (nested.changed) {
        parts.push(copyRange(bytes, field.start, field.headerEnd));
        parts.push(encodeVarint(nested.body.length));
        parts.push(nested.body);
        changed = true;
      } else {
        parts.push(copyRange(bytes, field.start, field.end));
      }
    } else {
      parts.push(copyRange(bytes, field.start, field.end));
    }
  }
  return {
    body: changed ? concatBytes(parts) : bytes,
    changed: changed,
    valid: true
  };
}

function rewriteContent(bytes, start, end) {
  var fields = parseFields(bytes, start, end);
  var parts = [];
  var changed = false;
  var player;
  var field;
  var i;

  if (!fields) {
    return null;
  }
  for (i = 0; i < fields.length; i += 1) {
    field = fields[i];
    if (field.number === 2 && field.wireType === 2) {
      player = rewritePlayerBytes(copyRange(bytes, field.valueStart, field.valueEnd));
      if (!player.valid) {
        return null;
      }
      if (player.changed) {
        parts.push(copyRange(bytes, field.start, field.headerEnd));
        parts.push(encodeVarint(player.body.length));
        parts.push(player.body);
        changed = true;
      } else {
        parts.push(copyRange(bytes, field.start, field.end));
      }
    } else {
      parts.push(copyRange(bytes, field.start, field.end));
    }
  }
  return {
    body: changed ? concatBytes(parts) : copyRange(bytes, start, end),
    changed: changed,
    valid: true
  };
}

function rewriteGetWatchBytes(bytes) {
  var fields = parseFields(bytes, 0, bytes.length);
  var parts = [];
  var changed = false;
  var content;
  var field;
  var i;

  if (!fields) {
    return { body: bytes, changed: false, valid: false };
  }
  for (i = 0; i < fields.length; i += 1) {
    field = fields[i];
    if (field.number === 1 && field.wireType === 2) {
      content = rewriteContent(bytes, field.valueStart, field.valueEnd);
      if (!content) {
        return { body: bytes, changed: false, valid: false };
      }
      if (content.changed) {
        parts.push(copyRange(bytes, field.start, field.headerEnd));
        parts.push(encodeVarint(content.body.length));
        parts.push(content.body);
        changed = true;
      } else {
        parts.push(copyRange(bytes, field.start, field.end));
      }
    } else {
      parts.push(copyRange(bytes, field.start, field.end));
    }
  }
  return {
    body: changed ? concatBytes(parts) : bytes,
    changed: changed,
    valid: true
  };
}

function filterPlayerMessage(input) {
  var bytes = toUint8Array(input);
  if (!bytes) {
    return { body: null, changed: false, valid: false };
  }
  return rewritePlayerBytes(bytes);
}

function filterGetWatchMessage(input) {
  var bytes = toUint8Array(input);
  if (!bytes) {
    return { body: null, changed: false, valid: false };
  }
  return rewriteGetWatchBytes(bytes);
}

function transformResponseBody(input, url) {
  var bytes = toUint8Array(input);
  var result;
  var kind;

  if (!bytes) {
    return { body: null, changed: false, matched: false, valid: false };
  }
  if (typeof url !== 'string') {
    return { body: bytes, changed: false, matched: false, valid: true };
  }
  if (/^https:\/\/youtubei\.googleapis\.com\/youtubei\/v1\/player(?:\?.*)?$/.test(url)) {
    kind = 'player';
  } else if (/^https:\/\/youtubei\.googleapis\.com\/youtubei\/v1\/get_watch(?:\?.*)?$/.test(url)) {
    kind = 'get_watch';
  } else {
    return { body: bytes, changed: false, matched: false, valid: true };
  }
  result = kind === 'player' ? filterPlayerMessage(bytes) : filterGetWatchMessage(bytes);
  result.matched = true;
  return result;
}

function runShadowrocket() {
  var request;
  var url;
  var result;

  if (typeof $done !== 'function') {
    return;
  }
  if (typeof $response !== 'object' || !$response || !Object.prototype.hasOwnProperty.call($response, 'body')) {
    $done({});
    return;
  }
  request = typeof $request === 'object' && $request ? $request : null;
  url = request && typeof request.url === 'string' ? request.url : '';
  result = transformResponseBody($response.body, url);
  if (result.valid && result.matched && result.changed) {
    $done({ body: result.body });
  } else {
    $done({});
  }
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = {
    toUint8Array: toUint8Array,
    filterPlayerMessage: filterPlayerMessage,
    filterGetWatchMessage: filterGetWatchMessage,
    transformResponseBody: transformResponseBody
  };
} else {
  runShadowrocket();
}
