import {
  InternalUser,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalFormValues,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  ProposalTipe,
  WilayahKabKota,
} from '../types/kpm';

export const TAHUN_OPTIONS = ['2023', '2024', '2025', '2026', '2027'];

export const KECAMATAN_OPTIONS = [
  'Pontianak Barat',
  'Pontianak Kota',
  'Pontianak Selatan',
  'Pontianak Tenggara',
  'Pontianak Timur',
  'Pontianak Utara',
];

export const KELURAHAN_BY_KECAMATAN: Record<string, string[]> = {
  'Pontianak Barat': [
    'Kelurahan Pal Lima',
    'Kelurahan Sungai Beliung',
    'Kelurahan Sungai Jawi Dalam',
    'Kelurahan Sungai Jawi Luar',
  ],
  'Pontianak Kota': [
    'Kelurahan Darat Sekip',
    'Kelurahan Mariana',
    'Kelurahan Sungai Bangkong',
    'Kelurahan Sungai Jawi',
    'Kelurahan Tengah',
  ],
  'Pontianak Selatan': [
    'Kelurahan Akcaya',
    'Kelurahan Benua Melayu Darat',
    'Kelurahan Benua Melayu Laut',
    'Kelurahan Kota Baru',
    'Kelurahan Parit Tokaya',
  ],
  'Pontianak Tenggara': [
    'Kelurahan Bangka Belitung Darat',
    'Kelurahan Bangka Belitung Laut',
    'Kelurahan Bansir Darat',
    'Kelurahan Bansir Laut',
  ],
  'Pontianak Timur': [
    'Kelurahan Banjar Serasan',
    'Kelurahan Dalam Bugis',
    'Kelurahan Parit Mayor',
    'Kelurahan Saigon',
    'Kelurahan Tambelan Sampit',
    'Kelurahan Tanjung Hilir',
    'Kelurahan Tanjung Hulu',
  ],
  'Pontianak Utara': [
    'Kelurahan Batu Layang',
    'Kelurahan Siantan Hilir',
    'Kelurahan Siantan Hulu',
    'Kelurahan Siantan Tengah',
  ],
};

export const PROPOSAL_WILAYAH_OPTIONS = [
  'Kecamatan Pontianak Barat',
  'Kecamatan Pontianak Kota',
  'Kecamatan Pontianak Selatan',
  'Kecamatan Pontianak Tenggara',
  'Kecamatan Pontianak Timur',
  'Kecamatan Pontianak Utara',
  'Kelurahan Tanjung Hilir',
  'Kelurahan Tanjung Hulu',
  'Kelurahan Dalam Bugis',
  'Kelurahan Pal Lima',
  'Kelurahan Sungai Beliung',
  'Kelurahan Sungai Jawi Luar',
  'Kelurahan Sungai Jawi',
  'Kelurahan Tengah',
  'Kelurahan Akcaya',
  'Kelurahan Kota Baru',
  'Kelurahan Parit Tokaya',
  'Kelurahan Siantan Hilir',
];

export const ITEM_BANTUAN_OPTIONS = [
  'OV',
  'KPR',
  'JHT',
  'MC',
  'TKG',
  'ES',
  'CMT',
  'TBS',
  'TND',
  'MSK',
  'LE',
];

export const SUB_ITEM_SATUAN_OPTIONS = [
  'Unit',
  'Set',
  'Pcs',
  'Buah',
  'Paket',
  'Box',
  'Lusin',
  'Kg',
  'Liter',
  'Meter',
  'Roll',
  'Botol',
] as const;

export type SubItemSatuanOption = (typeof SUB_ITEM_SATUAN_OPTIONS)[number];

export const KAB_KOTA_OPTIONS = ['Kota Pontianak'];

export const INITIAL_WILAYAH_LIST: WilayahKabKota[] = [
  {
    id: 'wil-kota-pontianak',
    nama: 'Kota Pontianak',
    kecamatanList: KECAMATAN_OPTIONS.map((kec) => ({
      id: `kec-${kec.toLowerCase().replace(/\s+/g, '-')}`,
      nama: kec,
      kelurahanList: [...(KELURAHAN_BY_KECAMATAN[kec] || [])],
    })),
  },
];

export const DTSEN_OPTION_ITEMS: { value: string; label: string }[] = [
  { value: '1 - 5', label: 'Desil 1 - 5 — Kurang Mampu / Layak' },
  { value: '1', label: 'Desil 1 — Sangat Miskin (Miskin Ekstrem)' },
  { value: '2', label: 'Desil 2 — Miskin' },
  { value: '3', label: 'Desil 3 — Hampir Miskin' },
  { value: '4', label: 'Desil 4 — Rentan Miskin' },
  { value: '5', label: 'Desil 5 — Menengah Bawah / Pas-pasan' },
  { value: '6', label: 'Desil 6 — Menengah' },
  { value: '7', label: 'Desil 7 — Menengah Atas' },
  { value: '8', label: 'Desil 8 — Mapan' },
  { value: '9', label: 'Desil 9 — Kaya / Sejahtera' },
  { value: '10', label: 'Desil 10 — Sangat Kaya / Paling Mapan' },
  { value: '6 - 10', label: 'Desil 6 - 10 — Menengah ke Atas' },
  { value: 'Belum Ada Desil', label: 'Belum Ada Desil' },
  { value: 'Data Tidak Ditemukan', label: 'Data Tidak Ditemukan' },
];

export const DTSEN_OPTIONS = DTSEN_OPTION_ITEMS.map((item) => item.value);

export const PEKERJAAN_OPTIONS = [
  'Asisten Rumah Tangga',
  'Belum / Tidak Bekerja',
  'Buruh Harian Lepas',
  'Buruh Nelayan / Perikanan',
  'Buruh / Peternakan',
  'Buruh Tani / Perkebunan',
  'Dosen',
  'Guru',
  'Guru (Ngaji)',
  'Imam Masjid',
  'Industri',
  'Karyawan BUMD',
  'Karyawan BUMN',
  'Karyawan Honorer',
  'Karyawan Swasta',
  'Kepolisian RI (POLRI)',
  'Konstruksi',
  'Mekanik',
  'Mengurus Rumah Tangga',
  'Nelayan / Perikanan',
  'Pedagang',
  'Pegawai Negeri Sipil',
  'Pelajar / Mahasiswa',
  'Pelaut',
  'Pembantu Rumah Tangga',
  'Penata Rambut',
  'Penata Rias',
  'Pensiunan',
  'Perawat',
  'Perdagangan',
  'Petani / Pekebun',
  'Petani / Perkebunan',
  'Peternak',
  'Sopir',
  'Transportasi',
  'Tukang Batu',
  'Tukang Cukur',
  'Tukang Jahit',
  'Tukang Kayu',
  'Tukang Las / Pandai Besi',
  'Tukang Listrik',
  'Tukang Sol Sepatu',
  'Ustadz / Mubaligh',
  'Wartawan',
  'Wiraswasta',
];

export const PENGELOLA_TITLE_OPTIONS = [
  'Abang',
  'Adek',
  'Ami',
  'Bapak',
  'Bg',
  'Bu',
  'Bunda',
  'H.',
  'Hj.',
  'Habib',
  'Kak',
  'Pak',
  'Sy.',
  'Ustadz',
];

export const INITIAL_PENGELOLA_LIST: PengelolaProfile[] = [];

export const INITIAL_FORM_VALUES: KpmFormValues = {
  tahun: '2026',
  proposalId: null,
  proposal: '',
  kabKota: '',
  kecamatan: '',
  kelurahan: '',
  item: '',
  nama: '',
  alamat: '',
  rt: '',
  rw: '',
  nikKk: '',
  nikKtp: '',
  dtsen: '',
  validasi: '',
  kontak: '',
  pekerjaan: '',
  pengelola: '',
  catatan: '',
  payment: 0,
  documents: {
    rumah: [],
    lainnya: [],
  },
};

export const SAMPLE_KPM_RECORDS: KpmRecord[] = [];

export const PROPOSAL_TIPE_OPTIONS: ProposalTipe[] = [
  'Murni',
  'Perubahan',
];

export const ALL_KELURAHAN_OPTIONS: string[] = Array.from(
  new Set(Object.values(KELURAHAN_BY_KECAMATAN).flat())
);

export const INITIAL_PROPOSAL_FORM_VALUES: ProposalFormValues = {
  tahun: '2026',
  tipe: '',
  namaProposal: '',
  jumlahKpm: 66,
  status: 'unlocked',
  checklist: {
    docx: false,
    dinas: false,
    rab: false,
    rt: false,
    rw: false,
    lurah: false,
    camat: false,
  },
  catatan: '',
  documents: {},
};

export const INITIAL_PROPOSAL_LIST: ProposalRecord[] = [];

const CORE_ITEM_TEMPLATES: { code: string; name: string; subItems: string[] }[] = [
  {
    code: 'OV',
    name: 'Paket Oven Gas',
    subItems: ['Oven Gas', 'Mixer', 'Teflon', 'Blender'],
  },
  {
    code: 'KPR',
    name: 'Paket Kompor Gas',
    subItems: ['Kompor Gas', 'Selang Gas & Regulator (1 Set)', 'Rice Cooker', 'Dispenser', 'Blender'],
  },
  {
    code: 'JHT',
    name: 'Mesin Jahit',
    subItems: ['Mesin Jahit'],
  },
  {
    code: 'MC',
    name: 'Paket Mesin Cuci',
    subItems: ['Mesin Cuci', 'Keranjang'],
  },
  {
    code: 'TKG',
    name: 'Paket Peralatan Tukang',
    subItems: [
      'Mesin Potong Papan',
      'Mesin Gerinda Kayu',
      'Mesin Amplas',
      'Mesin Serut Kayu',
      'Mesin Bor',
    ],
  },
  {
    code: 'ES',
    name: 'Paket Peralatan Es',
    subItems: ['Alat Cup Es', 'Alat Serut Es', 'Termos Es', 'Blender'],
  },
  {
    code: 'CMT',
    name: 'Mesin Cuci Motor',
    subItems: ['Mesin Cuci Motor'],
  },
  {
    code: 'TBS',
    name: 'Paket Peralatan Tebas',
    subItems: ['Mesin Potong Rumput', 'Mini Chainsaw', 'Alat Semprot'],
  },
  {
    code: 'TND',
    name: 'Paket Tenda & Kursi',
    subItems: ['Tenda Lipat', 'Kursi Plastik (6 Unit)'],
  },
  {
    code: 'MSK',
    name: 'Paket Kompor Seribu',
    subItems: ['Kompor Seribu', 'Set Panci Teko', 'Termos Nasi', 'Blender'],
  },
];

export const INITIAL_ITEM_LIST: ItemBantuan[] = [
  // Tahun 2023 (terdapat paket LE = Lemari Es / Kulkas)
  ...CORE_ITEM_TEMPLATES.map((t) => ({
    id: `2023-${t.code}`,
    tahun: '2023',
    code: t.code,
    name: t.name,
    subItems: [...t.subItems],
  })),
  {
    id: '2023-LE',
    tahun: '2023',
    code: 'LE',
    name: 'Lemari Es',
    subItems: ['Kulkas'],
  },
  // Tahun 2025
  ...CORE_ITEM_TEMPLATES.map((t) => ({
    id: `2025-${t.code}`,
    tahun: '2025',
    code: t.code,
    name: t.name,
    subItems: [...t.subItems],
  })),
  // Tahun 2026 (tanpa LE)
  ...CORE_ITEM_TEMPLATES.map((t) => ({
    id: `2026-${t.code}`,
    tahun: '2026',
    code: t.code,
    name: t.name,
    subItems: [...t.subItems],
  })),
  // Tahun 2027
  ...CORE_ITEM_TEMPLATES.map((t) => ({
    id: `2027-${t.code}`,
    tahun: '2027',
    code: t.code,
    name: t.name,
    subItems: [...t.subItems],
  })),
];

export const INITIAL_INTERNAL_USERS: InternalUser[] = [
  {
    id: 'usr-superadmin-domi',
    nama: 'Domi',
    email: 'la.qsas@gmail.com',
    jabatan: 'SuperAdmin Utama · Pengendali Sistem',
    kontak: '',
    role: 'SuperAdmin',
    status: 'active',
    permissions: { add: true, update: true, delete: true },
    presenceStatus: 'online',
    presenceManual: false,
    registeredAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'usr-admin-domi2',
    nama: 'Domi',
    email: 'vinsmoke.domi@gmail.com',
    jabatan: 'SuperAdmin',
    kontak: '',
    role: 'SuperAdmin',
    status: 'active',
    permissions: { add: true, update: true, delete: true },
    presenceStatus: 'offline',
    presenceManual: false,
    registeredAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'usr-admin-dea',
    nama: 'Dea',
    email: 'deacantik089689@gmail.com',
    jabatan: 'Admin Pendataan',
    kontak: '',
    role: 'Admin',
    status: 'active',
    permissions: { add: true, update: true, delete: true },
    presenceStatus: 'offline',
    presenceManual: false,
    registeredAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'usr-admin-dina',
    nama: 'Dina',
    email: 'dinalestaryw123@gmail.com',
    jabatan: 'Admin Verifikasi',
    kontak: '',
    role: 'Admin',
    status: 'active',
    permissions: { add: true, update: true, delete: true },
    presenceStatus: 'offline',
    presenceManual: false,
    registeredAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'usr-admin-edo',
    nama: 'Bg Edo',
    email: 'rumahmakangratis55@gmail.com',
    jabatan: 'Admin Lapangan',
    kontak: '',
    role: 'Admin',
    status: 'active',
    permissions: { add: true, update: true, delete: true },
    presenceStatus: 'offline',
    presenceManual: false,
    registeredAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'usr-admin-zahra',
    nama: 'Zahra',
    email: 'zahrapariska646@gmail.com',
    jabatan: 'Admin Administrasi',
    kontak: '',
    role: 'Admin',
    status: 'active',
    permissions: { add: true, update: true, delete: true },
    presenceStatus: 'offline',
    presenceManual: false,
    registeredAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'usr-admin-iwan',
    nama: 'Bg Iwan',
    email: 'ridwanridwan8765@gmail.com',
    jabatan: 'Admin Lapangan',
    kontak: '',
    role: 'Admin',
    status: 'active',
    permissions: { add: true, update: true, delete: true },
    presenceStatus: 'offline',
    presenceManual: false,
    registeredAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

export const INITIAL_PROPOSAL_HISTORY: ProposalKpmHistoryEntry[] = [];

export const INITIAL_KPM_AUDIT_LOGS: KpmAuditLogEntry[] = [];



