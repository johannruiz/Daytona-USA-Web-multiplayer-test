const MIB = 1024 * 1024;
const utf8 = new TextDecoder();
const crcTable = Uint32Array.from({length: 256}, (_, byte) => {
  for (let bit = 0; bit < 8; bit++) byte = (byte >>> 1) ^ (byte & 1 ? 0xedb88320 : 0);
  return byte;
});
const crcByte = (crc, byte) => (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];

async function zipDirectory(file) {
  if (file.size > 64 * MIB || file.size < 22) throw Error('Choose a texture ZIP of up to 64 MiB.');
  const tail = new DataView(await file.slice(-Math.min(file.size, 65557)).arrayBuffer());
  let end = tail.byteLength - 22;
  while (end >= 0 && (tail.getUint32(end, true) !== 0x06054b50 ||
    end + 22 + tail.getUint16(end + 20, true) !== tail.byteLength)) end--;
  if (end < 0) throw Error('The texture ZIP directory could not be read.');
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true);
  const start = tail.getUint32(end + 16, true);
  const tailStart = file.size - tail.byteLength;
  if (tail.getUint32(end + 4, true) || tail.getUint16(end + 8, true) !== count ||
      count > 2048 || size > MIB || start + size > tailStart + end) {
    throw Error('Unsupported texture ZIP directory.');
  }
  const dir = new DataView(await file.slice(start, start + size).arrayBuffer());
  const entries = new Map();
  for (let i = 0, p = 0; i < count; i++) {
    if (p + 46 > size || dir.getUint32(p, true) !== 0x02014b50) throw Error('Invalid texture ZIP entry.');
    const length = dir.getUint16(p + 28, true);
    const next = p + 46 + length + dir.getUint16(p + 30, true) + dir.getUint16(p + 32, true);
    if (next > size) throw Error('Truncated texture ZIP directory.');
    const name = utf8.decode(new Uint8Array(dir.buffer, p + 46, length)).toLowerCase();
    if (entries.has(name)) throw Error('The texture ZIP has duplicate filenames.');
    entries.set(name, {
      flags: dir.getUint16(p + 8, true), method: dir.getUint16(p + 10, true),
      crc: dir.getUint32(p + 16, true), packed: dir.getUint32(p + 20, true),
      size: dir.getUint32(p + 24, true), offset: dir.getUint32(p + 42, true),
    });
    p = next;
  }
  return {entries, start};
}

async function zipEntry(file, directory, name, limit) {
  const entry = directory.entries.get(name.toLowerCase());
  if (!entry) throw Error('Missing texture pack file: ' + name);
  const {method, offset, size, packed, flags, crc: expected} = entry;
  if (size > limit || packed > limit || flags & 1 || (method !== 0 && method !== 8) ||
      offset + 30 > directory.start) throw Error('Unsupported texture ZIP entry: ' + name);
  const header = new DataView(await file.slice(offset, offset + 30).arrayBuffer());
  const start = offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  if (header.getUint32(0, true) !== 0x04034b50 || start + packed > directory.start ||
      header.getUint16(8, true) !== method || header.getUint16(6, true) !== flags) {
    throw Error('Invalid texture ZIP header: ' + name);
  }
  const contents = file.slice(start, start + packed);
  const stream = method === 0 ? contents.stream() :
    contents.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const bytes = new Uint8Array(size);
  const reader = stream.getReader();
  let position = 0;
  let crc = 0xffffffff;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (position + value.length > size) {
        await reader.cancel();
        throw Error('Texture ZIP entry exceeds its declared size.');
      }
      bytes.set(value, position);
      position += value.length;
      for (const byte of value) crc = crcByte(crc, byte);
    }
  } finally {
    reader.releaseLock();
  }
  if (position !== size || ((crc ^ 0xffffffff) >>> 0) !== expected) {
    throw Error('Texture ZIP entry checksum failed: ' + name);
  }
  return bytes;
}

const MODES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 14]);
const PAT_ROW = /^\s*([\da-f]{1,8})\s+([\da-f]{1,8})\s+(\d{1,2})\s+([\w.-]+\.png)\s*(?:\/\/.*)?$/i;

export async function loadTexturePack(file) {
  const directory = await zipDirectory(file);
  const pat = ['scripts/daytona.pat', 'daytona.pat'].find(name => directory.entries.has(name));
  if (!pat) throw Error('The ZIP needs a daytona.pat texture list.');
  const folder = pat.slice(0, -'daytona.pat'.length);
  const manifest = utf8.decode(await zipEntry(file, directory, pat, 256 * 1024));
  const tags = new Map();
  let count = 0, skipped = 0, duplicates = 0;
  for (const line of manifest.split(/\r?\n/)) {
    const row = PAT_ROW.exec(line);
    if (!row) continue;
    const id = parseInt(row[1], 16), crc = parseInt(row[2], 16), mode = Number(row[3]);
    const filename = (folder + row[4]).toLowerCase();
    const path = [filename, filename + '.png'].find(name => directory.entries.has(name));
    if (!path || !MODES.has(mode) || !(id & 0x4000) || (id & ~0x1fffe03f)) {
      skipped++;
      continue;
    }
    let variants = tags.get(id);
    if (!variants) tags.set(id, variants = new Map());
    // Model 2 Emulator keeps valid rows in file order and uses the first match.
    if (variants.has(crc)) {
      duplicates++;
      continue;
    }
    // stf999's lake clips to white under mode 14 at full track lighting.
    // Mode 3 retains the lake's color and uses the arcade luma table.
    const lake = id === 0x0810401b && crc === 0x58b5b0b6 &&
      row[4].toLowerCase() === 'du_adv_lake.png' && mode === 14;
    variants.set(crc, {path, mode: lake ? 3 : mode});
    count++;
  }
  if (!count) throw Error('No supported texture entries were found in daytona.pat.');
  return {
    name: file.name || 'Texture pack', tags, count, skipped, duplicates,
    async decode(path) {
      const png = await zipEntry(file, directory, path, 4 * MIB);
      return decodePng(png);
    },
  };
}

async function decodePng(png) {
  const view = new DataView(png.buffer);
  if (png.length < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw Error('Invalid replacement PNG.');
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 1024 || height > 1024) throw Error('Replacement PNG is too large.');
  const bitmap = await createImageBitmap(new Blob([png], {type: 'image/png'}));
  try {
    if (bitmap.width !== width || bitmap.height !== height) throw Error('Invalid replacement PNG dimensions.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    return {width, height, rgba};
  } finally {
    bitmap.close();
  }
}

// Model 2 Emulator's ID1 combines the base texture position, bank, dimensions
// and polygon type. For daytona, the engine's base texture addresses include
// the implicit high Y bit used by ElSemi's texture tags.
export function textureTag(flags, position) {
  const xy = ((position & 0xffff) >>> 5) | ((position >>> 21) << 6);
  const bank = (flags >>> 10) & 1;
  const kind = flags & 7;
  const size = ((flags >>> 17) & 7) | (((flags >>> 20) & 7) << 3);
  return 0x08000000 | (bank << 28) | (xy << 16) | (kind << 13) | size;
}

// ID2 is CRC-32 over twice the texture width in packed bytes per pair of
// texel rows, using the 1024-byte sheet stride, including adjacent bytes.
export function textureCRC(wasm, id) {
  const x = ((id >>> 16) & 31) * 32;
  const y = (((id >>> 22) & 31) * 32) + ((id & 0x00200000) ? 1024 : 0);
  const width = 32 << (id & 7), height = 32 << ((id >>> 3) & 7);
  const ptr = id & 0x10000000 ? wasm._daytona_tex1_ptr() : wasm._daytona_tex0_ptr();
  const start = ptr + (y >>> 1) * 1024 + x;
  const end = start + ((height >>> 1) - 1) * 1024 + width * 2;
  const heap = wasm.HEAPU8;
  if (!ptr || end > ptr + 0x200000 || end > heap.length) return null;
  let crc = 0xffffffff;
  for (let row = start; row <= end - width * 2; row += 1024) {
    for (let p = row; p < row + width * 2; p++) crc = crcByte(crc, heap[p]);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Split along the dimension with more spare room so elongated road and
// scenery images do not reserve square regions. Free siblings coalesce.
function atlasRoot(size) {
  return {x: 0, y: 0, width: size, height: size, parent: null, children: null, used: false};
}

function claim(node, width, height) {
  if (node.used || node.width < width || node.height < height) return null;
  if (!node.children) {
    if (node.width === width && node.height === height) {
      node.used = true;
      return node;
    }
    const horizontal = node.width / width >= node.height / height;
    const w = horizontal ? node.width / 2 : node.width;
    const h = horizontal ? node.height : node.height / 2;
    node.children = [0, 1].map(i => ({
      x: node.x + (horizontal ? i * w : 0), y: node.y + (horizontal ? 0 : i * h),
      width: w, height: h, parent: node, children: null, used: false,
    }));
  }
  for (const child of node.children) {
    const slot = claim(child, width, height);
    if (slot) return slot;
  }
  return null;
}

function release(slot) {
  slot.used = false;
  for (let parent = slot.parent; parent; parent = parent.parent) {
    if (parent.children.some(child => child.used || child.children)) break;
    parent.children = null;
  }
}

export function createTexturePackRenderer(size, upload, invalidate) {
  let pack, owner, generation;
  let root = atlasRoot(size), scratch = new Uint8Array(0);
  const loaded = new Map(), ready = new Map(), pending = new Map(), failed = new Set();
  const matched = new Map(), visible = new Set(), matches = new Map();
  const full = new Set();
  let lastVisible = new Set();
  const seen = new Set();

  function reset(next) {
    pack = next;
    root = atlasRoot(size);
    loaded.clear(); ready.clear(); pending.clear(); failed.clear();
    matched.clear(); seen.clear(); full.clear(); visible.clear(); lastVisible.clear();
  }

  function begin(wasm) {
    const nextGeneration = wasm._daytona_texture_generation();
    if (wasm !== owner || nextGeneration !== generation) {
      owner = wasm;
      generation = nextGeneration;
      matched.clear();
    }
    visible.clear();
    matches.clear();
  }

  function match(flags, position) {
    const id = textureTag(flags, position);
    if (!matched.has(id)) {
      const variants = pack.tags.get(id);
      matched.set(id, variants?.get(textureCRC(owner, id)) || null);
    }
    return matched.get(id);
  }

  function load(path) {
    if (pending.size >= 4 || pending.has(path) || failed.has(path) || full.has(path)) return;
    const source = pack;
    const request = source.decode(path);
    pending.set(path, request);
    request.then(image => {
      if (pending.get(path) === request) ready.set(path, image);
    }, () => {
      if (pending.get(path) === request) failed.add(path);
    }).finally(() => {
      if (pending.get(path) === request) {
        pending.delete(path);
        invalidate();
      }
    });
  }

  function uploadReady() {
    for (const [path, image] of ready) {
      ready.delete(path);
      if (!visible.has(path)) continue;
      const width = Math.max(16, 2 ** Math.ceil(Math.log2(image.width)));
      const height = Math.max(16, 2 ** Math.ceil(Math.log2(image.height)));
      let slot = claim(root, width, height);
      while (!slot) {
        const victim = [...loaded].find(([key]) => !visible.has(key));
        if (!victim) break;
        loaded.delete(victim[0]);
        release(victim[1].slot);
        slot = claim(root, width, height);
      }
      if (slot) {
        upload(slot.x, slot.y, image);
        loaded.set(path, {slot, width: image.width, height: image.height});
        seen.add(path);
      } else full.add(path);
    }
  }

  return {
    reset,
    resetMatches: () => matched.clear(),
    stats: () => ({seen: seen.size, resident: loaded.size, visible: visible.size,
      pending: pending.size + ready.size, failed: failed.size, deferred: full.size}),
    vertices(wasm, ptr, bytes) {
      const original = wasm.HEAPU8.subarray(ptr, ptr + bytes);
      if (!pack || !bytes) return original;
      begin(wasm);
      const words = new Uint32Array(original.buffer, original.byteOffset, bytes / 4);
      for (let i = 0; i < words.length; i += 48) {
        const flags = words[i + 10];
        if ((flags & 2) === 0) continue;
        const entry = match(flags, words[i + 11]);
        if (!entry) continue;
        visible.add(entry.path);
        matches.set(i, entry);
      }
      if (visible.size !== lastVisible.size || [...visible].some(path => !lastVisible.has(path))) {
        full.clear();
        lastVisible = new Set(visible);
      }
      uploadReady();
      for (const path of visible) {
        const image = loaded.get(path);
        if (image) {
          loaded.delete(path);
          loaded.set(path, image);
        } else load(path);
      }
      if (!matches.size || !loaded.size) return original;
      if (scratch.byteLength < bytes) scratch = new Uint8Array(Math.ceil(bytes / 65536) * 65536);
      scratch.set(original);
      const floats = new Float32Array(scratch.buffer);
      for (const [i, entry] of matches) {
        const image = loaded.get(entry.path);
        if (!image) continue;
        for (let v = i; v < i + 48; v += 16) {
          // Textured polygons do not use the vertex color. Its blue channel
          // normally lies in [0,1], leaving a negative value for width/mode.
          floats[v + 6] = image.slot.x;
          floats[v + 7] = image.slot.y;
          floats[v + 8] = -(image.width * 16 + entry.mode);
          floats[v + 9] = image.height;
        }
      }
      return scratch.subarray(0, bytes);
    },
  };
}
