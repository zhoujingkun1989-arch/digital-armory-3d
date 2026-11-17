/**
 * Zero-Dependency ISO/IEC 18004 QR Code Matrix & Crisp Single-Path SVG Generator
 * ------------------------------------------------------------------------------
 * Encodes UTF-8 strings (up to 192 bytes, Versions 1..8, ECC Level L, Byte Mode)
 * with full GF(256) Reed-Solomon error correction and 8-mask penalty evaluation,
 * rendering an infinite-DPI `<svg>` path for printed monograph back covers.
 */

interface QrVersionSpec {
  version: number;
  dataCodewords: number;
  ecPerBlock: number;
  numBlocks: number;
  alignCoords: readonly number[];
}

const QR_VERSIONS_L: readonly QrVersionSpec[] = [
  { version: 1, dataCodewords: 19, ecPerBlock: 7, numBlocks: 1, alignCoords: [] },
  { version: 2, dataCodewords: 34, ecPerBlock: 10, numBlocks: 1, alignCoords: [6, 18] },
  { version: 3, dataCodewords: 55, ecPerBlock: 15, numBlocks: 1, alignCoords: [6, 22] },
  { version: 4, dataCodewords: 80, ecPerBlock: 20, numBlocks: 1, alignCoords: [6, 26] },
  { version: 5, dataCodewords: 108, ecPerBlock: 26, numBlocks: 1, alignCoords: [6, 30] },
  { version: 6, dataCodewords: 136, ecPerBlock: 18, numBlocks: 2, alignCoords: [6, 34] },
  { version: 7, dataCodewords: 156, ecPerBlock: 20, numBlocks: 2, alignCoords: [6, 22, 38] },
  { version: 8, dataCodewords: 194, ecPerBlock: 24, numBlocks: 2, alignCoords: [6, 24, 42] },
];

// GF(256) log/exp lookup tables under primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildRsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeRsRemainder(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = buildRsGenerator(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

export function computeFormatBits(ecIndicator: number, mask: number): number {
  const data = ((ecIndicator & 0x03) << 3) | (mask & 0x07);
  let rem = data << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if ((rem >> bit) & 1) {
      rem ^= 0x537 << (bit - 10);
    }
  }
  return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let bit = 17; bit >= 12; bit--) {
    if ((rem >> bit) & 1) {
      rem ^= 0x1f25 << (bit - 12);
    }
  }
  return ((version << 12) | rem) & 0x3ffff;
}

function applyMaskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function evaluatePenalty(grid: readonly (readonly boolean[])[]): number {
  const n = grid.length;
  let score = 0;

  // N1: Adjacent runs >= 5 in rows & columns
  for (let r = 0; r < n; r++) {
    let runLen = 1;
    for (let c = 1; c < n; c++) {
      if (grid[r][c] === grid[r][c - 1]) {
        runLen++;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let c = 0; c < n; c++) {
    let runLen = 1;
    for (let r = 1; r < n; r++) {
      if (grid[r][c] === grid[r - 1][c]) {
        runLen++;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }

  // N2: 2x2 solid blocks
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // N4: Dark module balance
  let darkCount = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c]) darkCount++;
    }
  }
  const pct = (darkCount * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

export function encodeQrMatrix(text: string): boolean[][] {
  const rawBytes = new TextEncoder().encode(text);
  // Byte mode overhead: 4-bit mode + 8-bit length = 12 bits (1.5 bytes -> max dataCodewords - 2)
  const cappedBytes =
    rawBytes.length > 192 ? rawBytes.subarray(0, 192) : rawBytes;

  const spec =
    QR_VERSIONS_L.find((v) => cappedBytes.length <= v.dataCodewords - 2) ??
    QR_VERSIONS_L[QR_VERSIONS_L.length - 1];

  const bits: number[] = [];
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode 0100 (Byte) + 8-bit byte count
  pushBits(0b0100, 4);
  pushBits(cappedBytes.length, 8);
  for (let i = 0; i < cappedBytes.length; i++) {
    pushBits(cappedBytes[i], 8);
  }

  const capacityBits = spec.dataCodewords * 8;
  const termCount = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < termCount; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) {
      b = (b << 1) | bits[i * 8 + k];
    }
    dataBytes[i] = b;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.dataCodewords; i++, p++) {
    dataBytes[i] = padBytes[p & 1];
  }

  // Split into blocks & interleave codewords
  const blockDataLen = spec.dataCodewords / spec.numBlocks;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0; b < spec.numBlocks; b++) {
    const slice = dataBytes.subarray(b * blockDataLen, (b + 1) * blockDataLen);
    dataBlocks.push(slice);
    ecBlocks.push(computeRsRemainder(slice, spec.ecPerBlock));
  }

  const allCodewords: number[] = [];
  for (let i = 0; i < blockDataLen; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      allCodewords.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      allCodewords.push(ecBlocks[b][i]);
    }
  }

  const size = 17 + 4 * spec.version;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  // Finder patterns + 1-cell white separators
  const drawFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = topR + dr;
        const cc = leftC + dc;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onRing = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(rr, cc, inOuter && (onRing || inCore));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const ac = spec.alignCoords;
  for (let i = 0; i < ac.length; i++) {
    for (let j = 0; j < ac.length; j++) {
      const cr = ac[i];
      const cc = ac[j];
      if (
        (cr === 6 && cc === 6) ||
        (cr === 6 && cc === ac[ac.length - 1]) ||
        (cr === ac[ac.length - 1] && cc === 6)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }

  // Dark module & reserve format info slots
  setFunc(size - 8, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 8 + i] = true;
    if (i < 7) isFunction[size - 1 - i][8] = true;
  }

  // Version info for Version >= 7
  if (spec.version >= 7) {
    const vBits = computeVersionBits(spec.version);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        const dark = ((vBits >> (r * 3 + c)) & 1) === 1;
        setFunc(r, size - 11 + c, dark);
        setFunc(size - 11 + c, r, dark);
      }
    }
  }

  // Upward/downward 2-column zigzag codeword bit placement
  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5; // Skip vertical timing line
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = rightCol - dc;
        if (isFunction[r][c]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          const byteVal = allCodewords[bitIdx >> 3];
          dark = ((byteVal >> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        modules[r][c] = dark;
      }
    }
    upward = !upward;
  }

  const writeFormatInfo = (target: boolean[][], mask: number) => {
    // ECC Level L format indicator = 0b01
    const fBits = computeFormatBits(0b01, mask);
    const tlCoords: [number, number][] = [
      [8, 0],
      [8, 1],
      [8, 2],
      [8, 3],
      [8, 4],
      [8, 5],
      [8, 7],
      [8, 8],
      [7, 8],
      [5, 8],
      [4, 8],
      [3, 8],
      [2, 8],
      [1, 8],
      [0, 8],
    ];
    for (let idx = 0; idx < 15; idx++) {
      const dark = ((fBits >> (14 - idx)) & 1) === 1;
      const [tr, tc] = tlCoords[idx];
      target[tr][tc] = dark;
    }
    for (let i = 0; i < 7; i++) {
      target[size - 1 - i][8] = ((fBits >> (14 - i)) & 1) === 1;
    }
    for (let j = 0; j < 8; j++) {
      target[8][size - 8 + j] = ((fBits >> (7 - j)) & 1) === 1;
    }
  };

  let bestGrid: boolean[][] = modules;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row, r) =>
      row.map((val, c) =>
        isFunction[r][c] ? val : val !== applyMaskBit(mask, r, c)
      )
    );
    writeFormatInfo(candidate, mask);
    const score = evaluatePenalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestGrid = candidate;
    }
  }

  return bestGrid;
}

export function buildQrSvgPath(
  matrix: readonly (readonly boolean[])[],
  quietZone = 2
): { pathD: string; viewSize: number } {
  const n = matrix.length;
  const viewSize = n + quietZone * 2;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!matrix[r][c]) {
        c++;
        continue;
      }
      let span = 1;
      while (c + span < n && matrix[r][c + span]) {
        span++;
      }
      parts.push(`M${c + quietZone} ${r + quietZone}h${span}v1h-${span}z`);
      c += span;
    }
  }
  return { pathD: parts.join(''), viewSize };
}
