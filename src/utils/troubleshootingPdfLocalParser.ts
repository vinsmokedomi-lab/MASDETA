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

async function extractPageGeometry(
  page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }> },
  vpHeight: number,
  minHWidth: number,
  OPS: PdfjsModule['OPS']
): Promise<{ hLines: number[]; vLines: number[] }> {
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const apply = (x: number, y: number): [number, number] => [
    ctm[0] * x + ctm[2] * y + ctm[4],
    ctm[1] * x + ctm[3] * y + ctm[5],
  ];

  const rawHLines: number[] = [];
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
          if (Math.abs(ny - cy) < 1 && Math.abs(nx - cx) > minHWidth) {
            rawHLines.push(vpHeight - ny);
          }
          if (Math.abs(nx - cx) < 1 && Math.abs(ny - cy) > 8) {
            rawVLines.push(nx);
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
          if (Math.abs(sy - cy) < 1 && Math.abs(sx - cx) > minHWidth) {
            rawHLines.push(vpHeight - sy);
          }
          if (Math.abs(sx - cx) < 1 && Math.abs(sy - cy) > 8) {
            rawVLines.push(sx);
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

          if (xR - xL > minHWidth && yBot - yTop > 8) {
            rawVLines.push(xL, xR);
            rawHLines.push(yTop, yBot);
          } else if (xR - xL > minHWidth && yBot - yTop <= 3) {
            rawHLines.push((yTop + yBot) / 2);
          } else if (yBot - yTop > 8 && xR - xL <= 3) {
            rawVLines.push((xL + xR) / 2);
          }
        } else {
          break;
        }
      }
    }
  }

  return {
    hLines: clusterValues(rawHLines, 2.5),
    vLines: clusterValues(rawVLines, 2.5),
  };
}

function isBastHeaderBand(band: PdfTextItem[]): boolean {
  const hasNo = band.some((t) => /^NO\.?$/i.test(t.s));
  const hasNama = band.some((t) => /^NAMA(\s+PENERIMA|\s+KPM)?$/i.test(t.s));
  const hasNikOrBarang = band.some((t) => /^NIK$/i.test(t.s) || /^(NAMA\s+)?BARANG$/i.test(t.s));
  return hasNo && (hasNama || hasNikOrBarang);
}

function extractBandNo(band: PdfTextItem[], noMaxX: number): number | null {
  for (const t of band) {
    if (t.x > noMaxX + 8) continue;
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

  const allBands: PdfTextItem[][] = [];

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

      if (!colBounds) {
        const noHdr = textItems.find((t) => /^NO\.?$/i.test(t.s));
        const namaHdr = textItems.find((t) => /^NAMA(\s+PENERIMA|\s+KPM)?$/i.test(t.s));
        const nikHdr = textItems.find((t) => /^NIK(\s+KTP)?$/i.test(t.s));
        const alamatHdr = textItems.find((t) => /^ALAMAT(\s+LENGKAP)?$/i.test(t.s));
        const barangHdr = textItems.find((t) =>
          /^(NAMA\s+)?(BARANG|BANTUAN|JENIS\s+BARANG|URAIAN\s+BARANG)$/i.test(t.s)
        );
        const volHdr = textItems.find((t) => /^(VOLUME|VOL\.?|JUMLAH|QTY|SATUAN)$/i.test(t.s));

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

          colBounds = {
            noMaxX: (noHdr.x + noHdr.w + namaHdr.x) / 2 - 5,
            namaMaxX: nikHdr
              ? (namaHdr.x + namaHdr.w + nikHdr.x) / 2 - 8
              : (namaHdr.x + namaHdr.w + alamatHdr.x) / 2 - 10,
            alamatMaxX: (alamatHdr.x + alamatHdr.w + barangHdr.x) / 2 - 5,
            barangMaxX: volHdr ? (barangHdr.x + barangHdr.w + volHdr.x) / 2 : vp.width,
          };
        }
      }

      const { hLines } = await extractPageGeometry(page, vp.height, 260, pdfjs.OPS);

      let pageBands: PdfTextItem[][] = [];

      if (hLines.length >= 2) {
        const boundaries = [0, ...hLines, Infinity];
        for (let b = 0; b < boundaries.length - 1; b += 1) {
          const y0 = boundaries[b];
          const y1 = boundaries[b + 1];
          const band = textItems.filter((t) => t.y >= y0 - 0.5 && t.y < y1 - 0.5);
          if (band.length > 0) {
            pageBands.push(band);
          }
        }
      } else if (colBounds) {
        // Fallback untuk BAST tanpa garis border horizontal: kelompokkan menurut anchor NO
        const sortedItems = [...textItems].sort((a, b) => a.y - b.y || a.x - b.x);
        const noAnchors = sortedItems.filter(
          (t) =>
            t.x <= colBounds!.noMaxX + 8 &&
            (/^\d{1,4}$/.test(t.s) || /^\d{1,4}\s+[A-Z]/i.test(t.s))
        );
        if (noAnchors.length > 0) {
          const preAnchor = sortedItems.filter((t) => t.y < noAnchors[0].y - 8);
          if (preAnchor.length > 0) pageBands.push(preAnchor);
          for (let i = 0; i < noAnchors.length; i += 1) {
            const prevY =
              i === 0 ? noAnchors[0].y - 8 : (noAnchors[i - 1].y + noAnchors[i].y) / 2;
            const nextY =
              i === noAnchors.length - 1 ? Infinity : (noAnchors[i].y + noAnchors[i + 1].y) / 2;
            const band = sortedItems.filter((t) => t.y >= prevY && t.y < nextY);
            if (band.length > 0) pageBands.push(band);
          }
        }
      }

      // Buang band header berulang di halaman lanjutan
      pageBands = pageBands.filter((band) => !isBastHeaderBand(band));

      if (p > 1 && allBands.length > 0 && pageBands.length > 0 && colBounds) {
        const prevBand = allBands[allBands.length - 1];
        const firstBand = pageBands[0];
        const prevNo = extractBandNo(prevBand, colBounds.noMaxX);
        const firstNo = extractBandNo(firstBand, colBounds.noMaxX);

        const shouldMergeAcrossPage =
          prevNo === null || firstNo === null || (prevNo !== null && firstNo === prevNo);

        if (shouldMergeAcrossPage) {
          pageBands.shift();
          allBands[allBands.length - 1] = [...prevBand, ...firstBand];
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

  for (const band of allBands) {
    if (band.length === 0 || isBastHeaderBand(band)) continue;

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
        t.x >= colBounds.noMaxX &&
        t.x < colBounds.alamatMaxX
      ) {
        if (!nikVal) nikVal = compactDigits;
        continue;
      }

      if (t.x < colBounds.namaMaxX) {
        const mergedMatch = t.s.match(/^(\d{1,4})\s+(.+)$/);
        if (mergedMatch && t.x <= colBounds.noMaxX + 8) {
          if (noVal === null) noVal = Number(mergedMatch[1]);
          const nm = mergedMatch[2].trim();
          if (nm && !namaParts.includes(nm)) namaParts.push(nm);
        } else if (/^\d{1,4}$/.test(t.s) && t.x <= colBounds.noMaxX + 8) {
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
          !/^\d+([.,]\d+)?$/.test(t.s) &&
          !/^(UNIT|SET|PAKET|BUAH|PCS|BH|LSN|KOTAK|DUS)$/i.test(t.s)
        ) {
          barangParts.push(t.s);
        }
      }
    }

    if (noVal !== null && Number.isFinite(noVal) && noVal > 0 && namaParts.length > 0) {
      rows.push({
        no: noVal,
        nama: namaParts.join(' ').replace(/\s+/g, ' ').trim().toUpperCase(),
        nik: nikVal,
        alamat: alamatParts.join(' ').replace(/\s+/g, ' ').trim(),
        barangList: barangParts,
      });
    }
  }

  // Gabungkan hanya jika nomor urut sama dan berasal dari KPM yang sama (akibat split halaman tak standar).
  // Jika nama & NIK berbeda, pertahankan kedua baris agar anomali nomor urut ganda BAST terdeteksi!
  const normalizeCmp = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const mergedByKey = new Map<string, BastExtractedRow>();
  let dupCounter = 0;
  for (const row of rows) {
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
