export interface ChangelogRelease {
  version: string;
  title: string;
  releasedAt: string;
  badge?: string;
  highlights: string[];
}

export const APP_CHANGELOG: ChangelogRelease[] = [
  {
    version: '1.1.2',
    title: 'Notifikasi Cerdas, Presensi Akurat & Riwayat Pembaruan',
    releasedAt: '16 Nov 2026, 21:50 WIB',
    badge: 'Versi Terbaru',
    highlights: [
      'Notifikasi Pendaftaran Akun Khusus SuperAdmin: Pemberitahuan pendaftar akun baru hanya dikirim ke SuperAdmin agar Admin lain tidak menerima notifikasi yang tidak relevan.',
      'Notifikasi Proposal Dihapus: Seluruh SuperAdmin, Admin, dan Viewer menerima notifikasi saat proposal dihapus beserta tombol tutup pesan (X) pada banner notis.',
      'Presensi Aktif Lebih Akurat: Status "Sedang Aktif" kini lebih responsif mengikuti interaksi pengguna di aplikasi serta transisi cepat saat layar dimatikan atau aplikasi ditutup.',
      'Catatan Pembaruan Ringkas: Kotak Catatan Pembaruan saat update APK kini menampilkan ringkasan rilis terbaru saja agar mudah dibaca.',
      'Menu Riwayat Pembaruan (Changelog): Menambahkan halaman khusus di Menu untuk melihat catatan perubahan aplikasi lengkap dari v1.0.0 hingga v1.1.2.',
    ],
  },
  {
    version: '1.1.1',
    title: 'Scan KTP/KK Otomatis, Tempat Sampah & Keamanan SuperAdmin',
    releasedAt: '16 Nov 2026, 21:03 WIB',
    highlights: [
      'Scan KTP & KK Otomatis: Unggah foto KTP dan KK saat pendaftaran KPM untuk mengisi data formulir secara otomatis.',
      'Deteksi Duplikasi NIK / KK Lintas Tahun: Pengecekan NIK & Nomor KK ganda lintas tahun anggaran beserta reset dot merah otomatis setelah diperiksa.',
      'Tempat Sampah 30 Hari: KPM dan Proposal yang dihapus tersimpan aman selama 30 hari untuk dipulihkan sewaktu-waktu.',
      'Jadwal & Target Proposal serta Matriks Kelengkapan Berkas: Pantau tenggat pengantaran dinas dan status cap/dokumen per proposal.',
      'Keamanan Reset Sistem SuperAdmin: Seluruh aksi hapus massal dan reset data mewajibkan konfirmasi ganda kata sandi SuperAdmin.',
      'Centang Status Chat & Notifikasi Android: Penanda terkirim, masuk, dan dibaca secara real-time, notifikasi latar belakang APK, serta alias nama pribadi.',
      'Penyederhanaan PDF Detail KPM: Menghapus baris Biaya Administrasi agar berkas cetak lebih ringkas.',
    ],
  },
  {
    version: '1.1.0',
    title: 'Transfer KPM Massal, Cek Bansos Kemensos & DTSEN Interaktif',
    releasedAt: '16 Nov 2026, 20:13 WIB',
    highlights: [
      'Transfer KPM Antar Proposal / Tahun: Pindahkan banyak data KPM sekaligus antar proposal domisili atau lintas tahun anggaran tanpa input ulang.',
      'Integrasi Cek Bansos Kemensos: Klik NIK KTP pada detail KPM untuk membuka cekbansos.kemensos.go.id dengan pengisian NIK otomatis di APK Android.',
      'Klasifikasi DTSEN Interaktif: Ketuk tiap peringkat Desil (termasuk kategori "Data Tidak Ditemukan") untuk membuka daftar KPM dengan pencarian dan filter.',
      'Obrolan & Waktu Aktif Lebih Bersih: Tampilan daftar chat ringkas dengan indikator waktu aktif relatif dan tombol tambah calon KPM disembunyikan saat proposal terkunci.',
    ],
  },
  {
    version: '1.0.5',
    title: 'Validasi Online-Only & Penyelarasan Arsip Berkas',
    releasedAt: '16 Nov 2026, 16:16 WIB',
    highlights: [
      'Kewajiban Koneksi Internet: Aplikasi memvalidasi akses internet aktif saat dibuka untuk mencegah input offline yang tidak tersinkronisasi.',
      'Penyederhanaan Arsip Berkas Ditolak: Menghapus elemen pengembalian fisik dan nomor HP yang tidak diperlukan pada daftar arsip.',
      'Pembaruan Ikon Launcher & Header Dashboard: Penyesuaian proporsi logo aplikasi Android dan perapian kartu ringkasan Dashboard.',
    ],
  },
  {
    version: '1.0.4',
    title: 'Cetak PDF F4, Ekspor Excel & Kartu Ringkas KPM',
    releasedAt: '16 Nov 2026, 09:48 WIB',
    highlights: [
      'Download PDF F4 (216 × 310 mm) Portrait: Pengaturan margin 1,5 cm kiri dan pilihan kolom kustom hingga maksimal 10 kolom tabel otomatis.',
      'Ekspor Data Format Excel (.xlsx): Mengunduh rekapitulasi KPM terpilih langsung dalam format spreadsheet siap olah.',
      'Unduh PDF Detail KPM A4 Penuh & Kartu Chat: Cetak biodata KPM lengkap 1 halaman A4 serta fitur bagikan kartu ringkas KPM langsung ke Obrolan.',
    ],
  },
  {
    version: '1.0.3',
    title: 'Kategori Wilayah Proposal & Penguncian Berkas Dinas',
    releasedAt: '16 Nov 2026, 05:22 WIB',
    highlights: [
      'Pengelompokan Proposal Kecamatan & Kelurahan: Penyusunan kartu proposal lebih terstruktur dengan deteksi ukuran judul dinamis.',
      'Kunci Proposal & Status Pengantaran Dinas: Penguncian berkas proposal agar tidak berubah saat diajukan ke Dinas beserta status progresnya.',
      'Checklist Kelengkapan Dokumen Proposal: Penandaan status DOCX, RAB, serta tanda tangan/cap RT, RW, Lurah, dan Camat.',
    ],
  },
  {
    version: '1.0.2',
    title: 'Master Wilayah, Pengelola Lapangan & Pembaruan APK',
    releasedAt: '15 Nov 2026, 17:16 WIB',
    highlights: [
      'Manajemen Wilayah Kota Pontianak: Pengelolaan daftar Kabupaten/Kota, Kecamatan, dan Kelurahan sebagai rujukan domisili KPM dan Proposal.',
      'Database Pengelola & Pekerjaan: Profil pengelola lapangan dan daftar profesi yang bisa langsung difilter hingga ke daftar KPM binaan.',
      'Profil Pengguna & Pembaruan APK In-App: Halaman edit profil, ganti kata sandi, serta pengecekan dan pengunduhan rilis APK terbaru langsung dari aplikasi.',
    ],
  },
  {
    version: '1.0.1',
    title: 'Sinkronisasi Cloud Multi-Admin, Drive & Obrolan Internal',
    releasedAt: '15 Nov 2026, 13:17 WIB',
    highlights: [
      'Sinkronisasi Cloud Real-Time: Perubahan data KPM, proposal, dan status validasi langsung tersinkron ke seluruh perangkat admin.',
      'Penyimpanan Dokumen Google Drive: Foto KTP, KK, rumah, dan lampiran berkas tersimpan terpusat dan dapat dipratinjau dari aplikasi.',
      'Obrolan 1-on-1 & Audit Log: Pesan langsung antar petugas lapangan/admin serta riwayat perubahan status KPM dan Proposal.',
    ],
  },
  {
    version: '1.0.0',
    title: 'Rilis Perdana MASDETA',
    releasedAt: '14 Nov 2026, 10:19 WIB',
    highlights: [
      'Dashboard Ringkasan Per Tahun Anggaran: Statistik total KPM diterima, menunggu, ditolak, dan jumlah proposal aktif.',
      'Pendataan & Validasi Calon KPM: Formulir pendaftaran KPM lengkap dengan NIK KTP, KK, Desil, alamat RT/RW, dan dokumen pendukung.',
      'Katalog Item Bantuan & Proposal: Pengelolaan item utama, sub-item, nominal bantuan, dan kuota proposal.',
      'Kontrol Peran Pengguna: Pembagian hak akses SuperAdmin, Admin, dan Viewer untuk keamanan data.',
    ],
  },
];
