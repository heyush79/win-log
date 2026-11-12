'use strict';

// Makes every Win Log icon file from the two SVG sources in assets/.
//
//   Run from the project folder:  npx electron scripts/make-icons.js
//
// No npm packages: a hidden, sandboxed Electron window draws each SVG onto a
// <canvas> at an exact pixel size and hands back the PNG. The .ico files are
// written by hand below and the .icns is made with macOS's own iconutil.
// Nothing here touches the network.
//
// Writes:
//   build/icon.png              1024 px, macOS icon grid (electron-builder)
//   build/icon.icns             macOS app icon (only when run on macOS)
//   build/icon.ico              Windows app icon, 16-256 px, tighter crop
//   assets/icon.png             256 px, macOS icon grid (used in app windows)
//   assets/trayTemplate.png     16 px menu bar template glyph (black + alpha)
//   assets/trayTemplate@2x.png  32 px menu bar template glyph
//   assets/tray.ico             Windows tray icon, 16-48 px, tighter crop

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow, session } = require('electron');

if (!app) {
  // Plain Node, or Electron started with ELECTRON_RUN_AS_NODE=1 (some editor
  // terminals set it).
  console.error('Run this with Electron: npx electron scripts/make-icons.js');
  if (process.env.ELECTRON_RUN_AS_NODE) console.error('Unset ELECTRON_RUN_AS_NODE first.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BUILD = path.join(ROOT, 'build');

// The rounded square in icon.svg: x and y from 100 to 924.
const BODY_START = 100;
const BODY_SIZE = 824;

// In the Windows icons at 16-32 px the star is drawn larger so it stays easy
// to read. It grows around the centre of its bounding box in icon.svg.
const SMALL_STAR_MAX_SIZE = 32;
const SMALL_STAR_SCALE = 1.15;
const STAR_CENTRE = [512, 509];

// Standard macOS .iconset names and their pixel sizes.
const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

const APP_ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// Electron loads the tray icon at the system small-icon size: 16 px at 100%
// scaling, 20 at 125%, 24 at 150%, 32 at 200%, 48 at 300%. A missing size is
// scaled by Windows and looks soft.
const TRAY_ICO_SIZES = [16, 20, 24, 32, 48];

// ---------------------------------------------------------------------------
// SVG variants

// Reads an SVG source. Comments are removed so the text edits below only ever
// match real markup.
function readSvg(name) {
  return fs.readFileSync(path.join(ASSETS, name), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
}

// Sets width, height and viewBox on the root <svg> element.
function withSize(svg, size, viewBox) {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open) throw new Error('No <svg> element found');
  let tag = open[0];
  for (const [name, value] of [['width', size], ['height', size], ['viewBox', viewBox]]) {
    if (value === undefined) continue;
    const attr = new RegExp(`\\s${name}="[^"]*"`);
    if (!attr.test(tag)) throw new Error(`The <svg> element has no ${name} attribute`);
    tag = tag.replace(attr, ` ${name}="${value}"`);
  }
  return svg.replace(open[0], tag);
}

// Replaces exactly one occurrence of `find`, or fails loudly.
function replaceOnce(text, find, replacement) {
  if (text.split(find).length !== 2) throw new Error(`Expected exactly one ${find} in icon.svg`);
  return text.replace(find, replacement);
}

// Windows version of the app icon: no drop shadow, and the viewBox is cropped
// so the rounded square fills the canvas with a margin of whole pixels.
// Whole-pixel margins keep the square's straight edges sharp at small sizes.
function windowsSvg(appSvg, size) {
  let svg = replaceOnce(appSvg, ' filter="url(#body-shadow)"', '');
  if (size <= SMALL_STAR_MAX_SIZE) {
    const [cx, cy] = STAR_CENTRE;
    const grow = `translate(${cx} ${cy}) scale(${SMALL_STAR_SCALE}) translate(${-cx} ${-cy})`;
    svg = replaceOnce(svg, '<path id="star"', `<path id="star" transform="${grow}"`);
  }
  const margin = Math.max(1, Math.round(size / 32));
  const unitsPerPixel = BODY_SIZE / (size - 2 * margin);
  const start = BODY_START - margin * unitsPerPixel;
  const side = size * unitsPerPixel;
  const viewBox = [start, start, side, side].map((n) => +n.toFixed(4)).join(' ');
  return withSize(svg, size, viewBox);
}

// ---------------------------------------------------------------------------
// Rendering in the hidden window

// This function runs inside the page. It is sent there as source text by
// render() below; it is never called in the main process.
async function drawInPage(url, size, withPixels) {
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {
    throw new Error('the SVG could not be loaded (is it valid?)');
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const result = { png: canvas.toDataURL('image/png').split(',')[1], rgba: '' };
  if (withPixels) {
    const pixels = ctx.getImageData(0, 0, size, size).data; // RGBA, not premultiplied
    let binary = '';
    for (let i = 0; i < pixels.length; i++) binary += String.fromCharCode(pixels[i]);
    result.rgba = btoa(binary);
  }
  return result;
}

// Draws an SVG string at size x size pixels. Returns { size, png, rgba } where
// png is the encoded file and rgba the raw pixels (only when withPixels).
async function render(win, svg, size, withPixels = false) {
  // A data: URL keeps the canvas untainted, so toDataURL() is allowed.
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
  const code = `(${drawInPage})(${JSON.stringify(url)}, ${size}, ${withPixels})`;
  const out = await win.webContents.executeJavaScript(code).catch((err) => {
    throw new Error(`Drawing at ${size} px failed: ${(err && err.message) || err}`);
  });
  const png = Buffer.from(out.png, 'base64');
  const rgba = Buffer.from(out.rgba, 'base64');
  if (withPixels && rgba.length !== size * size * 4) throw new Error(`Bad pixel data at ${size} px`);
  return { size, png, rgba };
}

// ---------------------------------------------------------------------------
// .ico writer
//
// Layout: ICONDIR (6 bytes), one ICONDIRENTRY (16 bytes) per image, then the
// images. Sizes below 256 are classic 32-bit DIBs (BITMAPINFOHEADER, height
// doubled, bottom-up BGRA rows, then a 1-bit AND mask with rows padded to 32
// bits). The 256 px image is stored as PNG. Old Windows tools and NSIS read
// this without trouble.

function dibImage(size, rgba) {
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const colorBytes = size * size * 4;
  const maskBytes = maskRowBytes * size;
  const buf = Buffer.alloc(40 + colorBytes + maskBytes); // zero-filled

  buf.writeUInt32LE(40, 0); // biSize
  buf.writeInt32LE(size, 4); // biWidth
  buf.writeInt32LE(size * 2, 8); // biHeight: colour rows + mask rows
  buf.writeUInt16LE(1, 12); // biPlanes
  buf.writeUInt16LE(32, 14); // biBitCount
  buf.writeUInt32LE(0, 16); // biCompression = BI_RGB
  buf.writeUInt32LE(colorBytes + maskBytes, 20); // biSizeImage
  // The rest of the header (resolution, palette counts) stays 0.

  for (let y = 0; y < size; y++) {
    const row = size - 1 - y; // DIB rows go bottom-up
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = 40 + (row * size + x) * 4;
      buf[dst] = rgba[src + 2]; // B
      buf[dst + 1] = rgba[src + 1]; // G
      buf[dst + 2] = rgba[src]; // R
      buf[dst + 3] = rgba[src + 3]; // A
      // AND mask: 1 = transparent. Only used by tools that ignore alpha.
      if (rgba[src + 3] === 0) {
        buf[40 + colorBytes + row * maskRowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return buf;
}

function makeIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const blobs = images.map((img) => (img.size >= 256 ? img.png : dibImage(img.size, img.rgba)));
  let offset = header.length;
  images.forEach((img, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(img.size >= 256 ? 0 : img.size, entry); // width, 0 means 256
    header.writeUInt8(img.size >= 256 ? 0 : img.size, entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette colours
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(blobs[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += blobs[i].length;
  });
  return Buffer.concat([header, ...blobs]);
}

// ---------------------------------------------------------------------------
// Output

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`  ${path.relative(ROOT, file)}  (${data.length} bytes)`);
}

// A menu bar template image must be black; only the alpha channel is used.
function checkBlackOnly(img) {
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i + 3] > 0 && (img.rgba[i] || img.rgba[i + 1] || img.rgba[i + 2])) {
      throw new Error(`Tray template at ${img.size} px has a pixel that is not black`);
    }
  }
}

// Builds the .icns with iconutil in a temporary folder and returns its bytes.
function makeIcns(macImages) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'winlog-icons-'));
  try {
    const iconset = path.join(tmp, 'icon.iconset');
    const out = path.join(tmp, 'icon.icns');
    fs.mkdirSync(iconset);
    for (const [name, size] of ICONSET) fs.writeFileSync(path.join(iconset, name), macImages.get(size).png);
    execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', out], { stdio: 'inherit' });
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function makeAll(win) {
  const appSvg = readSvg('icon.svg');
  const traySvg = readSvg('tray-mac.svg');

  // Make everything in memory first, so a failure leaves the old files as they were.

  // macOS-grid app icon at every size the .iconset needs (256 also feeds assets/icon.png).
  const macImages = new Map();
  for (const size of new Set(ICONSET.map(([, s]) => s))) {
    macImages.set(size, await render(win, withSize(appSvg, size), size));
  }

  // Windows app icon and tray icon: same artwork, tighter crop, no shadow.
  const winImages = new Map();
  for (const size of new Set([...APP_ICO_SIZES, ...TRAY_ICO_SIZES])) {
    winImages.set(size, await render(win, windowsSvg(appSvg, size), size, size < 256));
  }

  // macOS menu bar template glyph.
  const tray1x = await render(win, withSize(traySvg, 16), 16, true);
  const tray2x = await render(win, withSize(traySvg, 32), 32, true);
  checkBlackOnly(tray1x);
  checkBlackOnly(tray2x);

  const icns = process.platform === 'darwin' ? makeIcns(macImages) : null;
  const appIco = makeIco(APP_ICO_SIZES.map((s) => winImages.get(s)));
  const trayIco = makeIco(TRAY_ICO_SIZES.map((s) => winImages.get(s)));

  console.log('Wrote:');
  write(path.join(BUILD, 'icon.png'), macImages.get(1024).png);
  if (icns) write(path.join(BUILD, 'icon.icns'), icns);
  else console.log('  build/icon.icns skipped: iconutil is only available on macOS');
  write(path.join(BUILD, 'icon.ico'), appIco);
  write(path.join(ASSETS, 'icon.png'), macImages.get(256).png);
  write(path.join(ASSETS, 'trayTemplate.png'), tray1x.png);
  write(path.join(ASSETS, 'trayTemplate@2x.png'), tray2x.png);
  write(path.join(ASSETS, 'tray.ico'), trayIco);
}

async function main() {
  if (app.dock) app.dock.hide();
  // Belt and braces: refuse any request that is not a data: URL.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('data:') });
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  try {
    await win.loadURL('about:blank');
    await makeAll(win);
  } finally {
    win.destroy();
  }
}

app.disableHardwareAcceleration(); // plain software drawing, same result on every machine
app.on('window-all-closed', () => {}); // stay alive until main() is done

app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (err) => {
      console.error('make-icons failed:', err && err.stack ? err.stack : err);
      app.exit(1);
    }
  );
