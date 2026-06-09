import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

const pngSize = 256;

function createBitmap(size) {
  return new Uint8Array(size * size * 4);
}

function setPixel(bitmap, size, x, y, r, g, b, a = 255) {
  const index = (y * size + x) * 4;
  bitmap[index] = r;
  bitmap[index + 1] = g;
  bitmap[index + 2] = b;
  bitmap[index + 3] = a;
}

function roundedRectMask(x, y, width, height, rectRadius) {
  const left = x;
  const right = x + width - 1;
  const top = y;
  const bottom = y + height - 1;
  return (px, py) => {
    const cx = px < left + rectRadius ? left + rectRadius : px > right - rectRadius ? right - rectRadius : px;
    const cy = py < top + rectRadius ? top + rectRadius : py > bottom - rectRadius ? bottom - rectRadius : py;
    return (px - cx) ** 2 + (py - cy) ** 2 <= rectRadius ** 2;
  };
}

function renderIcon(size) {
  const scale = size / 256;
  const px = (value) => Math.round(value * scale);
  const bitmap = createBitmap(size);
  const outerMask = roundedRectMask(px(12), px(12), px(232), px(232), px(42));
  const panelMasks = [
    roundedRectMask(px(64), px(64), px(54), px(54), Math.max(2, px(10))),
    roundedRectMask(px(138), px(64), px(54), px(54), Math.max(2, px(10))),
    roundedRectMask(px(64), px(138), px(54), px(54), Math.max(2, px(10))),
    roundedRectMask(px(138), px(138), px(54), px(54), Math.max(2, px(10)))
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!outerMask(x, y)) {
        setPixel(bitmap, size, x, y, 0, 0, 0, 0);
        continue;
      }
      const gradient = y / size;
      setPixel(
        bitmap,
        size,
        x,
        y,
        Math.round(122 - gradient * 24),
        Math.round(231 - gradient * 18),
        Math.round(213 - gradient * 46),
        255
      );
    }
  }

  for (const mask of panelMasks) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (mask(x, y)) setPixel(bitmap, size, x, y, 18, 24, 34, 255);
      }
    }
  }

  for (let offset = 0; offset < Math.max(1, px(5)); offset += 1) {
    for (let x = px(58); x <= px(198); x += 1) {
      setPixel(bitmap, size, x, px(127) + offset, 13, 18, 25, 255);
    }
    for (let y = px(58); y <= px(198); y += 1) {
      setPixel(bitmap, size, px(127) + offset, y, 13, 18, 25, 255);
    }
  }

  return bitmap;
}

function createPng(bitmap, size) {
  const png = new PNG({ width: size, height: size });
  png.data.set(bitmap);
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
}

function createDibImage(bitmap, size) {
  const pixelBytes = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskBytes = maskStride * size;
  const headerSize = 40;
  const image = Buffer.alloc(headerSize + pixelBytes + maskBytes);

  image.writeUInt32LE(headerSize, 0);
  image.writeInt32LE(size, 4);
  image.writeInt32LE(size * 2, 8);
  image.writeUInt16LE(1, 12);
  image.writeUInt16LE(32, 14);
  image.writeUInt32LE(0, 16);
  image.writeUInt32LE(pixelBytes, 20);
  image.writeInt32LE(0, 24);
  image.writeInt32LE(0, 28);
  image.writeUInt32LE(0, 32);
  image.writeUInt32LE(0, 36);

  const pixelsOffset = headerSize;
  for (let y = 0; y < size; y += 1) {
    const sourceY = size - 1 - y;
    for (let x = 0; x < size; x += 1) {
      const sourceIndex = (sourceY * size + x) * 4;
      const targetIndex = pixelsOffset + (y * size + x) * 4;
      image[targetIndex] = bitmap[sourceIndex + 2];
      image[targetIndex + 1] = bitmap[sourceIndex + 1];
      image[targetIndex + 2] = bitmap[sourceIndex];
      image[targetIndex + 3] = bitmap[sourceIndex + 3];
    }
  }

  return image;
}

function createIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + images.length * entrySize;
  const imageBuffers = images.map(({ bitmap, size }) => ({
    size,
    buffer: createDibImage(bitmap, size)
  }));
  const totalSize = directorySize + imageBuffers.reduce((total, image) => total + image.buffer.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(imageBuffers.length, 4);

  let offset = directorySize;
  imageBuffers.forEach((image, index) => {
    const entryOffset = headerSize + index * entrySize;
    ico[entryOffset] = image.size >= 256 ? 0 : image.size;
    ico[entryOffset + 1] = image.size >= 256 ? 0 : image.size;
    ico[entryOffset + 2] = 0;
    ico[entryOffset + 3] = 0;
    ico.writeUInt16LE(1, entryOffset + 4);
    ico.writeUInt16LE(32, entryOffset + 6);
    ico.writeUInt32LE(image.buffer.length, entryOffset + 8);
    ico.writeUInt32LE(offset, entryOffset + 12);
    image.buffer.copy(ico, offset);
    offset += image.buffer.length;
  });

  return ico;
}

const assetsDir = path.resolve("assets");
await fs.mkdir(assetsDir, { recursive: true });
const pngBitmap = renderIcon(pngSize);
const pngBuffer = createPng(pngBitmap, pngSize);
const icoImages = [256, 128, 64, 48, 32, 16].map((size) => ({ size, bitmap: renderIcon(size) }));
await fs.writeFile(path.join(assetsDir, "icon.png"), pngBuffer);
await fs.writeFile(path.join(assetsDir, "icon.ico"), createIco(icoImages));
