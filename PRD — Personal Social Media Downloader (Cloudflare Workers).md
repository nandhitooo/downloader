# PRD — Personal Social Media Downloader (Cloudflare Workers)

**Versi:** 0.1 (draft) · **Owner:** Fernandhito · **Tanggal:** 12 November 2026 · **Penggunaan:** pribadi (single user)

## 1. Ringkasan

Website sederhana yang berjalan di Cloudflare Workers untuk mengunduh video/foto dari sosial media (TikTok, Instagram, Facebook, X/Twitter, Threads, dan platform lain yang bisa ditambah) cukup dengan menempel URL. Hanya untuk konten publik dan pemakaian pribadi.

## 2. Tujuan dan Non-Tujuan

**Tujuan**

- Tempel link, pilih kualitas/format, unduh. Maksimal 2 klik.
- Murah/gratis: cukup di Cloudflare free tier untuk pemakaian pribadi.
- Mudah menambah platform baru lewat arsitektur adapter.
- Aman dipakai sendiri: hanya Fernandhito yang bisa mengakses.

**Non-Tujuan**

- Bukan layanan publik, tidak ada monetisasi, tidak ada multi-user.
- Tidak mengunduh konten privat/login-only, konten DRM, atau live stream.
- Tidak menyimpan file di server (tidak ada library/arsip permanen di v1).
- Tidak ada bypass proteksi akun (tidak menyimpan cookie/password sosmed di v1).

## 3. Pengguna dan Use Case

Satu pengguna (pemilik). Use case utama:

1. Tempel URL post TikTok/IG/FB/X/Threads, lalu unduh video tanpa watermark (jika tersedia).
2. Unduh semua foto dari post carousel/galeri (opsional ZIP).
3. Ekstrak audio saja (jika sumber menyediakan track audio).
4. Dari HP: tombol Share atau PWA share target langsung mengirim link ke app.

## 4. Scope Fitur

### MVP (v1)

- Input URL tunggal, deteksi platform otomatis.
- Preview: thumbnail, judul/caption, author, durasi.
- Daftar opsi unduhan (video kualitas berbeda, foto, audio) bila tersedia.
- Unduh lewat proxy stream Worker (agar nama file benar dan lolos hotlink/CORS).
- Platform awal: TikTok, X/Twitter, Instagram (post/reel publik), Facebook (video publik), Threads.
- Penanganan error yang jelas: link tidak valid, konten privat, platform tidak didukung, upstream gagal.
- Proteksi akses (Cloudflare Access atau password sederhana).
- UI responsif, dark mode.

### v2 (opsional)

- Batch: tempel beberapa URL sekaligus.
- Unduh galeri sebagai ZIP.
- PWA + Web Share Target.
- Riwayat unduhan (metadata saja) di KV/D1.
- Penyimpanan hasil ke R2 untuk file besar atau link berumur pendek.
- Platform tambahan: YouTube Shorts, Pinterest, Reddit, Bluesky.

## 5. Arsitektur

```
Browser (React/Vite SPA)
   │  POST /api/resolve {url}
   ▼
Cloudflare Worker (Hono)
   ├─ Auth guard (Cloudflare Access / token)
   ├─ URL validator + platform detector (allowlist domain)
   ├─ Adapter registry
   │     ├─ tiktok.ts
   │     ├─ twitter.ts
   │     ├─ instagram.ts
   │     ├─ facebook.ts
   │     ├─ threads.ts
   │     └─ fallback-upstream.ts  (cobalt / extractor API / yt-dlp server)
   ├─ KV cache (hasil resolve, TTL pendek)
   └─ GET /api/download?u=<signed>  → stream proxy dengan Content-Disposition
```

**Keputusan desain penting**

- Worker tidak bisa menjalankan binary seperti yt-dlp/ffmpeg. Ekstraksi dilakukan lewat parsing HTTP/JSON di adapter, atau lewat upstream eksternal.
- IP Cloudflare sering diblokir atau dibatasi oleh Instagram/Facebook/TikTok. Karena itu wajib ada **fallback upstream**: instance cobalt self-hosted atau server kecil (VPS/rumah) yang menjalankan yt-dlp, diekspos aman lewat Cloudflare Tunnel dan dipanggil Worker dengan secret token.
- Download memakai **streaming** (`response.body` diteruskan), tanpa buffering di memori, agar aman dari batas memori Worker.
- Link unduhan ditandatangani (HMAC + expiry pendek) supaya endpoint proxy tidak bisa dipakai sebagai open proxy.

## 6. Strategi Extractor per Platform

Catatan: endpoint tidak resmi sering berubah. Tiap adapter harus terisolasi, punya test dengan URL sampel, dan mudah diganti. Verifikasi cara kerja terkini saat implementasi.

| Platform | Pendekatan utama | Fallback | Tingkat risiko |
| --- | --- | --- | --- |
| TikTok | Parse data JSON di halaman video / resolve short link (vm.tiktok.com) | Upstream extractor | Sedang |
| X/Twitter | Endpoint syndication/embed publik atau API mirror (gaya fxtwitter) | Upstream extractor | Rendah-sedang |
| Instagram | Parse halaman embed untuk post/reel publik | Upstream extractor | Tinggi |
| Facebook | Parse meta/og tag dan data video halaman publik; resolve link fb.watch | Upstream extractor | Tinggi |
| Threads | Parse data halaman/og tag post publik | Upstream extractor | Sedang |

Urutan resolve: adapter native, lalu fallback upstream, lalu error terstruktur.

## 7. Spesifikasi API

**POST `/api/resolve`**

- Request: `{ "url": "https://..." }`
- Response sukses:

```json
{
  "platform": "tiktok",
  "title": "...",
  "author": "...",
  "thumbnail": "https://...",
  "duration": 23,
  "items": [
    { "type": "video", "quality": "1080p", "ext": "mp4", "size": 5300000, "downloadUrl": "/api/download?token=..." },
    { "type": "audio", "ext": "mp3", "downloadUrl": "..." },
    { "type": "image", "ext": "jpg", "downloadUrl": "..." }
  ]
}
```

- Response error: `{ "error": { "code": "PRIVATE_CONTENT | UNSUPPORTED | UPSTREAM_FAILED | INVALID_URL | RATE_LIMITED", "message": "..." } }`

**GET `/api/download?token=...`**

- Validasi token (HMAC + expiry), stream ke klien dengan `Content-Disposition: attachment; filename=...`, dukung header `Range` bila memungkinkan.

**GET `/api/health`** — status Worker dan upstream fallback.

## 8. UI/UX

- Satu halaman: input URL besar, tombol Tempel (clipboard) dan Unduh.
- Setelah resolve: kartu preview + daftar tombol unduh per kualitas.
- State: loading, error (pesan jelas), kosong.
- Dark/light mode, mobile-first, aksesibel (label, fokus, kontras).
- v2: PWA install + Web Share Target.

## 9. Persyaratan Non-Fungsional

- **Akses:** Cloudflare Access (Zero Trust, gratis untuk sedikit user) atau fallback token/password di header.
- **Keamanan:** allowlist domain input dan domain CDN target (cegah SSRF), validasi skema https, tanda tangan link unduhan, tidak ada log URL sensitif, secret disimpan di Worker Secrets.
- **Rate limit:** batasi per IP/sesi via Workers Rate Limiting atau KV counter.
- **Performa:** resolve p95 < 3 dtk; mulai stream unduhan < 1 dtk setelah klik.
- **Biaya:** target Rp0 di free tier. Perhatikan batas free Workers (jumlah request per hari, CPU time per request, jumlah subrequest) dan cek angka terbaru di dokumentasi Cloudflare. Plan berbayar bila perlu.
- **Observability:** Workers Logs/Analytics; error adapter dicatat dengan kode platform.
- **Maintainability:** tiap adapter punya test dan fixture URL; fitur flag untuk menonaktifkan adapter yang rusak.

## 10. Tech Stack

- **Runtime:** Cloudflare Workers + Static Assets, deploy dengan Wrangler.
- **Backend:** TypeScript + Hono.
- **Frontend:** React + Vite + Tailwind (sesuai stack yang sudah dikuasai).
- **Storage:** KV (cache), opsional D1 (riwayat) dan R2 (file sementara).
- **Validasi:** Zod.
- **Test:** Vitest (+ `@cloudflare/vitest-pool-workers`).
- **Fallback server:** cobalt self-hosted atau yt-dlp di VPS, lewat Cloudflare Tunnel.

## 11. Struktur Repo (usulan)

```
/
├─ wrangler.jsonc
├─ src/
│  ├─ worker/
│  │  ├─ index.ts            # Hono app + routes
│  │  ├─ auth.ts
│  │  ├─ sign.ts             # HMAC token unduhan
│  │  ├─ detect.ts           # deteksi platform + allowlist
│  │  └─ adapters/
│  │     ├─ types.ts         # interface Adapter
│  │     ├─ tiktok.ts
│  │     ├─ twitter.ts
│  │     ├─ instagram.ts
│  │     ├─ facebook.ts
│  │     ├─ threads.ts
│  │     └─ upstream.ts
│  └─ web/                   # React SPA
└─ test/
```

Interface adapter:

```ts
interface Adapter {
  name: string;
  match(url: URL): boolean;
  resolve(url: URL, env: Env): Promise<MediaResult>;
}
```

## 12. Milestone

| Fase | Isi | Estimasi |
| --- | --- | --- |
| M0 | Setup repo, Wrangler, Hono, Access/auth, deploy hello world | 0,5 hari |
| M1 | Framework adapter, validator URL, signed download proxy, UI dasar | 1-2 hari |
| M2 | Adapter X/Twitter + TikTok | 1-2 hari |
| M3 | Adapter Threads + Facebook + Instagram | 2-3 hari |
| M4 | Fallback upstream (cobalt/yt-dlp via Tunnel) + health check | 1-2 hari |
| M5 | Polish UI, error handling, rate limit, test, dokumentasi | 1 hari |
| v2 | Batch, ZIP, PWA share target, riwayat | menyusul |

## 13. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Platform mengubah struktur halaman/endpoint | Adapter rusak | Adapter terisolasi, test fixture, fallback upstream, feature flag |
| IP Cloudflare diblokir | Resolve gagal | Upstream di server dengan IP lain via Tunnel |
| Batas free tier terlampaui | Layanan terhenti | Cache KV, batasi batch, upgrade plan bila perlu |
| Penyalahgunaan endpoint proxy | Biaya dan abuse | Auth, signed token, allowlist domain, rate limit |
| Ketentuan layanan platform dan hak cipta | Risiko hukum/akun | Pemakaian pribadi, konten publik saja, tidak didistribusikan ulang, tidak ada layanan publik |
| File besar melewati batas Worker | Unduhan gagal | Streaming murni, dukung Range, opsi R2/redirect langsung |

## 14. Kriteria Penerimaan (MVP)

- [ ] Tempel URL publik dari tiap 5 platform awal dan berhasil mendapat minimal satu opsi unduhan yang valid.
- [ ] File terunduh dengan nama dan ekstensi benar, dan bisa diputar/dibuka.
- [ ] URL tidak valid, privat, atau tidak didukung menghasilkan pesan error yang jelas.
- [ ] Tanpa autentikasi, `/api/resolve` dan `/api/download` ditolak.
- [ ] Link unduhan kedaluwarsa tidak bisa dipakai ulang.
- [ ] Domain di luar allowlist ditolak (tidak ada SSRF).
- [ ] Bila adapter native gagal, fallback upstream terpanggil otomatis.
- [ ] Berjalan stabil di mobile dan desktop.

## 15. Pertanyaan Terbuka

1. Fallback upstream: pakai cobalt self-host, API pihak ketiga, atau VPS sendiri dengan yt-dlp?
2. Perlu dukungan konten yang butuh login (misalnya IG story) dengan cookie pribadi? Jika ya, perlu desain penyimpanan secret khusus.
3. Autentikasi: Cloudflare Access (butuh domain di Cloudflare) atau password sederhana?
4. Perlu riwayat unduhan dan penyimpanan R2 di v1, atau cukup v2?
5. Domain yang akan dipakai?
