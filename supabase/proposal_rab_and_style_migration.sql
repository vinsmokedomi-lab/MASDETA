-- ============================================================================
-- MASDETA - MIGRASI TABEL RAB PROPOSAL & RIWAYAT PENGGUNAAN STYLE PROPOSAL
-- ============================================================================
-- Petunjuk Eksekusi:
-- 1. Buka Supabase Dashboard -> Project "MASDETA" -> SQL Editor -> New Query
-- 2. Tempel seluruh skrip SQL ini dan klik RUN.
-- 3. Skrip bersifat idempoten (aman dijalankan berulang kali).
-- ============================================================================

-- 1. Konfigurasi RAB tersimpan per Proposal (terhubung ke public.proposals.id TEXT)
CREATE TABLE IF NOT EXISTS public.proposal_rab_configs (
  proposal_id TEXT PRIMARY KEY REFERENCES public.proposals(id) ON DELETE CASCADE,
  proposal_name TEXT NOT NULL DEFAULT '',
  tahun VARCHAR(10) NOT NULL DEFAULT '',
  judul_rab TEXT NOT NULL DEFAULT '',
  total_anggaran NUMERIC(16, 0) NOT NULL DEFAULT 0,
  total_terhitung NUMERIC(16, 0) NOT NULL DEFAULT 0,
  pagu_standar_per_kpm NUMERIC(16, 0) NOT NULL DEFAULT 0,
  total_kpm_snapshot INTEGER NOT NULL DEFAULT 0,
  item_counts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  packages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by TEXT NOT NULL DEFAULT 'Petugas Internal',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Riwayat Penggunaan Template Style 01-15 (Anti-Duplikat)
CREATE TABLE IF NOT EXISTS public.proposal_style_history (
  id TEXT PRIMARY KEY,
  style_id INTEGER NOT NULL CHECK (style_id >= 1 AND style_id <= 15),
  proposal_id TEXT NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  nama_proposal TEXT NOT NULL DEFAULT '',
  tahun VARCHAR(10) NOT NULL DEFAULT '',
  jenis_tujuan VARCHAR(20) NOT NULL CHECK (jenis_tujuan IN ('OPD', 'Kecamatan', 'Kelurahan')),
  created_by TEXT NOT NULL DEFAULT 'Petugas Internal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indeks Performa
CREATE INDEX IF NOT EXISTS idx_proposal_rab_configs_tahun
  ON public.proposal_rab_configs (tahun);

CREATE INDEX IF NOT EXISTS idx_proposal_style_history_style_id
  ON public.proposal_style_history (style_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_style_history_proposal
  ON public.proposal_style_history (proposal_id, jenis_tujuan);

-- 4. Row Level Security (RLS) Multi-Admin sesuai pola MASDETA
ALTER TABLE public.proposal_rab_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_style_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'proposal_rab_configs',
    'proposal_style_history'
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

-- 5. Realtime Publication (Sinkronisasi Live Multi-Admin)
DO $$
DECLARE
  rt_tbl TEXT;
BEGIN
  FOREACH rt_tbl IN ARRAY ARRAY[
    'proposal_rab_configs',
    'proposal_style_history'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', rt_tbl);
    EXCEPTION WHEN duplicate_object OR undefined_object THEN
      NULL;
    END;
  END LOOP;
END $$;
