# scripts/tools/count_dataset.py
"""Hitung jumlah & total ukuran file .nc di FINAL_BASE_DIR, dengan breakdown per bulan dan tanggal."""

import argparse
import os
import sys
from collections import defaultdict

# Supaya bisa import pipeline.config walau script ini dipanggil dari folder lain
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "scripts"))

from pipeline.config import Config  # noqa: E402


def human_readable(num_bytes: float) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if num_bytes < 1024:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024
    return f"{num_bytes:.2f} PB"


def scan(base_dir: str, ext: str):
    """Scan folder data_bandung/jma/netcdf/YYYYMM/DD/*.nc sekali jalan.

    Return total_count, total_size, breakdown per bulan & tanggal, DAN
    latest_file (file .nc dengan mtime paling baru) -- semuanya dihitung
    dalam satu os.walk yang sama, biar gak perlu scan dua kali kalau ada
    yang butuh info "file terbaru" (misalnya endpoint /api/statistics).
    """
    total_count = 0
    total_size = 0
    breakdown = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # [count, size]
    latest_file = None
    latest_mtime = 0

    for root, _dirs, files in os.walk(base_dir):
        for fname in files:
            if not fname.lower().endswith(ext.lower()):
                continue

            fpath = os.path.join(root, fname)
            try:
                fsize = os.path.getsize(fpath)
                fmtime = os.path.getmtime(fpath)
            except OSError:
                continue

            rel = os.path.relpath(fpath, base_dir)
            parts = rel.split(os.sep)
            # parts biasanya: ["jma", "netcdf", "YYYYMM", "DD", "file.nc"]
            if len(parts) >= 4:
                month_key = parts[-3]
                day_key = parts[-2]
            else:
                month_key = "unknown"
                day_key = "unknown"

            breakdown[month_key][day_key][0] += 1
            breakdown[month_key][day_key][1] += fsize

            total_count += 1
            total_size += fsize

            if fmtime > latest_mtime:
                latest_mtime = fmtime
                latest_file = fname

    return total_count, total_size, breakdown, latest_file


def get_statistics(base_dir: str, ext: str = ".nc"):
    total_count, total_size, breakdown, latest_file = scan(base_dir, ext)

    return {
        "total_count": total_count,
        "total_size": total_size,
        "breakdown": breakdown,
        "latest_file": latest_file,
    }


def main():
    parser = argparse.ArgumentParser(description="Hitung jumlah & size file dataset.")
    parser.add_argument(
        "--ext", default=".nc", help="Ekstensi file yang dihitung (default: .nc)"
    )
    parser.add_argument(
        "--dir",
        default=Config.FINAL_BASE_DIR,
        help="Folder yang di-scan (default: FINAL_BASE_DIR dari config)",
    )
    args = parser.parse_args()

    base_dir = args.dir
    if not os.path.isdir(base_dir):
        print(f"ERROR: folder tidak ditemukan -> {base_dir}")
        sys.exit(1)

    print(f"Scanning: {base_dir}")
    print(f"Ekstensi : {args.ext}")
    print("-" * 50)

    stats = get_statistics(base_dir, args.ext)
    breakdown = stats["breakdown"]

    for month_key in sorted(breakdown.keys()):
        days = breakdown[month_key]
        month_count = sum(v[0] for v in days.values())
        month_size = sum(v[1] for v in days.values())
        print(f"\n[{month_key}] {month_count} file - {human_readable(month_size)}")
        for day_key in sorted(days.keys()):
            count, size = days[day_key]
            print(f"    {day_key}: {count} file - {human_readable(size)}")

    print("\n" + "=" * 50)
    print(f"TOTAL FILE : {stats['total_count']}")
    print(f"TOTAL SIZE : {human_readable(stats['total_size'])}")
    if stats["latest_file"]:
        print(f"FILE TERBARU: {stats['latest_file']}")
    print("=" * 50)


if __name__ == "__main__":
    main()