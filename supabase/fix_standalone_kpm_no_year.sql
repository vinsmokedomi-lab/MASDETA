-- ============================================================================
-- MASDETA - MIGRASI & PEMBERSIHAN DATA KPM DATABASE & ARSIP DITOLAK (TANPA TAHUN/PROPOSAL)
-- ============================================================================
-- Cara pakai:
-- 1. Buka Supabase Dashboard -> SQL Editor -> New Query
-- 2. Tempel seluruh isi skrip ini dan klik RUN.
-- 3. Setelah selesai, jika masih ada data CSV baru yang mau di-import,
--    jalankan /supabase/kpm_records_import.sql atau import /supabase/kpm_records_import.csv.
-- ============================================================================

BEGIN;

-- 1. Pastikan skema public.kpm_records mendukung tahun = NULL, proposal = NULL, dan item kosong
ALTER TABLE public.kpm_records
  ALTER COLUMN tahun DROP NOT NULL,
  ALTER COLUMN tahun SET DEFAULT NULL,
  ALTER COLUMN proposal_id DROP NOT NULL,
  ALTER COLUMN proposal DROP NOT NULL,
  ALTER COLUMN item SET DEFAULT '';

-- 1B. Pastikan kolom tahun pada kpm_audit_logs & proposal_kpm_history cukup lebar (mencegah error VARCHAR(10))
ALTER TABLE public.kpm_audit_logs
  ALTER COLUMN tahun TYPE VARCHAR(30);

ALTER TABLE public.proposal_kpm_history
  ALTER COLUMN tahun TYPE VARCHAR(30);

-- 2. Trigger sanitasi otomatis saat INSERT/UPDATE (termasuk saat Import CSV dari Table Editor):
--    - Mengubah NULL pada kolom teks NOT NULL (seperti item, register_code, kontak, catatan) menjadi ''
--    - Memastikan Database KPM ('pending') & Arsip Ditolak ('rejected') selalu register_code='', tahun=NULL, proposal_id=NULL, proposal=NULL
CREATE OR REPLACE FUNCTION public.fn_kpm_records_sanitize_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.register_code := COALESCE(NEW.register_code, '');
  NEW.kecamatan := COALESCE(NEW.kecamatan, '');
  NEW.kelurahan := COALESCE(NEW.kelurahan, '');
  NEW.item := COALESCE(NEW.item, '');
  NEW.alamat := COALESCE(NEW.alamat, '');
  NEW.rt := COALESCE(NEW.rt, '');
  NEW.rw := COALESCE(NEW.rw, '');
  NEW.nik_kk := COALESCE(NEW.nik_kk, '');
  NEW.nik_ktp := COALESCE(NEW.nik_ktp, '');
  NEW.dtsen := COALESCE(NEW.dtsen, '');
  NEW.validasi := COALESCE(NULLIF(BTRIM(NEW.validasi), ''), 'pending');
  NEW.kontak := COALESCE(NEW.kontak, '');
  NEW.pekerjaan := COALESCE(NEW.pekerjaan, '');
  NEW.pengelola := COALESCE(NEW.pengelola, '');
  NEW.catatan := COALESCE(NEW.catatan, '');
  NEW.payment := COALESCE(NEW.payment, 0);
  NEW.berkas_dikembalikan := COALESCE(NEW.berkas_dikembalikan, FALSE);

  IF NEW.validasi IN ('pending', 'rejected') THEN
    NEW.register_code := '';
    NEW.tahun := NULL;
    NEW.proposal_id := NULL;
    NEW.proposal := NULL;
  ELSIF LOWER(BTRIM(COALESCE(NEW.tahun, ''))) IN ('', 'tanpa tahun') THEN
    NEW.tahun := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpm_records_sanitize_defaults ON public.kpm_records;
CREATE TRIGGER trg_kpm_records_sanitize_defaults
  BEFORE INSERT OR UPDATE ON public.kpm_records
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_kpm_records_sanitize_defaults();

-- 3. Hapus nomor urut (register_code), tahun, proposal_id, dan proposal dari seluruh KPM Database ('pending') & Arsip Ditolak ('rejected')
UPDATE public.kpm_records
SET
  register_code = '',
  tahun = NULL,
  proposal_id = NULL,
  proposal = NULL,
  updated_at = NOW()
WHERE validasi IN ('pending', 'rejected')
  AND (
    COALESCE(register_code, '') <> ''
    OR tahun IS NOT NULL
    OR proposal_id IS NOT NULL
    OR proposal IS NOT NULL
  );

-- 4. Bersihkan juga anomali baris 'accepted' yatim tanpa proposal_id (mis. sisa "ARSIP Kelurahan ...") atau tahun='Tanpa Tahun'
UPDATE public.kpm_records
SET
  validasi = 'pending',
  register_code = '',
  tahun = NULL,
  proposal_id = NULL,
  proposal = NULL,
  updated_at = NOW()
WHERE validasi = 'accepted'
  AND proposal_id IS NULL
  AND (proposal IS NULL OR BTRIM(proposal) = '' OR proposal ~* '^arsip\b');

UPDATE public.kpm_records
SET
  tahun = NULL,
  updated_at = NOW()
WHERE LOWER(BTRIM(COALESCE(tahun, ''))) = 'tanpa tahun';

-- 5. Rapikan catatan audit log & riwayat proposal yang sebelumnya sempat menyimpan 'Tanpa Tahun'
UPDATE public.kpm_audit_logs
SET tahun = ''
WHERE LOWER(BTRIM(COALESCE(tahun, ''))) = 'tanpa tahun';

UPDATE public.proposal_kpm_history
SET tahun = ''
WHERE LOWER(BTRIM(COALESCE(tahun, ''))) = 'tanpa tahun';

COMMIT;

-- 6. Verifikasi hasil
SELECT
  validasi,
  COUNT(*) AS total_kpm,
  COUNT(*) FILTER (WHERE COALESCE(register_code, '') <> '') AS masih_ada_nomor_urut,
  COUNT(tahun) AS masih_ada_tahun,
  COUNT(proposal_id) AS masih_ada_proposal_id,
  COUNT(proposal) AS masih_ada_nama_proposal
FROM public.kpm_records
GROUP BY validasi
ORDER BY validasi;
