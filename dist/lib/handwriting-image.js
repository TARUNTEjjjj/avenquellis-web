/** Limits shared by the local photo chooser and the fixed Workers AI transcription endpoint. */
export const handwritingLimits = Object.freeze({
  sourceBytes: 12 * 1024 * 1024, sourcePixels: 24_000_000, sourceEdge: 8192,
  uploadBytes: 1536 * 1024, uploadEdge: 1600, maxText: 12000,
});

const invalid = () => {throw new Error('This image is damaged or unsupported. Choose a JPEG, PNG or WebP photo.');};
const u16 = (data, i) => data[i] * 256 + data[i + 1];
const ascii = (data, i, count) => String.fromCharCode(...data.subarray(i, i + count));

/** Read JPEG frame dimensions and optionally remove all APP/COM segments (EXIF, GPS and thumbnails). */
export function inspectJpeg(data, removeMetadata = false) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) invalid();
  let pos = 2, kept = 0, width = 0, height = 0, segments = 0, scanning = false, sawScan = false;
  const parts = [];
  while (pos < data.length) {
    if (scanning) {
      const prefix = data.indexOf(0xff, pos);
      if (prefix < 0) invalid();
      let end = prefix + 1;
      while (data[end] === 0xff) end++;
      if (end >= data.length) invalid();
      const marker = data[end];
      if (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)) {pos = end + 1; continue;}
      pos = prefix; scanning = false;
    }
    if (++segments > 1024) invalid();
    const start = pos;
    if (data[pos++] !== 0xff) invalid();
    while (data[pos] === 0xff) pos++;
    if (pos >= data.length) invalid();
    const marker = data[pos++];
    if (marker === 0xd9) {
      if (!width || !height || !sawScan || (removeMetadata && pos !== data.length)) invalid();
      if (!removeMetadata) return {width, height, type:'image/jpeg'};
      parts.push(data.subarray(kept, pos));
      const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
      let offset = 0;
      for (const part of parts) {bytes.set(part, offset); offset += part.length;}
      return {width, height, type:'image/jpeg', bytes};
    }
    if (marker < 0xc0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || pos + 2 > data.length) invalid();
    const length = u16(data,pos), end = pos + length;
    if (length < 2 || end > data.length) invalid();
    if ([0xc0,0xc1,0xc2].includes(marker)) {
      if (width || length < 11 || length !== 8 + 3 * data[pos + 7]) invalid();
      height = u16(data,pos + 3); width = u16(data,pos + 5);
      if (!width || !height) invalid();
    } else if (marker === 0xda) {
      if (!width || length < 8 || length !== 6 + 2 * data[pos + 2]) invalid();
      scanning = true; sawScan = true;
    } else if (removeMetadata && ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) {
      if(kept<start)parts.push(data.subarray(kept,start));
      kept = end;
    } else if (![0xc4,0xdb,0xdd].includes(marker) && !(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
      invalid();
    }
    pos = end;
  }
  invalid();
}

/** Limit decoded pixel count before asking the browser to allocate a bitmap. */
export function inspectPhoto(data) {
  if (!(data instanceof Uint8Array) || data.length > handwritingLimits.sourceBytes) invalid();
  let info;
  if (data[0] === 0xff && data[1] === 0xd8) info = inspectJpeg(data);
  else if (data.length >= 33 && [137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v) && ascii(data,12,4)==='IHDR') {
    const view = new DataView(data.buffer,data.byteOffset,data.byteLength);
    if (view.getUint32(8) !== 13) invalid();
    info = {type:'image/png',width:view.getUint32(16),height:view.getUint32(20)};
  } else if (data.length >= 30 && ascii(data,0,4)==='RIFF' && ascii(data,8,4)==='WEBP') {
    const type = ascii(data,12,4);
    const view = new DataView(data.buffer,data.byteOffset,data.byteLength);
    if (view.getUint32(4,true) + 8 !== data.length) invalid();
    if (type === 'VP8X' && !(data[20] & 2)) {
      info = {type:'image/webp',width:1 + data[24] + (data[25]<<8) + (data[26]<<16),height:1 + data[27] + (data[28]<<8) + (data[29]<<16)};
    } else if (type === 'VP8 ' && data[23]===0x9d && data[24]===1 && data[25]===0x2a) {
      info={type:'image/webp',width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff};
    } else if (type==='VP8L' && data[20]===0x2f) {
      const packed=view.getUint32(21,true);info={type:'image/webp',width:1+(packed&0x3fff),height:1+((packed>>>14)&0x3fff)};
    }
  }
  if (!info?.width || !info.height) invalid();
  if (Math.max(info.width,info.height)>handwritingLimits.sourceEdge || info.width*info.height>handwritingLimits.sourcePixels) {
    throw new Error('This photo is too large to open safely. Crop one page and try again (up to 24 megapixels).');
  }
  return info;
}
