import { BastExtractedRow, ProposalExtractedRow } from './troubleshootingReconciler';

export interface LocalProposalPdfParseResult {
  documentTitle: string;
  rows: ProposalExtractedRow[];
  summaryPengelola: { name: string; count: number }[];
  totalTextItems: number;
}

export interface LocalBastPdfParseResult {
  documentTitle: string;
  rows: BastExtractedRow[];
  totalTextItems: number;
}

interface PdfTextItem {
  s: string;
  x: number;
  y: number;
  w: number;
  page: number;
}

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions) {
        try {
          const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
          if (workerMod && typeof workerMod.default === 'string' && workerMod.default) {
            pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
          }
        } catch {
          // Fallback if worker URL cannot be resolved; pdfjs will fall back to main thread
        }
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function loadPdfDocument(bytes: Uint8Array) {
  const pdfjs = await getPdfjs();
  const dataCopy = new Uint8Array(bytes);
  const loadingTask = pdfjs.getDocument({
    data: dataCopy,
    useWorkerFetch: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  return {
    pdfjs,
    doc,
    destroy: async () => {
      try {
        await loadingTask.destroy();
      } catch {
        // ignore cleanup error
      }
    },
  };
}

function multiplyMatrix(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function clusterValues(vals: number[], tol = 2.5): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (!out.length || v - out[out.length - 1] > tol) {
      out.push(v);
    }
  }
  return out;
}

interface HSegment {
  y: number;
  xL: number;
  xR: number;
}

interface HBandsMeta {
  y: number;
  minX: number;
  maxX: number;
  span: number;
}

function clusterHSegments(segments: HSegment[], minSpan: number, tol = 2.5): HBandsMeta[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.y - b.y);
  const clusters: { ySum: number; count: number; minX: number; maxX: number; lastY: number }[] = [];

  for (const seg of sorted) {
    const prev = clusters[clusters.length - 1];
    if (prev && seg.y - prev.lastY <= tol) {
      prev.ySum += seg.y;
      prev.count += 1;
      prev.lastY = seg.y;
      if (seg.xL < prev.minX) prev.minX = seg.xL;
      if (seg.xR > prev.maxX) prev.maxX = seg.xR;
    } else {
      clusters.push({
        ySum: seg.y,
        count: 1,
        minX: seg.xL,
        maxX: seg.xR,
        lastY: seg.y,
      });
    }
  }

  return clusters
    .map((c) => ({
      y: c.ySum / c.count,
      minX: c.minX,
      maxX: c.maxX,
      span: c.maxX - c.minX,
    }))
    .filter((c) => c.span >= minSpan);
}

async function extractPageGeometry(
  page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }> },
  vpHeight: number,
  minHWidth: number,
  OPS: PdfjsModule['OPS']
): Promise<{ hLines: number[]; hBandsMeta: HBandsMeta[]; vLines: number[] }> {
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const apply = (x: number, y: number): [number, number] => [
    ctm[0] * x + ctm[2] * y + ctm[4],
    ctm[1] * x + ctm[3] * y + ctm[5],
  ];

  const rawHSegments: HSegment[] = [];
  const rawVLines: number[] = [];

  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];

    if (fn === OPS.save) {
      stack.push(ctm.slice());
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      ctm = multiplyMatrix(ctm, args as number[]);
    } else if (fn === OPS.constructPath && Array.isArray(args)) {
      const pathArr =
        Array.isArray(args[1]) && args[1][0] && typeof (args[1][0] as ArrayLike<number>).length === 'number'
          ? (args[1][0] as ArrayLike<number>)
          : null;
      if (!pathArr) continue;

      let k = 0;
      let cx = 0;
      let cy = 0;
      let sx = 0;
      let sy = 0;

      while (k < pathArr.length) {
        const op = pathArr[k++];
        if (op === 0) {
          // moveTo
          const [px, py] = apply(pathArr[k++], pathArr[k++]);
          cx = px;
          cy = py;
          sx = px;
          sy = py;
        } else if (op === 1) {
          // lineTo
          const [nx, ny] = apply(pathArr[k++], pathArr[k++]);
          if (Math.abs(ny - cy) < 1 && Math.abs(nx - cx) > 12) {
            rawHSegments.push({
              y: vpHeight - (ny + cy) / 2,
              xL: Math.min(cx, nx),
              xR: Math.max(cx, nx),
            });
          }
          if (Math.abs(nx - cx) < 1 && Math.abs(ny - cy) > 8) {
            rawVLines.push((cx + nx) / 2);
          }
          cx = nx;
          cy = ny;
        } else if (op === 2) {
          // curveTo
          k += 6;
        } else if (op === 3) {
          // quadraticCurveTo
          k += 4;
        } else if (op === 4) {
          // closePath
          if (Math.abs(sy - cy) < 1 && Math.abs(sx - cx) > 12) {
            rawHSegments.push({
              y: vpHeight - (sy + cy) / 2,
              xL: Math.min(cx, sx),
              xR: Math.max(cx, sx),
            });
          }
          if (Math.abs(sx - cx) < 1 && Math.abs(sy - cy) > 8) {
            rawVLines.push((cx + sx) / 2);
          }
          cx = sx;
          cy = sy;
        } else if (op === 5) {
          // rectangle
          const x = pathArr[k++];
          const y = pathArr[k++];
          const w = pathArr[k++];
          const h = pathArr[k++];
          const [px1, py1] = apply(x, y);
          const [px2, py2] = apply(x + w, y + h);
          const yTop = Math.min(vpHeight - py1, vpHeight - py2);
          const yBot = Math.max(vpHeight - py1, vpHeight - py2);
          const xL = Math.min(px1, px2);
          const xR = Math.max(px1, px2);

          if (xR - xL > 12 && yBot - yTop > 8) {
            rawVLines.push(xL, xR);
            rawHSegments.push({ y: yTop, xL, xR }, { y: yBot, xL, xR });
          } else if (xR - xL > 12 && yBot - yTop <= 3) {
            rawHSegments.push({ y: (yTop + yBot) / 2, xL, xR });
          } else if (yBot - yTop > 8 && xR - xL <= 3) {
            rawVLines.push((xL + xR) / 2);
          }
        } else {
          break;
        }
      }
    }
  }

  const hBandsMeta = clusterHSegments(rawHSegments, minHWidth, 2.5);
  return {
    hLines: hBandsMeta.map((m) => m.y),
    hBandsMeta,
    vLines: clusterValues(rawVLines, 2.5),
  };
}

function isBastHeaderBand(band: PdfTextItem[]): boolean {
  const hasNo = band.some((t) => /^NO\.?$/i.test(t.s));
  const hasNama = band.some((t) => /^NAMA(\s+PENERIMA|\s+KPM)?$/i.test(t.s));
  const hasNikOrBarang = band.some(
    (t) =>
      /^NIK(\s+KTP)?$/i.test(t.s) ||
      /^(NAMA\s+|JENIS\s+|URAIAN\s+)?(BARANG|BANTUAN)(\s+BANTUAN)?$/i.test(t.s)
  );
  if (hasNo && (hasNama || hasNikOrBarang)) return true;

  // Sub-header nomor kolom seperti: 1 | 2 | 3 | 4 | 5 | 6 atau (1) | (2) | (3)
  if (band.length >= 4 && band.length <= 10) {
    const colNums = band
      .map((t) => t.s.replace(/[().]/g, '').trim())
      .map((s) => (/^\d{1,2}$/.test(s) ? Number(s) : NaN));
    if (colNums.every((n) => Number.isFinite(n) && n >= 1 && n <= 12)) {
      const sorted = [...colNums].sort((a, b) => a - b);
      const isSequential = sorted.every((n, i) => n === i + 1);
      if (isSequential) return true;
    }
  }
  return false;
}

function isBastFooterOrTitleBand(band: PdfTextItem[]): boolean {
  const joined = band
    .map((t) => t.s)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!joined) return true;

  // Jangan pernah membuang band yang jelas berisi NIK 14-18 digit atau nama barang BAST
  const hasNik = band.some((t) => /^\d{14,18}$/.test(t.s.replace(/\s+/g, '')));
  if (hasNik) return false;
  if (
    /\b(KOMPOR|PANCI|OVEN|MIXER|MIKSER|TEFLON|SELANG|REGULATOR|DISPENSER|RICE\s+COOKER|MAGIC\s*COM|MESIN\s+JAHIT|MESIN\s+CUCI|KERANJANG|GERINDA|POTONG\s+PAPAN|SERUT|AMPLAS|MESIN\s+BOR|CUP\s+ES|TERMOS|TEKO\s+SIUL|BLENDER|POTONG\s+RUMPUT|CHAINSAW|SEMPROT|TENDA|KURSI|LEMARI\s+ES|KULKAS)\b/i.test(
      joined
    )
  ) {
    return false;
  }

  if (
    /^(HALAMAN|PAGE)\s+\d+/i.test(joined) ||
    /^(MENGETAHUI|KEPALA\s+DINAS|PEJABAT|PIHAK\s+(KESATU|KEDUA|PERTAMA)|LAMPIRAN|BERITA\s+ACARA|PEMERINTAH\s+KOTA|DINAS\s+SOSIAL)/i.test(
      joined
    ) ||
    /\b(KEPALA\s+DINAS|PEJABAT\s+PEMBUAT|MENGETAHUI|YANG\s+MENERIMA|YANG\s+MENYERAHKAN)\b/i.test(
      joined
    ) ||
    /\bNIP\.?\s*\d{8,}/i.test(joined) ||
    /^(JUMLAH|TOTAL)(\s+KESELURUHAN)?\b/i.test(joined)
  ) {
    return true;
  }
  // Nomor halaman tunggal di bawah halaman
  if (band.length === 1 && /^\d{1,3}$/.test(joined)) {
    return true;
  }
  return false;
}

function extractBastBandNo(band: PdfTextItem[], noMaxX: number): number | null {
  for (const t of band) {
    if (t.x > noMaxX + 5) continue;
    const merged = t.s.match(/^(\d{1,4})\s+(.+)$/);
    if (merged) {
      const n = Number(merged[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    if (/^\d{1,4}$/.test(t.s)) {
      const n = Number(t.s);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

interface BastPageBand {
  items: PdfTextItem[];
  isOpenTop: boolean;
  isOpenBottom: boolean;
}

function findVerticalDividerBetween(
  vLines: number[],
  leftEdge: number,
  rightEdge: number,
  fallback: number,
  prefer: 'leftmost' | 'rightmost'
): number {
  const candidates = vLines.filter((x) => x >= leftEdge - 2 && x <= rightEdge + 2);
  if (candidates.length === 0) return fallback;
  return prefer === 'leftmost' ? candidates[0] : candidates[candidates.length - 1];
}

export async function parseBastPdfLocally(
  bytes: Uint8Array,
  fileName: string
): Promise<LocalBastPdfParseResult> {
  const { pdfjs, doc, destroy } = await loadPdfDocument(bytes);

  let documentTitle = '';
  let totalTextItems = 0;
  let colBounds: {
    noMaxX: number;
    namaMaxX: number;
    alamatMaxX: number;
    barangMaxX: number;
  } | null = null;

  const allBands: BastPageBand[] = [];

  try {
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();

      const textItems: PdfTextItem[] = [];
      for (const rawItem of tc.items) {
        if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
        const clean = rawItem.str.replace(/\s+/g, ' ').trim();
        if (!clean) continue;
        textItems.push({
          s: clean,
          x: rawItem.transform[4],
          y: vp.height - rawItem.transform[5],
          w: rawItem.width,
          page: p,
        });
      }

      totalTextItems += textItems.length;
      if (textItems.length === 0) continue;

      const { hLines, hBandsMeta, vLines } = await extractPageGeometry(
        page,
        vp.height,
        180,
        pdfjs.OPS
      );

      const pageNoHdr = textItems.find((t) => /^NO\.?$/i.test(t.s));
      const pageNamaHdr = textItems.find((t) => /^NAMA(\s+PENERIMA|\s+KPM)?$/i.test(t.s));
      const pageHasHeader = Boolean(
        pageNoHdr && pageNamaHdr && Math.abs(pageNoHdr.y - pageNamaHdr.y) < 18
      );
      const pageHeaderY = pageHasHeader && pageNoHdr ? pageNoHdr.y : null;

      if (!colBounds) {
        const noHdr = pageNoHdr;
        const namaHdr = pageNamaHdr;
        const nikHdr = textItems.find((t) => /^NIK(\s+KTP)?$/i.test(t.s));
        const alamatHdr = textItems.find((t) => /^ALAMAT(\s+LENGKAP)?$/i.test(t.s));
        const barangHdr = textItems.find((t) =>
          /^(NAMA\s+|JENIS\s+|URAIAN\s+)?(BARANG|BANTUAN)(\s+BANTUAN)?$/i.test(t.s)
        );
        const volHdr = textItems.find((t) => /^(VOLUME|VOL\.?|JUMLAH|QTY|SATUAN|HARGA)$/i.test(t.s));

        if (noHdr && namaHdr && alamatHdr && barangHdr) {
          const headerY = noHdr.y;
          if (p === 1 && !documentTitle) {
            const titleLines = textItems
              .filter((t) => t.y < headerY - 12)
              .sort((a, b) => a.y - b.y || a.x - b.x)
              .map((t) => t.s);
            if (titleLines.length > 0) {
              documentTitle = titleLines.slice(0, 2).join(' — ');
            }
          }

          const fallbackNoMaxX = (noHdr.x + noHdr.w + namaHdr.x) / 2 - 5;
          const fallbackNamaMaxX = nikHdr
            ? (namaHdr.x + namaHdr.w + nikHdr.x) / 2 - 8
            : (namaHdr.x + namaHdr.w + alamatHdr.x) / 2 - 10;
          const fallbackAlamatMaxX = (alamatHdr.x + alamatHdr.w + barangHdr.x) / 2 - 5;
          const fallbackBarangMaxX = volHdr ? (barangHdr.x + barangHdr.w + volHdr.x) / 2 : vp.width;

          const nextAfterNamaX = nikHdr ? nikHdr.x : alamatHdr.x;
          colBounds = {
            noMaxX: findVerticalDividerBetween(
              vLines,
              noHdr.x + noHdr.w,
              namaHdr.x,
              fallbackNoMaxX,
              'leftmost'
            ),
            namaMaxX: findVerticalDividerBetween(
              vLines,
              namaHdr.x + namaHdr.w,
              nextAfterNamaX,
              fallbackNamaMaxX,
              'leftmost'
            ),
            alamatMaxX: findVerticalDividerBetween(
              vLines,
              alamatHdr.x + alamatHdr.w,
              barangHdr.x,
              fallbackAlamatMaxX,
              'rightmost'
            ),
            barangMaxX: volHdr
              ? findVerticalDividerBetween(
                  vLines,
                  barangHdr.x + barangHdr.w,
                  volHdr.x,
                  fallbackBarangMaxX,
                  'rightmost'
                )
              : vp.width,
          };
        }
      }

      let pageBands: BastPageBand[] = [];

      // Pilih hanya garis horizontal selebar tabel (yang mencakup kolom NO di sisi kiri),
      // agar garis sub-baris internal khusus di kolom BARANG tidak memotong 1 KPM menjadi 2 baris!
      const tableMaxSpan = hBandsMeta.reduce((acc, m) => Math.max(acc, m.span), 0);
      const minRowLineSpan = Math.max(200, tableMaxSpan * 0.55);
      const fullRowHLines = hBandsMeta
        .filter(
          (m) =>
            m.span >= minRowLineSpan &&
            (!colBounds || m.minX <= colBounds.noMaxX + 28)
        )
        .map((m) => m.y);
      const effectiveHLines = colBounds ? fullRowHLines : hLines;

      if (effectiveHLines.length >= 2 || (effectiveHLines.length === 1 && p > 1 && colBounds)) {
        // 1. Leading band di atas garis horizontal penuh pertama:
        //    Sangat krusial untuk halaman lanjutan (p > 1) tanpa header berulang, di mana baris KPM
        //    yang terpotong page break (mis. No. 63 AFRIANI) tidak punya garis tutup atas!
        if (p > 1 && !pageHasHeader) {
          const leadingItems = textItems.filter((t) => t.y < effectiveHLines[0] - 0.5);
          if (leadingItems.length > 0 && !isBastFooterOrTitleBand(leadingItems)) {
            pageBands.push({ items: leadingItems, isOpenTop: true, isOpenBottom: false });
          }
        }

        // 2. Band tertutup di antara dua garis horizontal penuh
        for (let b = 0; b < effectiveHLines.length - 1; b += 1) {
          const y0 = effectiveHLines[b];
          const y1 = effectiveHLines[b + 1];
          // Jika halaman memiliki judul di atas header, abaikan teks di atas baris header
          if (pageHeaderY !== null && y1 < pageHeaderY - 4) continue;
          const band = textItems.filter((t) => t.y >= y0 - 0.5 && t.y < y1 - 0.5);
          if (band.length > 0) {
            pageBands.push({ items: band, isOpenTop: false, isOpenBottom: false });
          }
        }

        // 3. Trailing band di bawah garis horizontal penuh terakhir:
        //    Menangkap awal baris KPM baru yang terpotong page break (mis. KOMPOR 1000 & PANCI 30 CM
        //    di bawah garis tutup No. 62, yang lanjutannya No. 63 AFRIANI ada di halaman berikutnya).
        const trailingItems = textItems.filter(
          (t) => t.y >= effectiveHLines[effectiveHLines.length - 1] - 0.5
        );
        if (trailingItems.length > 0 && !isBastFooterOrTitleBand(trailingItems)) {
          pageBands.push({ items: trailingItems, isOpenTop: false, isOpenBottom: true });
        }
      } else if (colBounds) {
        // Fallback untuk BAST tanpa garis border horizontal: kelompokkan menurut anchor NO
        const sortedItems = [...textItems].sort((a, b) => a.y - b.y || a.x - b.x);
        const noAnchors = sortedItems.filter(
          (t) =>
            t.x <= colBounds!.noMaxX + 6 &&
            (/^\d{1,4}$/.test(t.s) || /^\d{1,4}\s+[A-Z]/i.test(t.s))
        );
        if (noAnchors.length > 0) {
          const preAnchor = sortedItems.filter((t) => t.y < noAnchors[0].y - 8);
          if (preAnchor.length > 0 && !isBastFooterOrTitleBand(preAnchor)) {
            pageBands.push({ items: preAnchor, isOpenTop: p > 1, isOpenBottom: false });
          }
          for (let i = 0; i < noAnchors.length; i += 1) {
            const prevY =
              i === 0 ? noAnchors[0].y - 8 : (noAnchors[i - 1].y + noAnchors[i].y) / 2;
            const nextY =
              i === noAnchors.length - 1 ? Infinity : (noAnchors[i].y + noAnchors[i + 1].y) / 2;
            const band = sortedItems.filter((t) => t.y >= prevY && t.y < nextY);
            if (band.length > 0) {
              pageBands.push({
                items: band,
                isOpenTop: false,
                isOpenBottom: i === noAnchors.length - 1,
              });
            }
          }
        } else if (p > 1 && !isBastFooterOrTitleBand(sortedItems)) {
          pageBands.push({ items: sortedItems, isOpenTop: true, isOpenBottom: true });
        }
      }

      // Buang band header berulang / nomor kolom / judul / footer halaman
      pageBands = pageBands.filter(
        (band) => !isBastHeaderBand(band.items) && !isBastFooterOrTitleBand(band.items)
      );

      // Gabungkan baris yang terpotong pindah halaman (page break):
      // - Kasus A (seperti No. 63): bawah hal. p punya sebagian barang (isOpenBottom, no=null),
      //   atas hal. p+1 punya no=63, nama, dan sisa barang (isOpenTop, no=63) -> gabung jadi 1 baris No. 63!
      // - Kasus B (sebaliknya): bawah hal. p punya no & nama (isOpenBottom, no=61),
      //   atas hal. p+1 punya sisa alamat/barang (isOpenTop, no=null) -> gabung jadi 1 baris No. 61!
      if (p > 1 && allBands.length > 0 && pageBands.length > 0 && colBounds) {
        const prevBand = allBands[allBands.length - 1];
        const firstBand = pageBands[0];
        const prevNo = extractBastBandNo(prevBand.items, colBounds.noMaxX);
        const firstNo = extractBastBandNo(firstBand.items, colBounds.noMaxX);

        const canMergeSameOrSplit =
          prevNo === null || firstNo === null || prevNo === firstNo;
        const shouldMergeAcrossPage =
          canMergeSameOrSplit &&
          ((prevBand.isOpenBottom && firstBand.isOpenTop) ||
            (prevBand.isOpenBottom && prevNo === null && firstNo !== null) ||
            (firstNo === null && prevNo !== null) ||
            (prevNo !== null && firstNo !== null && prevNo === firstNo));

        if (shouldMergeAcrossPage) {
          pageBands.shift();
          allBands[allBands.length - 1] = {
            items: [...prevBand.items, ...firstBand.items],
            isOpenTop: prevBand.isOpenTop,
            isOpenBottom: firstBand.isOpenBottom,
          };
        }
      }

      for (const band of pageBands) {
        allBands.push(band);
      }
    }
  } finally {
    await destroy();
  }

  if (!colBounds) {
    return {
      documentTitle: documentTitle || fileName.replace(/\.pdf$/i, ''),
      rows: [],
      totalTextItems,
    };
  }

  const rows: BastExtractedRow[] = [];

  for (const bandObj of allBands) {
    const band = bandObj.items;
    if (band.length === 0 || isBastHeaderBand(band) || isBastFooterOrTitleBand(band)) continue;

    let noVal: number | null = null;
    const namaParts: string[] = [];
    let nikVal = '';
    const alamatParts: string[] = [];
    const barangParts: string[] = [];

    const sorted = [...band].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

    for (const t of sorted) {
      const compactDigits = t.s.replace(/\s+/g, '');

      // Deteksi NIK 14-18 digit di area NAMA..ALAMAT agar tidak salah kolom
      if (
        /^\d{14,18}$/.test(compactDigits) &&
        t.x >= colBounds.noMaxX - 2 &&
        t.x < colBounds.alamatMaxX
      ) {
        if (!nikVal) nikVal = compactDigits;
        continue;
      }

      if (t.x < colBounds.namaMaxX) {
        const mergedMatch = t.s.match(/^(\d{1,4})\s+(.+)$/);
        if (mergedMatch && t.x <= colBounds.noMaxX + 5) {
          if (noVal === null) noVal = Number(mergedMatch[1]);
          const nm = mergedMatch[2].trim();
          if (nm && !namaParts.includes(nm)) namaParts.push(nm);
        } else if (/^\d{1,4}$/.test(t.s) && t.x <= colBounds.noMaxX + 5) {
          if (noVal === null) noVal = Number(t.s);
        } else if (!namaParts.includes(t.s)) {
          namaParts.push(t.s);
        }
      } else if (t.x < colBounds.alamatMaxX) {
        if (!alamatParts.includes(t.s)) {
          alamatParts.push(t.s);
        }
      } else if (t.x < colBounds.barangMaxX) {
        if (
          !/^\d+([.,]\d+)*$/.test(t.s) &&
          !/^(UNIT|SET|PAKET|BUAH|PCS|BH|LSN|KOTAK|DUS)$/i.test(t.s)
        ) {
          barangParts.push(t.s);
        }
      }
    }

    if (noVal !== null && Number.isFinite(noVal) && noVal > 0) {
      const prevRow = rows[rows.length - 1];
      if (prevRow && prevRow.no === noVal && namaParts.length === 0) {
        if (!prevRow.nik && nikVal) prevRow.nik = nikVal;
        const extraAlamat = alamatParts.join(' ').replace(/\s+/g, ' ').trim();
        if (extraAlamat && !prevRow.alamat.includes(extraAlamat)) {
          prevRow.alamat = `${prevRow.alamat} ${extraAlamat}`.trim();
        }
        for (const b of barangParts) {
          if (!prevRow.barangList.includes(b)) prevRow.barangList.push(b);
        }
      } else if (namaParts.length > 0 || nikVal || barangParts.length > 0) {
        rows.push({
          no: noVal,
          nama: namaParts.join(' ').replace(/\s+/g, ' ').trim().toUpperCase(),
          nik: nikVal,
          alamat: alamatParts.join(' ').replace(/\s+/g, ' ').trim(),
          barangList: barangParts,
        });
      }
    } else if (rows.length > 0) {
      // Band lanjutan tanpa nomor urut (akibat split halaman / sub-baris barang di dalam 1 KPM):
      // WAJIB digabungkan ke baris KPM sebelumnya agar barangList tidak hilang menjadi LAINNYA!
      const prevRow = rows[rows.length - 1];
      if (!prevRow.nik && nikVal) {
        prevRow.nik = nikVal;
      }
      if (namaParts.length > 0) {
        const extraNama = namaParts.join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
        if (!prevRow.nama) {
          prevRow.nama = extraNama;
        } else if (extraNama && !prevRow.nama.includes(extraNama) && prevRow.barangList.length === 0) {
          prevRow.nama = `${prevRow.nama} ${extraNama}`.trim();
        }
      }
      if (alamatParts.length > 0) {
        const extraAlamat = alamatParts.join(' ').replace(/\s+/g, ' ').trim();
        if (extraAlamat && !prevRow.alamat.includes(extraAlamat)) {
          prevRow.alamat = `${prevRow.alamat} ${extraAlamat}`.trim();
        }
      }
      for (const b of barangParts) {
        if (!prevRow.barangList.includes(b)) {
          prevRow.barangList.push(b);
        }
      }
    }
  }

  // Gabungkan hanya jika nomor urut sama dan berasal dari KPM yang sama (akibat split halaman tak standar).
  // Jika nama & NIK berbeda, pertahankan kedua baris agar anomali nomor urut ganda BAST terdeteksi!
  const normalizeCmp = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const mergedByKey = new Map<string, BastExtractedRow>();
  let dupCounter = 0;
  for (const row of rows) {
    if (!row.nama) continue;
    const baseKey = `no:${row.no}`;
    const existing = mergedByKey.get(baseKey);
    if (!existing) {
      mergedByKey.set(baseKey, row);
      continue;
    }

    const existingNameNorm = normalizeCmp(existing.nama);
    const rowNameNorm = normalizeCmp(row.nama);
    const sameNik = Boolean(existing.nik && row.nik && existing.nik === row.nik);
    const sameName =
      !rowNameNorm ||
      !existingNameNorm ||
      existingNameNorm === rowNameNorm ||
      existingNameNorm.includes(rowNameNorm) ||
      rowNameNorm.includes(existingNameNorm);

    if (sameNik || (sameName && (!existing.nik || !row.nik || existing.nik === row.nik))) {
      if (!existing.nik && row.nik) existing.nik = row.nik;
      if (row.alamat && !existing.alamat.includes(row.alamat)) {
        existing.alamat = `${existing.alamat} ${row.alamat}`.trim();
      }
      for (const b of row.barangList) {
        if (!existing.barangList.includes(b)) {
          existing.barangList.push(b);
        }
      }
    } else {
      dupCounter += 1;
      mergedByKey.set(`no:${row.no}:dup:${dupCounter}`, row);
    }
  }

  const finalRows = Array.from(mergedByKey.values()).sort((a, b) => a.no - b.no);

  return {
    documentTitle: documentTitle || fileName.replace(/\.pdf$/i, ''),
    rows: finalRows,
    totalTextItems,
  };
}

interface ProposalColBound {
  key: 'no' | 'item' | 'desil' | 'nama' | 'alamat' | 'rtRw' | 'kontak' | 'pengelola' | 'kelurahan' | 'other';
  minX: number;
  maxX: number;
}

function classifyProposalHeader(hdrText: string): ProposalColBound['key'] {
  const up = hdrText.replace(/\s+/g, ' ').trim().toUpperCase();
  if (/^NO\.?$/.test(up)) return 'no';
  if (/ITEM/.test(up)) return 'item';
  if (/DESIL/.test(up)) return 'desil';
  if (/NAMA/.test(up)) return 'nama';
  if (/ALAMAT/.test(up)) return 'alamat';
  if (/RT/.test(up)) return 'rtRw';
  if (/KONTAK|HP|TELP|WA/.test(up)) return 'kontak';
  if (/PENGELOLA/.test(up)) return 'pengelola';
  if (/KELURAHAN|DESA/.test(up)) return 'kelurahan';
  return 'other';
}

export async function parseProposalPdfLocally(
  bytes: Uint8Array,
  fileName: string
): Promise<LocalProposalPdfParseResult> {
  const { pdfjs, doc, destroy } = await loadPdfDocument(bytes);

  let documentTitle = '';
  let totalTextItems = 0;
  let colBounds: ProposalColBound[] | null = null;
  const rows: ProposalExtractedRow[] = [];
  const summaryPengelola: { name: string; count: number }[] = [];

  try {
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();

      const textItems: PdfTextItem[] = [];
      for (const rawItem of tc.items) {
        if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
        const clean = rawItem.str.replace(/\s+/g, ' ').trim();
        if (!clean) continue;
        textItems.push({
          s: clean,
          x: rawItem.transform[4],
          y: vp.height - rawItem.transform[5],
          w: rawItem.width,
          page: p,
        });
      }
      textItems.sort((a, b) => a.y - b.y || a.x - b.x);
      totalTextItems += textItems.length;
      if (textItems.length === 0) continue;

      const { hLines, vLines } = await extractPageGeometry(page, vp.height, 20, pdfjs.OPS);
      const noHdr = textItems.find((t) => /^NO\.?$/i.test(t.s));

      if (p === 1 && !documentTitle) {
        const headerY = noHdr ? noHdr.y : 85;
        const titleLines = textItems
          .filter((t) => t.y < headerY - 18)
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((t) => t.s);
        if (titleLines.length > 0) {
          documentTitle = titleLines[0];
        }
      }

      if (!colBounds && noHdr) {
        const headerY = noHdr.y;
        const headerBand = textItems.filter((t) => Math.abs(t.y - headerY) < 12);

        if (vLines.length >= 4) {
          const cols: ProposalColBound[] = [];
          for (let i = 0; i < vLines.length - 1; i += 1) {
            const minX = vLines[i];
            const maxX = vLines[i + 1];
            const hdrTexts = headerBand
              .filter((t) => {
                const cx = t.x + t.w / 2;
                return cx >= minX - 2 && cx <= maxX + 2;
              })
              .map((t) => t.s)
              .join(' ');
            cols.push({
              key: classifyProposalHeader(hdrTexts),
              minX,
              maxX,
            });
          }
          if (cols.some((c) => c.key === 'no') && cols.some((c) => c.key === 'nama')) {
            colBounds = cols;
          }
        }

        // Fallback tanpa vertical lines: hitung batas kolom dari posisi teks header
        if (!colBounds) {
          const sortedHeaders = [...headerBand]
            .map((t) => ({ key: classifyProposalHeader(t.s), t }))
            .filter((h) => h.key !== 'other')
            .sort((a, b) => a.t.x - b.t.x);

          if (
            sortedHeaders.some((h) => h.key === 'no') &&
            sortedHeaders.some((h) => h.key === 'nama')
          ) {
            colBounds = sortedHeaders.map((h, idx) => {
              const prevCenter =
                idx === 0
                  ? 0
                  : (sortedHeaders[idx - 1].t.x +
                      sortedHeaders[idx - 1].t.w / 2 +
                      h.t.x +
                      h.t.w / 2) /
                    2;
              const nextCenter =
                idx === sortedHeaders.length - 1
                  ? vp.width
                  : (h.t.x +
                      h.t.w / 2 +
                      sortedHeaders[idx + 1].t.x +
                      sortedHeaders[idx + 1].t.w / 2) /
                    2;
              return { key: h.key, minX: prevCenter, maxX: nextCenter };
            });
          }
        }
      }

      if (!colBounds) continue;

      const summaryHdr = textItems.find(
        (t) => /^DAFTAR\s+ITEM\s*:/i.test(t.s) || /^PENGELOLA\s*:/i.test(t.s)
      );
      const summaryStartY = summaryHdr ? summaryHdr.y - 5 : vp.height;
      const validHLines = hLines.filter((y) => y <= summaryStartY + 5);

      const rowBands: PdfTextItem[][] = [];

      if (validHLines.length >= 2) {
        for (let b = 0; b < validHLines.length - 1; b += 1) {
          const y0 = validHLines[b];
          const y1 = validHLines[b + 1];
          const band = textItems.filter((t) => t.y >= y0 - 1 && t.y < y1 - 1);
          if (band.length > 0) rowBands.push(band);
        }
      } else {
        // Fallback tanpa horizontal lines: kelompokkan berdasarkan anchor nomor urut
        const noCol = colBounds.find((c) => c.key === 'no')!;
        const headerY = noHdr ? noHdr.y : 0;
        const tableItems = textItems.filter((t) => t.y > headerY + 6 && t.y < summaryStartY);
        const anchors = tableItems
          .filter(
            (t) =>
              t.x + t.w / 2 >= noCol.minX - 2 &&
              t.x + t.w / 2 <= noCol.maxX + 2 &&
              /^\d{1,4}$/.test(t.s)
          )
          .sort((a, b) => a.y - b.y);

        for (let i = 0; i < anchors.length; i += 1) {
          const a = anchors[i];
          const prevY = i === 0 ? headerY + 6 : (anchors[i - 1].y + a.y) / 2;
          const nextY =
            i === anchors.length - 1
              ? Math.min(summaryStartY, a.y + 18)
              : (a.y + anchors[i + 1].y) / 2;
          const band = tableItems.filter((t) => t.y >= prevY && t.y < nextY);
          if (band.length > 0) rowBands.push(band);
        }
      }

      for (const band of rowBands) {
        const isHeader =
          band.some((t) => /^NO\.?$/i.test(t.s)) && band.some((t) => /^NAMA$/i.test(t.s));
        if (isHeader) continue;

        const cells: Partial<Record<ProposalColBound['key'], string>> = {};
        for (const t of band) {
          const cx = t.x + t.w / 2;
          const col = colBounds.find((c) => cx >= c.minX - 1 && cx <= c.maxX + 1);
          if (col && col.key !== 'other') {
            cells[col.key] = cells[col.key] ? `${cells[col.key]} ${t.s}` : t.s;
          }
        }

        const no = (cells.no || '').trim();
        const item = (cells.item || '').trim().toUpperCase();
        const nama = (cells.nama || '').trim().toUpperCase();

        // Abaikan baris kosong (nomor urut ada tetapi ITEM atau NAMA kosong)
        if (!no || !item || !nama) continue;

        rows.push({
          no,
          item,
          nama,
          alamat: (cells.alamat || '').trim(),
          rtRw: (cells.rtRw || '').trim(),
          kelurahan: (cells.kelurahan || '').trim(),
          pengelola: (cells.pengelola || '').trim(),
        });
      }

      if (summaryHdr) {
        const pengelolaHdrItem = textItems.find((t) => /^PENGELOLA\s*:/i.test(t.s));
        if (pengelolaHdrItem) {
          const pxMin = pengelolaHdrItem.x - 10;
          const summaryLines = textItems.filter(
            (t) => t.y > pengelolaHdrItem.y && t.x >= pxMin
          );
          for (const sl of summaryLines) {
            const m = sl.s.match(/^-\s*(.+?)\s*:\s*(\d+)$/);
            if (m) {
              summaryPengelola.push({ name: m[1].trim(), count: Number(m[2]) });
            }
          }
        }
      }
    }
  } finally {
    await destroy();
  }

  return {
    documentTitle: documentTitle || fileName.replace(/\.pdf$/i, ''),
    rows,
    summaryPengelola,
    totalTextItems,
  };
}
