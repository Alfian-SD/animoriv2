# TASK.md — Sprint Frontend: Dynamic Mirrors, Embed Proxy Wiring & Binge Flow (`animoriv2`)

## 1. Konteks & Baseline Repositori
- **Target Proyek:** `animoriv2` (React 19 + TypeScript Strict + Vite + Tailwind CSS).
- **Baseline Git Terkini:** `3d46ad2` (Backend readiness 95/100: endpoint `/api/anime/:id/episodes/:episodeId/mirrors` dan `/api/streams/embed-proxy` sudah aktif, 30/30 test lulus, initial bundle `38.74 kB`).
- **Kontrak Domain:** Gunakan tipe `Anime`, `Episode`, `PlaybackOption`, `WatchProgress`, dan `SkipInterval` dari `src/shared/anime.ts`.

## 2. Aturan Ketat Yoake Design System (Wajib Dipatuhi)
1. **Anti-Slop Visual:** Dilarang menggunakan `uppercase` / all-caps, `box-shadow` / `drop-shadow`, `backdrop-filter: blur`, atau gradien mencolok.
2. **Palet Warna:** Gunakan token CSS Yoake (`--bg: #09090B`, `--surface: #18181B`, `--surface-2: #222227`, `--line: #27272A`, `--text: #FAFAFA`, `--text-2: #B4B4BC`, `--text-3: #8A8A93`, `--accent: #A3E635`).
3. **Bundle Discipline:** Pertahankan `import type Hls from "hls.js"` dan `await import("hls.js")` agar chunk `hls-engine` tetap terpisah dari bundle utama.

---

## 3. Daftar Tugas Atomik

### [x] Task 1: Wiring Embed Proxy, Smart Resume, & Binge Countdown di `CinemaPlayer.tsx`
- **File Target:** `src/client/player/CinemaPlayer.tsx`
- **Spesifikasi Implementasi:**
  1. Terima props `options: PlaybackOption[]`, `activeOptionIndex: number`, `onSelectOption: (index: number) => void`, `initialTime?: number`, dan `onNextEpisode?: () => void`.
  2. Untuk `activeOption.mode === "embed"`, render `<iframe>` dengan `src="/api/streams/embed-proxy?url=" + encodeURIComponent(activeOption.streamUrl)` dan `sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"`.
  3. Tambahkan *auto-failover*: jika stream gagal (`error` pada `<video>` atau `data.fatal` pada `Hls.js`), panggil `onSelectOption(activeOptionIndex + 1)` selama masih ada mirror cadangan, dan tampilkan pesan status singkat di atas/bawah pemutar (misal: *"Switched to backup server: {serverName} ({quality})"*).
  4. Pada `loadedmetadata`, terapkan `initialTime` jika `initialTime > 5 && initialTime < video.duration - 15`.
  5. Pada `ended`, tampilkan bar hitung mundur 5 detik (*"Next episode starts in 5s"*) dengan tombol **"Play now"** dan **"Cancel"** apabila `onNextEpisode` tersedia.

### [x] Task 2: Integrasi Endpoint `/mirrors` & Server Selector UI di `WatchPage.tsx`
- **File Target:** `src/client/pages/WatchPage.tsx`
- **Spesifikasi Implementasi:**
  1. Saat `anime.id` dan `currentEpisode.id` aktif, lakukan fetch ke `GET /api/anime/${encodeURIComponent(anime.id)}/episodes/${encodeURIComponent(currentEpisode.id)}/mirrors` (dengan fallback ke `currentEpisode.playbackOptions` jika request gagal atau kosong).
  2. Tampilkan bilah pemilih **Playback server & quality** di bawah area pemutar 16:9 dengan desain flat Yoake:
     - Tombol aktif menggunakan border `--accent` (`#A3E635`) dan latar `--surface-2` (`#222227`).
     - Label tombol menggunakan format natural seperti `ServerName · 1080p` (tanpa all-caps).
  3. Baca riwayat `aiku.watch-progress.v1` untuk episode aktif dan teruskan sebagai `initialTime` ke `CinemaPlayer`.
  4. Pastikan tombol **Previous episode**, **Next episode**, dan **Theater mode** tetap berfungsi selaras saat pergantian mirror.

### [x] Task 3: Pengujian Komponen / Hook & Verifikasi Build
- **File Target:** `tests/playerState.test.ts` (baru)
- **Spesifikasi Implementasi:**
  1. Ekstrak helper murni pemilihan mirror fallback & validasi `initialTime` resume (misal `resolveResumeTimestamp(savedTime, duration)`) agar dapat diuji unit test di Vitest tanpa memerlukan DOM berat.
  2. Jalankan gerbang verifikasi penuh:
     ```bash
     npm run typecheck
     npm test
     npm run build
     ```
  3. Pastikan bundle awal `dist/client/assets/index-*.js` tetap berada di bawah `50 kB`.
