// 生成托盘/应用图标（纯 Node，无依赖）
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function png(width, height, pixelFn) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 圆角方块 + 白色对勾 + 顶部日历横条（SmartDay 视觉）
function draw(size) {
  const r = size * 0.2;
  const barH = size * 0.2;
  return (x, y) => {
    const cx = Math.min(Math.max(x, r), size - 1 - r);
    const cy = Math.min(Math.max(y, r), size - 1 - r);
    const d = Math.hypot(x - cx, y - cy);
    if (d > r) return [0, 0, 0, 0];
    // 渐变蓝底
    const t = (x + y) / (2 * size);
    const base = [
      Math.round(0x4f + (0x7c - 0x4f) * t),
      Math.round(0x6e + (0x5c - 0x6e) * t),
      Math.round(0xf7 + (0xf0 - 0xf7) * t),
      255,
    ];
    // 顶部深色日历条
    if (y < barH) return [Math.round(base[0] * 0.72), Math.round(base[1] * 0.7), Math.round(base[2] * 0.9), 255];
    // 对勾（两条粗线段）
    const p1 = [size * 0.27, size * 0.55];
    const p2 = [size * 0.44, size * 0.72];
    const p3 = [size * 0.75, size * 0.36];
    const thick = Math.max(1.6, size * 0.075);
    const near = (a, b) => {
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const wx = x - a[0], wy = y - a[1];
      const len2 = vx * vx + vy * vy;
      let tt = len2 ? (wx * vx + wy * vy) / len2 : 0;
      tt = Math.max(0, Math.min(1, tt));
      return Math.hypot(x - (a[0] + vx * tt), y - (a[1] + vy * tt));
    };
    if (near(p1, p2) < thick || near(p2, p3) < thick) return [255, 255, 255, 255];
    return base;
  };
}

const outDir = path.join(__dirname, "assets");
fs.mkdirSync(outDir, { recursive: true });
for (const [name, size] of [["tray.png", 32], ["tray@2x.png", 64], ["icon.png", 256], ["icon-512.png", 512]]) {
  fs.writeFileSync(path.join(outDir, name), png(size, size, draw(size)));
  console.log("生成", name, size + "x" + size);
}
