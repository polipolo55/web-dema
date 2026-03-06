// Generate Win98 cursor PNGs using pure Node.js (no dependencies)
// Creates minimal valid PNG files with the classic arrow and hand cursor pixel data

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.join(__dirname, '..', 'public', 'assets', 'cursors');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function createPNG(pixels, width, height) {
  // Build raw RGBA image data with filter byte (0) per row
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const idx = y * (width * 4 + 1) + 1 + x * 4;
      const p = pixels[y][x];
      raw[idx] = p[0];     // R
      raw[idx + 1] = p[1]; // G
      raw[idx + 2] = p[2]; // B
      raw[idx + 3] = p[3]; // A
    }
  }

  const compressed = zlib.deflateSync(raw);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeB, data, crc]);
}

// CRC32 implementation
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Classic Win98 arrow cursor (11x18 grid, scale 2x = 22x36 final)
// 0=transparent, 1=black, 2=white
const arrowData = [
  [1,0,0,0,0,0,0,0,0,0,0],
  [1,1,0,0,0,0,0,0,0,0,0],
  [1,2,1,0,0,0,0,0,0,0,0],
  [1,2,2,1,0,0,0,0,0,0,0],
  [1,2,2,2,1,0,0,0,0,0,0],
  [1,2,2,2,2,1,0,0,0,0,0],
  [1,2,2,2,2,2,1,0,0,0,0],
  [1,2,2,2,2,2,2,1,0,0,0],
  [1,2,2,2,2,2,2,2,1,0,0],
  [1,2,2,2,2,2,2,2,2,1,0],
  [1,2,2,2,2,2,1,1,1,1,1],
  [1,2,2,1,2,2,1,0,0,0,0],
  [1,2,1,0,1,2,2,1,0,0,0],
  [1,1,0,0,1,2,2,1,0,0,0],
  [1,0,0,0,0,1,2,2,1,0,0],
  [0,0,0,0,0,1,2,2,1,0,0],
  [0,0,0,0,0,0,1,2,1,0,0],
  [0,0,0,0,0,0,1,1,0,0,0],
];

// Classic Win98 hand/link cursor (15x22 grid, scale 2x = 30x44 final)
const handData = [
  [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,1,1,1,0,0,0,0],
  [0,0,0,0,0,1,2,2,1,2,2,1,0,0,0],
  [0,1,1,0,0,1,2,2,1,2,2,1,1,0,0],
  [0,1,2,1,0,1,2,2,1,2,2,1,2,1,0],
  [0,1,2,2,1,1,2,2,2,2,2,1,2,1,0],
  [0,0,1,2,2,1,2,2,2,2,2,2,2,1,0],
  [0,0,0,1,2,2,2,2,2,2,2,2,2,1,0],
  [0,0,0,0,1,2,2,2,2,2,2,2,2,1,0],
  [0,0,0,0,1,2,2,2,2,2,2,2,1,0,0],
  [0,0,0,0,0,1,2,2,2,2,2,2,1,0,0],
  [0,0,0,0,0,1,2,2,2,2,2,1,0,0,0],
  [0,0,0,0,0,0,1,2,2,2,2,1,0,0,0],
  [0,0,0,0,0,0,1,2,2,2,2,1,0,0,0],
  [0,0,0,0,0,0,1,2,2,2,2,1,0,0,0],
  [0,0,0,0,0,0,0,1,2,2,1,0,0,0,0],
  [0,0,0,0,0,0,0,1,2,2,1,0,0,0,0],
  [0,0,0,0,0,0,0,1,2,2,1,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0],
];

const T = [0, 0, 0, 0];
const B = [0, 0, 0, 255];
const W = [255, 255, 255, 255];
const colorMap = { 0: T, 1: B, 2: W };

function scaleUp(bitmap, scale) {
  const h = bitmap.length;
  const w = bitmap[0].length;
  const pixels = [];
  for (let y = 0; y < h; y++) {
    for (let sy = 0; sy < scale; sy++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const c = colorMap[bitmap[y][x]];
        for (let sx = 0; sx < scale; sx++) {
          row.push(c);
        }
      }
      pixels.push(row);
    }
  }
  return pixels;
}

// Generate 2x scaled cursors
const arrowPixels = scaleUp(arrowData, 2);
const arrowPng = createPNG(arrowPixels, 22, 36);
fs.writeFileSync(path.join(outDir, 'arrow.png'), arrowPng);
console.log('arrow.png written (22x36)');

const handPixels = scaleUp(handData, 2);
const handPng = createPNG(handPixels, 30, 44);
fs.writeFileSync(path.join(outDir, 'hand.png'), handPng);
console.log('hand.png written (30x44)');

console.log('Done!');
