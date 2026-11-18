-- ============================================================================
-- MASDETA - SKEMA DATABASE POSTGRESQL (SUPABASE) & KEBIJAKAN RLS
-- ============================================================================
-- Petunjuk Eksekusi:
-- 1. Buka Supabase Dashboard -> Project "MASDETA" -> SQL Editor -> New Query
-- 2. Tempel seluruh skrip SQL ini dan klik RUN.
-- 3. Catatan Keamanan Media:
--    Seluruh kolom foto/dokumen pada skema ini bertipe TEXT dan HANYA menyimpan
--    URL Google Drive (dikelola via Google Apps Script). Constraint CHECK
--    menjamin string Base64 ("data:...") tidak pernah tersimpan di database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WILAYAH HIERARKIS (Kabupaten/Kota -> Kecamatan -> Kelurahan/Desa)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wilayah_kabkota (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wilayah_kecamatan (
  id TEXT PRIMARY KEY,
  kabkota_id TEXT NOT NULL REFERENCES public.wilayah_kabkota(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kabkota_id, nama)
);

CREATE TABLE IF NOT EXISTS public.wilayah_kelurahan (
  id TEXT PRIMARY KEY,
  kecamatan_id TEXT NOT NULL REFERENCES public.wilayah_kecamatan(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kecamatan_id, nama)
);

-- ----------------------------------------------------------------------------
-- 2. MASTER PEKERJAAN
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pekerjaan_master (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. MASTER ITEM & SUB-ITEM BANTUAN
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_bantuan (
  id TEXT PRIMARY KEY,
  tahun VARCHAR(10) NOT NULL,
  code VARCHAR(20) NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tahun, code)
);

CREATE TABLE IF NOT EXISTS public.item_sub_items (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES public.item_bantuan(id) ON DELETE CASCADE,
  sub_item_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, sub_item_name)
);

-- ----------------------------------------------------------------------------
-- 4. PENGELOLA LAPANGAN (Foto disimpan di Google Drive, hanya URL di sini)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pengelola (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Bapak',
  nama TEXT NOT NULL,
  display_name TEXT NOT NULL UNIQUE,
  kab_kota TEXT NOT NULL DEFAULT '',
  kecamatan TEXT NOT NULL DEFAULT '',
  kelurahan TEXT NOT NULL DEFAULT '',
  alamat TEXT NOT NULL DEFAULT '',
  kontak TEXT NOT NULL DEFAULT '',
  foto_url TEXT CHECK (foto_url IS NULL OR left(foto_url, 5) <> 'data:'),
  foto_thumb_url TEXT CHECK (foto_thumb_url IS NULL OR left(foto_thumb_url, 5) <> 'data:'),
  foto_view_url TEXT CHECK (foto_view_url IS NULL OR left(foto_view_url, 5) <> 'data:'),
  foto_file_id TEXT,
  foto_file_name TEXT,
  foto_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. PROPOSAL & DOKUMEN PROPOSAL (Hanya URL Google Drive bertipe TEXT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposals (
  id TEXT PRIMARY KEY,
  tahun VARCHAR(10) NOT NULL,
  tipe VARCHAR(30) NOT NULL CHECK (tipe IN ('Murni', 'Perubahan')),
  kab_kota TEXT NOT NULL DEFAULT '',
  kecamatan TEXT NOT NULL DEFAULT '',
  kelurahan TEXT NOT NULL DEFAULT '',
  jalan TEXT NOT NULL DEFAULT '',
  nama_proposal TEXT NOT NULL,
  jumlah_kpm INTEGER NOT NULL DEFAULT 66,
  status VARCHAR(20) NOT NULL DEFAULT 'unlocked' CHECK (status IN ('unlocked', 'locked')),
  checklist JSONB NOT NULL DEFAULT '{"docx":false,"dinas":false,"rab":false,"rt":false,"rw":false,"lurah":false,"camat":false}'::jsonb,
  catatan TEXT NOT NULL DEFAULT '',
  proposal_opd_url TEXT CHECK (proposal_opd_url IS NULL OR left(proposal_opd_url, 5) <> 'data:'),
  proposal_lurah_camat_url TEXT CHECK (proposal_lurah_camat_url IS NULL OR left(proposal_lurah_camat_url, 5) <> 'data:'),
  rab_url TEXT CHECK (rab_url IS NULL OR left(rab_url, 5) <> 'data:'),
  cap_rt_url TEXT CHECK (cap_rt_url IS NULL OR left(cap_rt_url, 5) <> 'data:'),
  cap_rw_url TEXT CHECK (cap_rw_url IS NULL OR left(cap_rw_url, 5) <> 'data:'),
  cap_lurah_url TEXT CHECK (cap_lurah_url IS NULL OR left(cap_lurah_url, 5) <> 'data:'),
  cap_camat_url TEXT CHECK (cap_camat_url IS NULL OR left(cap_camat_url, 5) <> 'data:'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tahun, nama_proposal)
);

CREATE TABLE IF NOT EXISTS public.proposal_documents (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  doc_slot VARCHAR(40) NOT NULL CHECK (
    doc_slot IN ('proposalOpd', 'proposalLurahCamat', 'rab', 'capRt', 'capRw', 'capLurah', 'capCamat')
  ),
  direct_url TEXT NOT NULL CHECK (left(direct_url, 5) <> 'data:'),
  thumbnail_url TEXT CHECK (thumbnail_url IS NULL OR left(thumbnail_url, 5) <> 'data:'),
  view_url TEXT CHECK (view_url IS NULL OR left(view_url, 5) <> 'data:'),
  drive_file_id TEXT,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  original_size BIGINT NOT NULL DEFAULT 0,
  compressed_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, doc_slot)
);

-- ----------------------------------------------------------------------------
-- 6. KPM RECORDS, DOKUMEN KPM & PENYALURAN SUB-ITEM
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpm_records (
  id TEXT PRIMARY KEY,
  register_code TEXT NOT NULL DEFAULT '',
  tahun VARCHAR(10),
  proposal_id TEXT REFERENCES public.proposals(id) ON DELETE SET NULL,
  proposal TEXT,
  kecamatan TEXT NOT NULL DEFAULT '',
  kelurahan TEXT NOT NULL DEFAULT '',
  item VARCHAR(20) NOT NULL,
  nama TEXT NOT NULL,
  alamat TEXT NOT NULL DEFAULT '',
  rt VARCHAR(10) NOT NULL DEFAULT '',
  rw VARCHAR(10) NOT NULL DEFAULT '',
  nik_kk VARCHAR(16) NOT NULL DEFAULT '',
  nik_ktp VARCHAR(16) NOT NULL DEFAULT '',
  dtsen VARCHAR(20) NOT NULL DEFAULT '',
  validasi VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (validasi IN ('pending', 'accepted', 'rejected')),
  kontak TEXT NOT NULL DEFAULT '',
  pekerjaan TEXT NOT NULL DEFAULT '',
  pengelola_id TEXT REFERENCES public.pengelola(id) ON DELETE SET NULL,
  pengelola TEXT NOT NULL DEFAULT '',
  catatan TEXT NOT NULL DEFAULT '',
  payment NUMERIC(14, 0) NOT NULL DEFAULT 0,
  foto_ktp_url TEXT CHECK (foto_ktp_url IS NULL OR left(foto_ktp_url, 5) <> 'data:'),
  foto_ktp_thumb_url TEXT CHECK (foto_ktp_thumb_url IS NULL OR left(foto_ktp_thumb_url, 5) <> 'data:'),
  foto_kk_url TEXT CHECK (foto_kk_url IS NULL OR left(foto_kk_url, 5) <> 'data:'),
  foto_kk_thumb_url TEXT CHECK (foto_kk_thumb_url IS NULL OR left(foto_kk_thumb_url, 5) <> 'data:'),
  foto_penerima_url TEXT CHECK (foto_penerima_url IS NULL OR left(foto_penerima_url, 5) <> 'data:'),
  foto_penerima_thumb_url TEXT CHECK (foto_penerima_thumb_url IS NULL OR left(foto_penerima_thumb_url, 5) <> 'data:'),
  foto_survey_url TEXT CHECK (foto_survey_url IS NULL OR left(foto_survey_url, 5) <> 'data:'),
  foto_survey_thumb_url TEXT CHECK (foto_survey_thumb_url IS NULL OR left(foto_survey_thumb_url, 5) <> 'data:'),
  berkas_dikembalikan BOOLEAN NOT NULL DEFAULT FALSE,
  berkas_dikembalikan_at TIMESTAMPTZ,
  berkas_dikembalikan_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kpm_documents (
  id TEXT PRIMARY KEY,
  kpm_id TEXT NOT NULL REFERENCES public.kpm_records(id) ON DELETE CASCADE,
  doc_category VARCHAR(20) NOT NULL CHECK (
    doc_category IN ('ktp', 'kk', 'penerima', 'survey', 'rumah', 'lainnya')
  ),
  direct_url TEXT NOT NULL CHECK (left(direct_url, 5) <> 'data:'),
  thumbnail_url TEXT CHECK (thumbnail_url IS NULL OR left(thumbnail_url, 5) <> 'data:'),
  view_url TEXT CHECK (view_url IS NULL OR left(view_url, 5) <> 'data:'),
  drive_file_id TEXT,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  original_size BIGINT NOT NULL DEFAULT 0,
  compressed_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kpm_sub_item_deliveries (
  id TEXT PRIMARY KEY,
  kpm_id TEXT NOT NULL REFERENCES public.kpm_records(id) ON DELETE CASCADE,
  sub_item_name TEXT NOT NULL,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE (kpm_id, sub_item_name)
);

-- ----------------------------------------------------------------------------
-- 7. RIWAYAT PROPOSAL & AUDIT LOG KPM
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_kpm_history (
  id TEXT PRIMARY KEY,
  tahun VARCHAR(10) DEFAULT '',
  proposal_id TEXT REFERENCES public.proposals(id) ON DELETE SET NULL,
  proposal_name TEXT NOT NULL DEFAULT '',
  kpm_id TEXT REFERENCES public.kpm_records(id) ON DELETE SET NULL,
  kpm_name TEXT NOT NULL,
  register_code TEXT NOT NULL DEFAULT '',
  action VARCHAR(20) NOT NULL CHECK (action IN ('entered', 'moved_in', 'moved_out', 'removed')),
  from_proposal TEXT,
  to_proposal TEXT,
  actor_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kpm_audit_logs (
  id TEXT PRIMARY KEY,
  kpm_id TEXT NOT NULL REFERENCES public.kpm_records(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL CHECK (action IN ('created', 'updated', 'status_changed')),
  actor_name TEXT NOT NULL,
  actor_email TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proposal TEXT NOT NULL DEFAULT '',
  tahun VARCHAR(10) NOT NULL DEFAULT '',
  changes JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ----------------------------------------------------------------------------
-- 8. USER MULTI-ADMIN & DIRECT CHAT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_users (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  username TEXT,
  email TEXT NOT NULL UNIQUE,
  jabatan TEXT NOT NULL DEFAULT 'Admin Lapangan',
  kontak TEXT NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL DEFAULT 'Admin' CHECK (role IN ('SuperAdmin', 'Admin', 'Viewer')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  perm_add BOOLEAN NOT NULL DEFAULT TRUE,
  perm_update BOOLEAN NOT NULL DEFAULT TRUE,
  perm_delete BOOLEAN NOT NULL DEFAULT FALSE,
  presence_status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (presence_status IN ('online', 'idle', 'offline')),
  presence_manual BOOLEAN NOT NULL DEFAULT FALSE,
  foto_url TEXT CHECK (foto_url IS NULL OR left(foto_url, 5) <> 'data:'),
  foto_thumb_url TEXT CHECK (foto_thumb_url IS NULL OR left(foto_thumb_url, 5) <> 'data:'),
  foto_file_id TEXT,
  password_hash TEXT NOT NULL,
  last_active_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.internal_users
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_users_username_unique
  ON public.internal_users (lower(username))
  WHERE username IS NOT NULL AND username <> '';

CREATE TABLE IF NOT EXISTS public.direct_chat_messages (
  id TEXT PRIMARY KEY,
  conversation_key TEXT NOT NULL,
  sender_id TEXT NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  shared_kpm_id TEXT,
  shared_kpm_foto_url TEXT CHECK (shared_kpm_foto_url IS NULL OR left(shared_kpm_foto_url, 5) <> 'data:'),
  shared_kpm_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

ALTER TABLE public.direct_chat_messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.masdeta_app_state (
  state_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8B. JADWAL KEGIATAN & TEMPLATE DOKUMEN RESMI (SPTJM, BAST, KUPON, KOP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'lainnya',
  target_day VARCHAR(30),
  target_date VARCHAR(20) NOT NULL,
  target_time VARCHAR(20),
  tahun VARCHAR(10),
  proposal_name TEXT,
  location TEXT,
  notes TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'Petugas Internal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.document_templates (
  template_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. INDEKS PERFORMA TINGGI (Pencarian NIK, KK, Wilayah, Proposal, Audit, Chat)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wilayah_kec_kabkota ON public.wilayah_kecamatan (kabkota_id);
CREATE INDEX IF NOT EXISTS idx_wilayah_kel_kec ON public.wilayah_kelurahan (kecamatan_id);
CREATE INDEX IF NOT EXISTS idx_item_bantuan_tahun_code ON public.item_bantuan (tahun, code);
CREATE INDEX IF NOT EXISTS idx_item_sub_items_item_id ON public.item_sub_items (item_id);

CREATE INDEX IF NOT EXISTS idx_pengelola_nama ON public.pengelola (nama);
CREATE INDEX IF NOT EXISTS idx_pengelola_wilayah ON public.pengelola (kab_kota, kecamatan, kelurahan);

CREATE INDEX IF NOT EXISTS idx_proposals_tahun ON public.proposals (tahun);
CREATE INDEX IF NOT EXISTS idx_proposals_wilayah ON public.proposals (kab_kota, kecamatan, kelurahan);
CREATE INDEX IF NOT EXISTS idx_proposal_docs_proposal_id ON public.proposal_documents (proposal_id);

CREATE INDEX IF NOT EXISTS idx_kpm_nik_ktp ON public.kpm_records (nik_ktp);
CREATE INDEX IF NOT EXISTS idx_kpm_nik_kk ON public.kpm_records (nik_kk);
CREATE INDEX IF NOT EXISTS idx_kpm_wilayah ON public.kpm_records (kecamatan, kelurahan);
CREATE INDEX IF NOT EXISTS idx_kpm_tahun_proposal ON public.kpm_records (tahun, proposal);
CREATE INDEX IF NOT EXISTS idx_kpm_proposal_id ON public.kpm_records (proposal_id);
CREATE INDEX IF NOT EXISTS idx_kpm_pengelola ON public.kpm_records (pengelola);
CREATE INDEX IF NOT EXISTS idx_kpm_validasi ON public.kpm_records (validasi);
CREATE INDEX IF NOT EXISTS idx_kpm_nama ON public.kpm_records (nama);
CREATE INDEX IF NOT EXISTS idx_kpm_register_code ON public.kpm_records (register_code);

CREATE INDEX IF NOT EXISTS idx_kpm_documents_kpm_cat ON public.kpm_documents (kpm_id, doc_category);
CREATE INDEX IF NOT EXISTS idx_kpm_deliveries_kpm_id ON public.kpm_sub_item_deliveries (kpm_id);

CREATE INDEX IF NOT EXISTS idx_proposal_history_prop ON public.proposal_kpm_history (tahun, proposal_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_kpm_audit_kpm_id ON public.kpm_audit_logs (kpm_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_internal_users_email ON public.internal_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_internal_users_status ON public.internal_users (status);
CREATE INDEX IF NOT EXISTS idx_chat_conv_created ON public.direct_chat_messages (conversation_key, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_recipient_unread ON public.direct_chat_messages (recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_schedules_target_date ON public.schedules (target_date, target_time);
CREATE INDEX IF NOT EXISTS idx_schedules_tahun_proposal ON public.schedules (tahun, proposal_name);

-- ----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) MULTI-ADMIN
-- ----------------------------------------------------------------------------
-- Mengaktifkan RLS pada seluruh tabel agar akses terkendali melalui API Supabase.
-- Kebijakan di bawah mengizinkan klien MASDETA (anon & authenticated via Publishable Key)
-- menjalankan operasi aplikasi internal multi-admin, sembari menjaga integritas
-- aturan role (SuperAdmin / Admin / Viewer) dan validasi Base64 di level skema & aplikasi.
-- Catatan Keamanan: Aplikasi klien menghindari SELECT * pada internal_users untuk daftar user
-- (mengecualikan kolom password_hash). Untuk pengerasan lanjutan di produksi, verifikasi login
-- & kontrol akun dapat dipindahkan ke RPC SECURITY DEFINER atau Supabase Auth.

ALTER TABLE public.wilayah_kabkota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wilayah_kecamatan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wilayah_kelurahan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pekerjaan_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_bantuan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_sub_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengelola ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpm_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpm_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpm_sub_item_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_kpm_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpm_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.masdeta_app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'wilayah_kabkota',
    'wilayah_kecamatan',
    'wilayah_kelurahan',
    'pekerjaan_master',
    'item_bantuan',
    'item_sub_items',
    'pengelola',
    'proposals',
    'proposal_documents',
    'kpm_records',
    'kpm_documents',
    'kpm_sub_item_deliveries',
    'proposal_kpm_history',
    'kpm_audit_logs',
    'internal_users',
    'direct_chat_messages',
    'masdeta_app_state',
    'schedules',
    'document_templates'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "masdeta_multiadmin_select_%s" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "masdeta_multiadmin_insert_%s" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "masdeta_multiadmin_update_%s" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "masdeta_multiadmin_delete_%s" ON public.%I;', tbl, tbl);

    EXECUTE format(
      'CREATE POLICY "masdeta_multiadmin_select_%s" ON public.%I FOR SELECT TO anon, authenticated USING (true);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "masdeta_multiadmin_insert_%s" ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "masdeta_multiadmin_update_%s" ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "masdeta_multiadmin_delete_%s" ON public.%I FOR DELETE TO anon, authenticated USING (true);',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 11. REALTIME PUBLICATION (Sinkronisasi Live Multi-Admin)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  rt_tbl TEXT;
BEGIN
  FOREACH rt_tbl IN ARRAY ARRAY[
    'kpm_records',
    'kpm_documents',
    'kpm_sub_item_deliveries',
    'proposals',
    'proposal_documents',
    'pengelola',
    'item_bantuan',
    'item_sub_items',
    'wilayah_kabkota',
    'wilayah_kecamatan',
    'wilayah_kelurahan',
    'pekerjaan_master',
    'proposal_kpm_history',
    'kpm_audit_logs',
    'internal_users',
    'direct_chat_messages',
    'masdeta_app_state',
    'schedules',
    'document_templates'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', rt_tbl);
    EXCEPTION WHEN duplicate_object OR undefined_object THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 12. SEED DATA AWAL RESMI MASDETA (Idempoten)
-- ----------------------------------------------------------------------------

-- A. Wilayah Kota Pontianak (6 Kecamatan & seluruh Kelurahan)
INSERT INTO public.wilayah_kabkota (id, nama, sort_order)
VALUES ('kota-pontianak', 'Kota Pontianak', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wilayah_kecamatan (id, kabkota_id, nama, sort_order) VALUES
  ('ptk-barat', 'kota-pontianak', 'Pontianak Barat', 1),
  ('ptk-kota', 'kota-pontianak', 'Pontianak Kota', 2),
  ('ptk-selatan', 'kota-pontianak', 'Pontianak Selatan', 3),
  ('ptk-tenggara', 'kota-pontianak', 'Pontianak Tenggara', 4),
  ('ptk-timur', 'kota-pontianak', 'Pontianak Timur', 5),
  ('ptk-utara', 'kota-pontianak', 'Pontianak Utara', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wilayah_kelurahan (id, kecamatan_id, nama, sort_order) VALUES
  ('kel-pal-lima', 'ptk-barat', 'Kelurahan Pal Lima', 1),
  ('kel-sungai-beliung', 'ptk-barat', 'Kelurahan Sungai Beliung', 2),
  ('kel-sungai-jawi-dalam', 'ptk-barat', 'Kelurahan Sungai Jawi Dalam', 3),
  ('kel-sungai-jawi-luar', 'ptk-barat', 'Kelurahan Sungai Jawi Luar', 4),

  ('kel-darat-sekip', 'ptk-kota', 'Kelurahan Darat Sekip', 1),
  ('kel-mariana', 'ptk-kota', 'Kelurahan Mariana', 2),
  ('kel-sungai-bangkong', 'ptk-kota', 'Kelurahan Sungai Bangkong', 3),
  ('kel-sungai-jawi', 'ptk-kota', 'Kelurahan Sungai Jawi', 4),
  ('kel-tengah', 'ptk-kota', 'Kelurahan Tengah', 5),

  ('kel-akcaya', 'ptk-selatan', 'Kelurahan Akcaya', 1),
  ('kel-benua-melayu-darat', 'ptk-selatan', 'Kelurahan Benua Melayu Darat', 2),
  ('kel-benua-melayu-laut', 'ptk-selatan', 'Kelurahan Benua Melayu Laut', 3),
  ('kel-kota-baru', 'ptk-selatan', 'Kelurahan Kota Baru', 4),
  ('kel-parit-tokaya', 'ptk-selatan', 'Kelurahan Parit Tokaya', 5),

  ('kel-bansir-darat', 'ptk-tenggara', 'Kelurahan Bansir Darat', 1),
  ('kel-bansir-laut', 'ptk-tenggara', 'Kelurahan Bansir Laut', 2),
  ('kel-bangka-belitung-darat', 'ptk-tenggara', 'Kelurahan Bangka Belitung Darat', 3),
  ('kel-bangka-belitung-laut', 'ptk-tenggara', 'Kelurahan Bangka Belitung Laut', 4),

  ('kel-banjar-serasan', 'ptk-timur', 'Kelurahan Banjar Serasan', 1),
  ('kel-dalam-bugis', 'ptk-timur', 'Kelurahan Dalam Bugis', 2),
  ('kel-parit-mayor', 'ptk-timur', 'Kelurahan Parit Mayor', 3),
  ('kel-saigon', 'ptk-timur', 'Kelurahan Saigon', 4),
  ('kel-tambelan-sampit', 'ptk-timur', 'Kelurahan Tambelan Sampit', 5),
  ('kel-tanjung-hilir', 'ptk-timur', 'Kelurahan Tanjung Hilir', 6),
  ('kel-tanjung-hulu', 'ptk-timur', 'Kelurahan Tanjung Hulu', 7),

  ('kel-batu-layang', 'ptk-utara', 'Kelurahan Batu Layang', 1),
  ('kel-siantan-hilir', 'ptk-utara', 'Kelurahan Siantan Hilir', 2),
  ('kel-siantan-hulu', 'ptk-utara', 'Kelurahan Siantan Hulu', 3),
  ('kel-siantan-tengah', 'ptk-utara', 'Kelurahan Siantan Tengah', 4)
ON CONFLICT (id) DO NOTHING;

-- B. Master Pekerjaan
INSERT INTO public.pekerjaan_master (id, nama, sort_order) VALUES
  ('job-mrt', 'Mengurus Rumah Tangga', 1),
  ('job-buruh', 'Buruh Harian Lepas', 2),
  ('job-wiraswasta', 'Wiraswasta', 3),
  ('job-pedagang', 'Pedagang', 4),
  ('job-kecil', 'Pedagang Kecil', 5),
  ('job-karyawan', 'Karyawan Swasta', 6),
  ('job-ojek', 'Pengemudi Ojek / Kurir', 7),
  ('job-nelayan', 'Nelayan / Perikanan', 8),
  ('job-petani', 'Petani / Pekebun', 9),
  ('job-belum', 'Belum / Tidak Bekerja', 10),
  ('job-lainnya', 'Lainnya', 11)
ON CONFLICT (id) DO NOTHING;

-- C. Master Item Bantuan & Sub-Item (2023, 2025, 2026, 2027)
INSERT INTO public.item_bantuan (id, tahun, code, name, sort_order) VALUES
  ('2023-BK', '2023', 'BK', 'Bantuan Kue', 1),
  ('2023-BG', '2023', 'BG', 'Bantuan Gorengan', 2),
  ('2023-BM', '2023', 'BM', 'Bantuan Minuman', 3),
  ('2023-BW', '2023', 'BW', 'Bantuan Warung', 4),
  ('2023-BJ', '2023', 'BJ', 'Bantuan Jahit', 5),
  ('2023-BP', '2023', 'BP', 'Bantuan Pangkas', 6),
  ('2023-BS', '2023', 'BS', 'Bantuan Sembako', 7),
  ('2023-BC', '2023', 'BC', 'Bantuan Cuci Motor', 8),
  ('2023-BB', '2023', 'BB', 'Bantuan Bengkel', 9),
  ('2023-LE', '2023', 'LE', 'Bantuan Lele', 10),
  ('2025-BK', '2025', 'BK', 'Bantuan Kue', 1),
  ('2025-BG', '2025', 'BG', 'Bantuan Gorengan', 2),
  ('2025-BM', '2025', 'BM', 'Bantuan Minuman', 3),
  ('2025-BW', '2025', 'BW', 'Bantuan Warung', 4),
  ('2025-BJ', '2025', 'BJ', 'Bantuan Jahit', 5),
  ('2025-BP', '2025', 'BP', 'Bantuan Pangkas', 6),
  ('2025-BS', '2025', 'BS', 'Bantuan Sembako', 7),
  ('2025-BC', '2025', 'BC', 'Bantuan Cuci Motor', 8),
  ('2025-BB', '2025', 'BB', 'Bantuan Bengkel', 9),
  ('2026-BK', '2026', 'BK', 'Bantuan Kue', 1),
  ('2026-BG', '2026', 'BG', 'Bantuan Gorengan', 2),
  ('2026-BM', '2026', 'BM', 'Bantuan Minuman', 3),
  ('2026-BW', '2026', 'BW', 'Bantuan Warung', 4),
  ('2026-BJ', '2026', 'BJ', 'Bantuan Jahit', 5),
  ('2026-BP', '2026', 'BP', 'Bantuan Pangkas', 6),
  ('2026-BS', '2026', 'BS', 'Bantuan Sembako', 7),
  ('2026-BC', '2026', 'BC', 'Bantuan Cuci Motor', 8),
  ('2026-BB', '2026', 'BB', 'Bantuan Bengkel', 9),
  ('2027-BK', '2027', 'BK', 'Bantuan Kue', 1),
  ('2027-BG', '2027', 'BG', 'Bantuan Gorengan', 2),
  ('2027-BM', '2027', 'BM', 'Bantuan Minuman', 3),
  ('2027-BW', '2027', 'BW', 'Bantuan Warung', 4),
  ('2027-BJ', '2027', 'BJ', 'Bantuan Jahit', 5),
  ('2027-BP', '2027', 'BP', 'Bantuan Pangkas', 6),
  ('2027-BS', '2027', 'BS', 'Bantuan Sembako', 7),
  ('2027-BC', '2027', 'BC', 'Bantuan Cuci Motor', 8),
  ('2027-BB', '2027', 'BB', 'Bantuan Bengkel', 9)
ON CONFLICT (tahun, code) DO NOTHING;

INSERT INTO public.item_sub_items (id, item_id, sub_item_name, sort_order)
SELECT
  i.id || '-sub-' || s.ord,
  i.id,
  s.sub_name,
  s.ord
FROM public.item_bantuan i
JOIN (
  VALUES
    ('BK', 1, 'Mixer Stand'),
    ('BK', 2, 'Kompor Gas 1 Tungku'),
    ('BK', 3, 'Oven Kompor'),
    ('BK', 4, 'Regulator + Selang'),
    ('BK', 5, 'Loyang Kue'),
    ('BG', 1, 'Kompor Gas 1 Tungku'),
    ('BG', 2, 'Wajan Besar + Sutil'),
    ('BG', 3, 'Regulator + Selang'),
    ('BG', 4, 'Saringan Minyak'),
    ('BG', 5, 'Minyak Goreng 5 Liter'),
    ('BM', 1, 'Blender'),
    ('BM', 2, 'Cup Sealer'),
    ('BM', 3, 'Box Es / Cooler Box'),
    ('BM', 4, 'Termos Es'),
    ('BW', 1, 'Kompor Gas 2 Tungku'),
    ('BW', 2, 'Regulator + Selang'),
    ('BW', 3, 'Dispenser + Galon'),
    ('BW', 4, 'Rak Etalase Mini'),
    ('BJ', 1, 'Mesin Jahit Portable'),
    ('BJ', 2, 'Gunting Kain + Meteran'),
    ('BJ', 3, 'Paket Benang & Jarum'),
    ('BP', 1, 'Mesin Cukur Clipper'),
    ('BP', 2, 'Gunting Rambut & Sasak'),
    ('BP', 3, 'Kain Penutup & Cermin'),
    ('BS', 1, 'Beras 20 Kg'),
    ('BS', 2, 'Minyak Goreng 4 Liter'),
    ('BS', 3, 'Gula Pasir 4 Kg'),
    ('BS', 4, 'Mie Instan 2 Dus'),
    ('BC', 1, 'Mesin Steam Jet Cleaner'),
    ('BC', 2, 'Selang & Gun Semprot'),
    ('BC', 3, 'Kanebo & Sabun Cuci'),
    ('BB', 1, 'Kompresor Mini'),
    ('BB', 2, 'Kunci Pas & Kunci Ring Set'),
    ('BB', 3, 'Alat Tambal Ban'),
    ('LE', 1, 'Terpal Kolam Bulat'),
    ('LE', 2, 'Bibit Ikan Lele'),
    ('LE', 3, 'Pakan Ikan Lele'),
    ('LE', 4, 'Serok & Ember Sortir')
) AS s(code, ord, sub_name)
  ON i.code = s.code
ON CONFLICT (item_id, sub_item_name) DO NOTHING;

-- D. Seed Akun Multi-Admin Resmi MASDETA
-- Password default:
--   * vinsmoke.domi@gmail.com -> germa666
--   * la.qsas@gmail.com & 5 admin lain -> masdeta123
INSERT INTO public.internal_users (
  id, nama, email, jabatan, kontak, role, status,
  perm_add, perm_update, perm_delete, presence_status, presence_manual, password_hash
) VALUES
  (
    'usr-superadmin-1',
    'Super Admin Utama',
    'la.qsas@gmail.com',
    'Koordinator Utama Sistem',
    '081234567890',
    'SuperAdmin',
    'active',
    TRUE, TRUE, TRUE, 'offline', FALSE,
    'sha256:masdeta_seed_v1:' || encode(sha256('masdeta_seed_v1:masdeta123'::bytea), 'hex')
  ),
  (
    'usr-superadmin-2',
    'Domi',
    'vinsmoke.domi@gmail.com',
    'SuperAdmin Utama',
    '089502364007',
    'SuperAdmin',
    'active',
    TRUE, TRUE, TRUE, 'offline', FALSE,
    'sha256:masdeta_seed_v1:' || encode(sha256('masdeta_seed_v1:germa666'::bytea), 'hex')
  ),
  (
    'usr-admin-dea',
    'Dea',
    'deacantik089689@gmail.com',
    'Admin Lapangan',
    '085650830438',
    'Admin',
    'active',
    TRUE, TRUE, FALSE, 'offline', FALSE,
    'sha256:masdeta_seed_v1:' || encode(sha256('masdeta_seed_v1:masdeta123'::bytea), 'hex')
  ),
  (
    'usr-admin-dina',
    'Dina',
    'dinalestaryw123@gmail.com',
    'Admin Lapangan',
    '085654659092',
    'Admin',
    'active',
    TRUE, TRUE, FALSE, 'offline', FALSE,
    'sha256:masdeta_seed_v1:' || encode(sha256('masdeta_seed_v1:masdeta123'::bytea), 'hex')
  ),
  (
    'usr-admin-nadya',
    'Nadya',
    'rumahmakangratis55@gmail.com',
    'Admin Lapangan',
    '081253685143',
    'Admin',
    'active',
    TRUE, TRUE, FALSE, 'offline', FALSE,
    'sha256:masdeta_seed_v1:' || encode(sha256('masdeta_seed_v1:masdeta123'::bytea), 'hex')
  ),
  (
    'usr-admin-zahra',
    'Zahra',
    'zahrapariska646@gmail.com',
    'Admin Lapangan',
    '089530833517',
    'Admin',
    'active',
    TRUE, TRUE, FALSE, 'offline', FALSE,
    'sha256:masdeta_seed_v1:' || encode(sha256('masdeta_seed_v1:masdeta123'::bytea), 'hex')
  ),
  (
    'usr-admin-ridwan',
    'Ridwan',
    'ridwanridwan8765@gmail.com',
    'Admin Lapangan',
    '081251908145',
    'Admin',
    'active',
    TRUE, TRUE, FALSE, 'offline', FALSE,
    'sha256:masdeta_seed_v1:' || encode(sha256('masdeta_seed_v1:masdeta123'::bytea), 'hex')
  )
ON CONFLICT (email) DO NOTHING;
