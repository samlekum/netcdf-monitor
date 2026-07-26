import os
import sys

from flask import Flask, render_template, jsonify, request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
sys.path.insert(0, PROJECT_ROOT)

from scripts.tools.count_dataset import get_statistics, human_readable
from scripts.pipeline.config import Config

app = Flask(
    __name__,
    template_folder=os.path.join(SCRIPT_DIR, "templates"),
    static_folder=os.path.join(SCRIPT_DIR, "static"),
)

LOG_TAIL_LINES = 200        # jumlah baris log terakhir yang ditampilkan
LOG_TAIL_MAX_BYTES = 200_000  # batas baca dari akhir file, biar log gede gak berat

DATASET_EXT = ".nc"

FILENAME_TEMPLATE = "subset_NC_H09_{date}_{time}_R21_FLDK.02801_02401.nc"
SLOT_INTERVAL_MINUTES = 10  # data Himawari-9 per 10 menit -> 0000, 0010, ..., 2350

def format_count(value):
    """Format angka dengan pemisah ribuan titik."""
    return f"{value:,}".replace(",", ".")


def format_size(value):
    """Format ukuran dengan pemisah desimal koma."""
    return human_readable(value).replace(".", ",")

def tail_log_lines(path, max_lines=LOG_TAIL_LINES, max_bytes=LOG_TAIL_MAX_BYTES):
    """Baca N baris terakhir dari file log tanpa load seluruh file ke memory.

    Cukup baca `max_bytes` terakhir dari file (dari belakang), baru split
    per baris. Ini penting karena log dari 01_download_data.py bisa jadi
    besar seiring waktu, jadi jangan sampai monitor jadi berat gara-gara
    baca seluruh isi file tiap 4 detik.
    """
    if not os.path.exists(path):
        return []

    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            file_size = f.tell()
            read_size = min(file_size, max_bytes)
            f.seek(file_size - read_size)
            data = f.read().decode("utf-8", errors="replace")
    except OSError:
        return []

    lines = [ln for ln in data.splitlines() if ln.strip()]
    return lines[-max_lines:]


def list_files_for_day(base_dir, month_key, day_key, ext=DATASET_EXT):
    """Cari semua file .nc yang berada di folder base_dir/.../<month_key>/<day_key>/.

    Logic path-parsing ini sengaja disamain persis kayak scan() di
    count_dataset.py (rel = relpath ke base_dir, parts[-3] = month_key,
    parts[-2] = day_key) supaya key yang dikirim dari frontend (hasil render
    breakdown dict) selalu nyambung ke folder yang bener.
    """
    results = []
    if not os.path.isdir(base_dir):
        return results

    for root, _dirs, filenames in os.walk(base_dir):
        for fn in filenames:
            if not fn.lower().endswith(ext.lower()):
                continue

            fp = os.path.join(root, fn)
            rel = os.path.relpath(fp, base_dir)
            parts = rel.split(os.sep)

            if len(parts) >= 4:
                f_month_key = parts[-3]
                f_day_key = parts[-2]
            else:
                f_month_key = "unknown"
                f_day_key = "unknown"

            if f_month_key != month_key or f_day_key != day_key:
                continue

            try:
                size = os.path.getsize(fp)
                mtime = os.path.getmtime(fp)
            except OSError:
                size = 0
                mtime = 0

            results.append({
                "name": fn,
                "size_bytes": size,
                "size_human": human_readable(size),
                "mtime": mtime,
            })

    results.sort(key=lambda x: x["mtime"], reverse=True)
    return results


def generate_time_slots(interval_minutes=SLOT_INTERVAL_MINUTES):
    """Hasilkan semua slot waktu HHMM dalam sehari, urut dari 0000 -> 2350."""
    slots = []
    for hour in range(24):
        for minute in range(0, 60, interval_minutes):
            slots.append(f"{hour:02d}{minute:02d}")
    return slots


def build_day_schedule(base_dir, month_key, day_key):
    """Bangun jadwal 144 slot (interval 10 menit) buat satu hari, tiap slot
    dicek apakah filenya udah ada (exact match nama file) atau belum.

    month_key + day_key digabung jadi YYYYMMDD sesuai posisi [tahun][bulan]
    [tanggal] di nama file, karena breakdown dict get_statistics() sudah
    memisahnya sebagai folder YYYYMM/DD.
    """
    existing_files = list_files_for_day(base_dir, month_key, day_key)
    existing_by_name = {f["name"]: f for f in existing_files}

    date_str = f"{month_key}{day_key}"
    schedule = []
    for time_str in generate_time_slots():
        expected_name = FILENAME_TEMPLATE.format(date=date_str, time=time_str)
        match = existing_by_name.get(expected_name)
        schedule.append({
            "time": time_str,
            "filename": expected_name,
            "exists": match is not None,
            "size": match["size_human"] if match else None,
        })

    return schedule


@app.route("/")
def index():
    stats = get_statistics(Config.FINAL_BASE_DIR)
    
    return render_template(
        "monitor.html",
        total_count=format_count(stats["total_count"]),
        total_size=format_size(stats["total_size"]),
        breakdown=stats["breakdown"],
        human=human_readable,
    )


@app.route("/api/statistics")
def api_statistics():
    # Satu kali scan aja -- get_statistics() sudah sekalian menghitung
    # latest_file dalam os.walk yang sama, jadi gak perlu os.walk manual
    # kedua kalinya kayak sebelumnya.
    stats = get_statistics(Config.FINAL_BASE_DIR)

    return jsonify({
        "total_count": stats["total_count"],
        "latest_file": stats["latest_file"],
    })


@app.route("/api/files")
def api_files():
    month = request.args.get("month", "").strip()
    day = request.args.get("day", "").strip()

    if not month or not day:
        return jsonify({"error": "parameter 'month' dan 'day' wajib diisi"}), 400

    schedule = build_day_schedule(Config.FINAL_BASE_DIR, month, day)
    existing_count = sum(1 for slot in schedule if slot["exists"])

    return jsonify({
        "schedule": schedule,
        "existing_count": existing_count,
        "total_slots": len(schedule),
    })


@app.route("/api/log")
def api_log():
    log_file = Config.LOG_FILE
    lines = tail_log_lines(log_file)

    seconds_since_update = None
    if os.path.exists(log_file):
        import time
        seconds_since_update = time.time() - os.path.getmtime(log_file)

    return jsonify({
        "lines": lines,
        "seconds_since_update": seconds_since_update,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)