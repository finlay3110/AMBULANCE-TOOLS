/* A .zip of files, built in the browser. Files are stored, not compressed: they
   are PDFs, which are compressed already. Zip(files) takes [{ name, data }],
   data a Uint8Array, and returns a Blob. */
(function (global) {
  "use strict";

  var TABLE = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(files) {
    var d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0, centralSize = 0;
    files.forEach(function (f) {
      var name = new TextEncoder().encode(f.name), crc = crc32(f.data), size = f.data.length;
      var head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true);    // local file header
      head.setUint16(4, 20, true);            // version needed: 2.0
      head.setUint16(6, 0x0800, true);        // the name is UTF-8
      head.setUint16(10, time, true);
      head.setUint16(12, date, true);
      head.setUint32(14, crc, true);
      head.setUint32(18, size, true);
      head.setUint32(22, size, true);
      head.setUint16(26, name.length, true);
      parts.push(head, name, f.data);

      var entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);   // central directory entry
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(12, time, true);
      entry.setUint16(14, date, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, size, true);
      entry.setUint32(24, size, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);      // where its local header starts
      central.push(entry, name);
      offset += 30 + name.length + size;
      centralSize += 46 + name.length;
    });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);       // end of central directory
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
  }

  global.Zip = zip;
})(window);
