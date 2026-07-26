# NetCDF Monitor

NetCDF Monitor adalah aplikasi web untuk memantau proses download data NetCDF secara real-time, menampilkan status unduhan, dan membaca log proses secara live melalui browser.

Proyek ini dirancang untuk menangani skenario download paralel, sehingga beberapa instance proses download dapat berjalan bersamaan tanpa saling menimpa output log. Setiap proses diberi log file terpisah berdasarkan PID, lalu seluruh log aktif digabungkan kembali pada tampilan web agar tetap mudah dipantau.

## Fitur Utama

- Live monitoring proses download NetCDF
- Log viewer khusus di halaman `/logs`
- Dukungan untuk beberapa proses download paralel
- Log per proses berdasarkan PID
- Filter log berdasarkan PID dan level
- Tampilan log bergaya terminal
- Update log secara append-only untuk mengurangi beban DOM
- Endpoint log terstruktur untuk integrasi frontend yang lebih rapi
- Layout responsif untuk desktop dan mobile
- Perbaikan bug pada panel log dashboard lama
- Perbaikan tombol jump-to-latest yang sebelumnya tidak dapat disembunyikan dengan benar

## Masalah yang Diselesaikan

Sebelum refactor ini, proses `01_download_data.py` menggunakan satu file log yang sama. Ketika ada lebih dari satu instance yang berjalan, log dapat saling menimpa atau bercampur tanpa jejak asal prosesnya.

Selain itu, panel log pada dashboard utama sebelumnya memanggil fungsi `renderLog` dan `renderStatus`, tetapi fungsi tersebut tidak pernah didefinisikan. Akibatnya, panel log gagal bekerja secara diam-diam setiap beberapa detik dan memberikan pengalaman monitoring yang tidak stabil.

Solusinya adalah memisahkan viewer log ke halaman khusus `/logs`, lalu membuat endpoint log yang mengembalikan data terstruktur agar frontend bisa melakukan filter, merge, dan rendering dengan lebih aman.

## Arsitektur Singkat

### 1. Proses Download

Setiap instance download menulis ke file log tersendiri di direktori `logs/`.

Nama file log mengikuti pola berbasis PID sehingga tidak terjadi collision antar proses.

### 2. Deteksi Proses Aktif

Aplikasi menyediakan fungsi untuk mendeteksi:

- File log aktif
- PID proses yang masih berjalan

Fungsi ini dipakai untuk menggabungkan log dari semua proses aktif pada tampilan web.

### 3. API Log

Endpoint `/api/log` mengembalikan data log dalam bentuk terstruktur:

```json
{
  "ts": "2026-07-27T10:20:30Z",
  "pid": 12345,
  "level": "INFO",
  "message": "Downloading file..."
}
```

Selain itu, endpoint ini juga mengembalikan daftar `active_pids` agar frontend bisa menampilkan filter proses secara dinamis.

### 4. Halaman `/logs`

Halaman `/logs` berfungsi sebagai live log viewer terpisah dari dashboard utama.

Karakteristik utamanya:

- Gaya terminal
- Update real-time
- Filter proses
- Filter level log
- Append-only rendering
- Desain responsif sampai lebar layar 400px

## Struktur File Log

Log disimpan di dalam direktori `logs/` dan dipisahkan per PID.

Contoh pola file:

```text
logs/download_12345.log
logs/download_67890.log
```

Catatan: nama file aktual bergantung pada implementasi `LOG_FILE_PATTERN` di project.

## Format Log

Setiap baris log ditandai PID agar mudah dilacak ketika beberapa proses sedang aktif.

Contoh:

```text
[2026-07-27 10:20:30] [PID 12345] [INFO] Started downloading data
[2026-07-27 10:20:31] [PID 12345] [INFO] Fetching chunk 1/10
[2026-07-27 10:20:35] [PID 12345] [SUCCESS] Download completed
```

## Endpoint

### `GET /api/log`

Mengembalikan daftar log terstruktur dari seluruh proses aktif.

Respons berisi:

- `ts`
- `pid`
- `level`
- `message`
- `active_pids`

### `GET /logs`

Menampilkan halaman live log viewer.

## Perubahan Utama dari Versi Sebelumnya

- Log file dipindahkan ke `logs/`
- Nama file log diikat ke PID
- Log line diberi tag PID
- Ditambahkan penggabungan log dari proses aktif
- Dashboard log lama diganti halaman `/logs`
- API log kini mengembalikan struktur data, bukan string mentah
- Tombol jump-to-latest diperbaiki
- Rendering log dibuat append-only
- Layout dibuat responsif

## Kebutuhan Sistem

Proyek ini diasumsikan berjalan pada lingkungan Python dan web server lokal/produksi yang mampu menjalankan aplikasi monitoring.

Kebutuhan umum yang biasanya diperlukan:

- Python 3.10+
- Flask atau framework web setara
- Akses filesystem untuk menyimpan log
- Browser modern
- Proses download yang menghasilkan log file per PID

Jika proyek menggunakan dependensi tambahan, pastikan dependensi tersebut tersedia di `requirements.txt`.

## Instalasi

Clone repository:

```bash
git clone https://github.com/samlekum/netcdf-monitor.git
cd netcdf-monitor
```

Buat virtual environment:

```bash
python -m venv .venv
```

Aktifkan environment.

Windows:

```powershell
.venv\Scripts\activate
```

Linux / macOS:

```bash
source .venv/bin/activate
```

Install dependency:

```bash
pip install -r requirements.txt
```

## Konfigurasi

Jika proyek menggunakan file `.env`, siapkan variabel yang dibutuhkan sesuai implementasi aplikasi.

Contoh umum:

```env
LOG_DIR=logs
LOG_ACTIVE_MAX_AGE=300
```

Jika terdapat konfigurasi tambahan seperti:

- Folder data
- Lokasi file NetCDF
- Host server
- Port server
- Interval polling
- Batas retry download

tambahkan sesuai kebutuhan project.

## Menjalankan Aplikasi

Jalankan aplikasi sesuai entry point yang digunakan di repository.

Contoh umum:

```bash
python app.py
```

atau:

```bash
flask run
```

Setelah aplikasi berjalan, buka:

```text
http://127.0.0.1:5000/
```

Halaman log live dapat dibuka di:

```text
http://127.0.0.1:5000/logs
```

## Alur Penggunaan

1. Jalankan aplikasi monitor.
2. Jalankan proses `01_download_data.py`.
3. Bila ada beberapa proses download paralel, masing-masing akan menulis log ke file berbeda.
4. Buka halaman `/logs` untuk melihat seluruh log aktif.
5. Gunakan filter PID atau level log untuk fokus ke proses tertentu.
6. Pantau status download secara langsung tanpa perlu membuka file log manual.

## Pengembangan Lanjutan

Beberapa fitur yang dapat ditambahkan:

- Auto-refresh interval yang dapat diatur pengguna
- Pencarian teks log
- Export log ke `.txt`
- Download log per PID
- Indikator proses hidup/mati
- WebSocket untuk update real-time tanpa polling
- Retention policy untuk log lama
- Retry indicator untuk proses download yang gagal

## Catatan Implementasi

Beberapa detail penting yang perlu dijaga:

- Jangan menulis beberapa proses ke satu file log yang sama.
- Jangan membangun ulang seluruh DOM log pada setiap polling jika cukup append baris baru.
- Jangan menimpa `[hidden]` dengan `display: flex` pada elemen yang seharusnya disembunyikan.
- Pastikan frontend memahami format log terstruktur dari API.
- Bersihkan log lama secara berkala jika proses aktif sudah selesai.

## Lisensi

Tambahkan lisensi sesuai kebutuhan proyek, misalnya:

- MIT
- Apache 2.0
- GPL-3.0
- Proprietary

## Kontribusi

Pull request dan issue dipersilakan jika repository ini dibuka untuk kolaborasi.

Saran kontribusi:

- Perbaikan UI log viewer
- WebSocket live update
- Sistem rotasi log
- Optimasi polling API
- Peningkatan deteksi proses aktif

## Penulis

Dikembangkan untuk kebutuhan monitoring proses download NetCDF.
