# Pengunduh Media Sosial (Cloudflare Workers)

Aplikasi pribadi (single user) untuk mengunduh video/foto dari post publik
TikTok, X/Twitter, Instagram, Facebook, dan Threads. Tempel URL, pilih media,
lalu unduh lewat proxy streaming di Cloudflare Worker.

Batasan yang dipegang di repo ini:

- Hanya konten publik. Tidak ada login, cookie, atau konten DRM/privat.
- Media tidak pernah disimpan; Worker hanya meneruskan stream.
- Satu pengguna: semua akses API memakai `ACCESS_TOKEN`.

## Struktur

```
/
├─ apps/
│  ├─ web/                 # React + Vite SPA (JavaScript) → dist/
│  └─ worker/              # Cloudflare Worker (Hono, TypeScript)
│     ├─ src/
│     │  ├─ index.ts       # Hono app: /api/health, /api/resolve, /api/download
│     │  ├─ auth.ts        # Bearer token, constant-time compare
│     │  ├─ detect.ts      # validasi URL + allowlist platform
│     │  ├─ sign.ts        # HMAC-SHA256 token unduhan (15 menit)
│     │  ├─ filename.ts    # sanitasi nama file + Content-Disposition
│     │  ├─ download.ts    # proxy stream + allowlist CDN
│     │  └─ adapters/      # registry + adapter per platform + upstream
│     ├─ test/             # Vitest (pure functions)
│     ├─ wrangler.jsonc    # Static Assets + KV binding
│     └─ .dev.vars.example
├─ packages/
│  └─ shared/              # @app/shared: skema zod + tipe (TS source)
└─ package.json            # npm workspaces + scripts
```

Worker menyajikan SPA dari `apps/web/dist` lewat Workers Static Assets:
`run_worker_first` hanya untuk `/api/*`, sisanya dilayani aset dengan
SPA fallback (`not_found_handling: "single-page-application"`).

## Prasyarat

- Node.js 20+ dan npm (repo memakai npm workspaces).
- Akun Cloudflare hanya diperlukan saat deploy.

## Setup

```bash
npm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # isi nilainya
```

`.dev.vars` sudah di-gitignore. Jangan pernah commit nilai secret.

## Script root

| Script              | Fungsi                                                          |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Vite (5173) + `wrangler dev` (8787) bersamaan                   |
| `npm run dev:web`   | Hanya SPA                                                       |
| `npm run dev:worker`| Hanya Worker                                                    |
| `npm run build`     | Build SPA ke `apps/web/dist` (aset yang disajikan Worker)       |
| `npm run typecheck` | `tsc --noEmit` untuk shared dan worker                          |
| `npm test`          | Vitest (plain, tanpa Workers pool)                              |
| `npm run cobalt:up` | Jalankan cobalt lokal (Docker, port 9000)                       |
| `npm run cobalt:down`| Hentikan container cobalt lokal                                |
| `npm run cobalt:logs`| Ikuti log container cobalt lokal                               |
| `npm run deploy`    | `wrangler deploy` — hanya dijalankan manual oleh kamu           |

## Dev lokal

Wrangler membutuhkan direktori aset, jadi build SPA sekali lebih dulu:

```bash
npm run build
npm run dev
```

- SPA: http://localhost:5173 — Vite mem-proxy `/api` ke `http://127.0.0.1:8787`.
- Worker langsung: http://127.0.0.1:8787 (menyajikan `apps/web/dist`).
- KV `CACHE` disimulasikan lokal oleh Wrangler; tidak perlu namespace asli.

Uji cepat:

```bash
curl -i http://127.0.0.1:8787/api/health
curl -i -X POST http://127.0.0.1:8787/api/resolve \
  -H 'Content-Type: application/json' -d '{"url":"https://x.com/jack/status/20"}'
```

## Nama secret (isi nilainya sendiri)

| Nama              | Wajib | Keterangan                                       |
| ----------------- | ----- | ------------------------------------------------ |
| `ACCESS_TOKEN`    | ya    | Token Bearer untuk `/api/resolve`                |
| `SIGNING_SECRET`  | ya    | Kunci HMAC untuk link unduhan                    |
| `UPSTREAM_URL`    | tidak | Base URL instance cobalt (fallback)              |
| `UPSTREAM_API_KEY`| tidak | API key instance cobalt (header `Api-Key`)       |

Buat nilai acak, misalnya: `openssl rand -hex 32`.

## Deploy (jalankan manual)

```bash
npm run build

cd apps/worker
npx wrangler kv namespace create CACHE      # salin id ke wrangler.jsonc
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put SIGNING_SECRET
npx wrangler secret put UPSTREAM_URL        # opsional
npx wrangler secret put UPSTREAM_API_KEY    # opsional
cd ../..

npm run deploy
```

Ganti `id` di `kv_namespaces` pada `apps/worker/wrangler.jsonc` dengan id KV
yang dibuat di akunmu (nilai placeholder saat ini bukan namespace nyata).

## Upstream (cobalt)

Adapter native hanya ada untuk X. Platform lain memanggil API yang kompatibel
dengan [cobalt](https://github.com/imputnet/cobalt).

### Lokal (Docker)

Compose file ada di `infra/cobalt/docker-compose.yml` (di luar npm workspaces):
image `ghcr.io/imputnet/cobalt:11`, port `9000`, `API_URL=http://localhost:9000/`.

```bash
npm run cobalt:up     # docker compose up -d
npm run cobalt:logs   # lihat log
npm run cobalt:down   # hentikan container
```

Lalu set `UPSTREAM_URL=http://localhost:9000` di `apps/worker/.dev.vars`
(contohnya ada di `.dev.vars.example`). Endpoint unduhan mengizinkan target
hanya jika origin-nya (scheme + host + port) sama persis dengan `UPSTREAM_URL`,
atau https di host CDN yang sudah di-allowlist.

### Produksi

Instance cobalt harus berjalan di VPS atau server rumah, lalu diekspos lewat
Cloudflare Tunnel (nama variabel saja, tanpa secret):

```bash
cloudflared tunnel --url http://localhost:9000
```

Set `UPSTREAM_URL` ke URL tunnel tersebut (mis. `https://cobalt.contoh.dev`) dan,
jika instance memakai API key, set `UPSTREAM_API_KEY`. Worker mengirim
`Authorization: Api-Key <UPSTREAM_API_KEY>`. Host tunnel otomatis ikut
di-allowlist pada endpoint unduhan.

Catatan: IP Cloudflare sering dibatasi Instagram/Facebook/TikTok. Instance
cobalt di mesin sendiri (lewat Tunnel) membuat resolve tetap berjalan.

## Endpoint

- `POST /api/resolve` — `Authorization: Bearer <ACCESS_TOKEN>`, body `{ "url": "https://..." }`.
  Cache KV 10 menit, rate limit 30 permintaan / 10 menit per IP.
- `GET /api/download?token=...` — token HMAC bertanda tangan (15 menit), verifikasi
  host target terhadap allowlist CDN, stream dengan dukungan `Range`.
- `GET /api/health` — publik, melaporkan status Worker dan apakah upstream diset.

Error selalu berbentuk `{ "error": { "code": "...", "message": "..." } }` dengan
kode `INVALID_URL | UNSUPPORTED | PRIVATE_CONTENT | UPSTREAM_FAILED | RATE_LIMITED | UNAUTHORIZED`.

## Adapter

| Platform  | Implementasi | Catatan                                              |
| --------- | ------------ | ---------------------------------------------------- |
| X/Twitter | native       | endpoint syndication (bentuk respons diverifikasi)   |
| TikTok    | upstream     | halaman publik tidak memberi data media yang terverifikasi |
| Instagram | upstream     | halaman publik login/CAPTCHA gated                   |
| Facebook  | upstream     | halaman publik login gated                           |
| Threads   | upstream     | belum terverifikasi                                  |

Lokasi `TODO(verify)`:

- `apps/worker/src/adapters/tiktok.ts`
- `apps/worker/src/adapters/instagram.ts`
- `apps/worker/src/adapters/facebook.ts`
- `apps/worker/src/adapters/threads.ts`

## Pemakaian

Untuk pemakaian pribadi, konten publik, dan hak cipta tetap milik pemiliknya.
Jangan jadikan instance ini publik.
