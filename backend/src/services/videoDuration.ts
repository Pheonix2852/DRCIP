// Minimal dependency-free duration extraction for the two allowed video
// containers (MP4/ISO-BMFF and WebM/EBML). Returns seconds as a float.
// Throws when the duration cannot be determined so callers can fail closed
// rather than silently accept an unknown-length video.
import { Buffer } from 'buffer';

function readU32(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

export function mp4Duration(data: Buffer): number {
  const total = data.length;
  let off = 0;

  while (off + 8 <= total) {
    let size = readU32(data, off);
    const type = data.toString('ascii', off + 4, off + 8);
    let headerLen = 8;
    if (size === 1) {
      // 64-bit largesize
      size = Number(data.readBigUInt64BE(off + 8));
      headerLen = 16;
    } else if (size === 0) {
      size = total - off; // box extends to EOF
    }
    if (size < headerLen || off + size > total) return NaN;

    if (type === 'moov') {
      const duration = mvhdDuration(data, off + headerLen, off + size);
      if (duration > 0) return duration;
    }
    off += size;
  }
  return NaN;
}

function mvhdDuration(data: Buffer, start: number, end: number): number {
  let off = start;
  while (off + 8 <= end) {
    const size = readU32(data, off);
    const type = data.toString('ascii', off + 4, off + 8);
    if (size < 8 || off + size > end) return NaN;
    if (type === 'mvhd') {
      const version = data[off + 8];
      let timescale = 0;
      let duration = 0;
      if (version === 1) {
        timescale = readU32(data, off + 8 + 20);
        duration = Number(data.readBigUInt64BE(off + 8 + 24));
      } else {
        timescale = readU32(data, off + 8 + 12);
        duration = readU32(data, off + 8 + 16);
      }
      if (timescale > 0) return duration / timescale;
      return NaN;
    }
    off += size;
  }
  return NaN;
}

export interface EbmlElement {
  id: number;
  size: number;
  dataStart: number;
  headerLen: number;
}

// EBML element IDs are stored as a big-endian integer whose length is implied
// by the leading zero bits of the first byte; the marker bits ARE part of the
// ID value (e.g. Segment = 0x18538067). Sizes drop the marker bits.
function ebmlLength(first: number): number {
  let len = 1;
  for (let mask = 0x80; len <= 8; mask >>= 1, len += 1) {
    if ((first & mask) !== 0) break;
  }
  return len;
}

function readId(data: Buffer, off: number): { value: number; len: number } {
  const len = ebmlLength(data[off]);
  let value = 0;
  for (let i = 0; i < len; i += 1) value = value * 256 + data[off + i];
  return { value, len };
}

function readSize(data: Buffer, off: number): { value: number; len: number } {
  const first = data[off];
  const len = ebmlLength(first);
  let value = first & ((1 << (8 - len)) - 1); // drop the marker bit
  for (let i = 1; i < len; i += 1) {
    value = value * 256 + data[off + i];
  }
  return { value, len };
}

export function nextElement(data: Buffer, off: number, total: number): EbmlElement | null {
  if (off >= total) return null;
  const id = readId(data, off);
  const size = readSize(data, off + id.len);
  const dataStart = off + id.len + size.len;
  if (dataStart + size.value > total) return null;
  return { id: id.value, size: size.value, dataStart, headerLen: id.len + size.len };
}

export function webmDuration(data: Buffer): number {
  const total = data.length;

  // WebM starts with the EBML header (0x1A45DFA3); scan top-level elements
  // until the single Segment (0x18538067) is found.
  let cursor = 0;
  let segment: EbmlElement | null = null;
  while (cursor < total) {
    const el = nextElement(data, cursor, total);
    if (!el) return NaN;
    if (el.id === 0x18538067) {
      segment = el;
      break;
    }
    cursor = el.dataStart + el.size;
  }
  if (!segment) return NaN;

  let infoStart = -1;
  let infoEnd = -1;
  let el = nextElement(data, segment.dataStart, segment.dataStart + segment.size);
  while (el) {
    if (el.id === 0x1549a966) {
      infoStart = el.dataStart;
      infoEnd = el.dataStart + el.size;
      break;
    }
    el = nextElement(data, el.dataStart + el.size, segment.dataStart + segment.size);
  }
  if (infoStart < 0) return NaN;

  let timecodeScale = 1000000; // nanoseconds per tick (EBML default)
  let duration: number | null = null;
  let inner = nextElement(data, infoStart, infoEnd);
  while (inner) {
    if (inner.id === 0x2ad7b1) {
      // TimecodeScale (uint) — read exactly `size` bytes
      let v = 0;
      for (let i = 0; i < inner.size; i += 1) v = v * 256 + data[inner.dataStart + i];
      if (v > 0) timecodeScale = v;
    } else if (inner.id === 0x4489) {
      // Duration (float, in TimecodeScale ticks)
      duration = inner.size <= 4
        ? data.readFloatBE(inner.dataStart)
        : data.readDoubleBE(inner.dataStart);
    }
    inner = nextElement(data, inner.dataStart + inner.size, infoEnd);
  }

  if (duration === null) return NaN;
  return (duration * timecodeScale) / 1e9;
}

export function videoDurationSeconds(data: Buffer, mimeType: string): number {
  if (mimeType === 'video/mp4') return mp4Duration(data);
  if (mimeType === 'video/webm') return webmDuration(data);
  return NaN;
}