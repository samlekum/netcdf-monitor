# pipeline/config.py

import os
from dotenv import load_dotenv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
_PID = os.getpid()

class Config:
    PROJECT_ROOT = PROJECT_ROOT

    """Konfigurasi terpusat untuk pipeline."""
    # FTP Credentials
    FTP_HOST = os.environ.get("FTP_HOST")
    FTP_USER = os.environ.get("FTP_USER")
    FTP_PASS = os.environ.get("FTP_PASS")
    FTP_REMOTE_BASE = os.environ.get("FTP_REMOTE_DIR")
    FTP_TIMEOUT = 60

    # Telegram notifikasi (opsional -- kalau kosong, notifikasi otomatis nonaktif)
    TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
    TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")

    # Filters
    FILENAME_MUST_CONTAIN = os.environ.get(
        "FILENAME_MUST_CONTAIN", "R21_FLDK.02801_02401"
    ).strip()

    # Paths
    # NOTE: TEMP_FILE & LOG_FILE sengaja disisipin PID supaya kalau
    # 01_download_data.py dijalanin beberapa instance sekaligus (paralel,
    # buat mempercepat proses download), tiap proses punya file sendiri-
    # sendiri dan gak saling tabrakan/corrupt satu sama lain.
    #
    # Konsekuensinya: monitor.py (Flask dashboard) gak bisa lagi asumsi
    # "satu log file tetap" -- makanya semua log ditaruh di LOG_DIR biar
    # gampang di-glob dan digabung (lihat get_active_log_files() di
    # monitor.py).
    TEMP_FILE = os.path.join(PROJECT_ROOT, f"temp_download_{_PID}.nc")
    FINAL_BASE_DIR = os.path.join(PROJECT_ROOT, "data_bandung")
    METADATA_BASE_DIR = os.path.join(PROJECT_ROOT, "_metadata")

    LOG_DIR = os.path.join(PROJECT_ROOT, "logs")
    LOG_FILE = os.path.join(LOG_DIR, f"download_activity_{_PID}.log")
    LOG_FILE_PATTERN = os.path.join(LOG_DIR, "download_activity_*.log")

    # Setelah berapa lama (detik) sebuah log file dianggap "basi"/proses
    # sudah selesai/mati, jadi gak usah ikut ditampilkan/digabung lagi di
    # dashboard. Default 1 jam.
    LOG_ACTIVE_MAX_AGE = 3600

    # Retry
    MAX_RETRY = 3

    # Subset bounds (Bandung area)
    BANDUNG_LAT_MIN = -7.0
    BANDUNG_LAT_MAX = -6.8
    BANDUNG_LON_MIN = 107.5
    BANDUNG_LON_MAX = 107.8

    # Kanal infrared Himawari
    TBB_CHANNELS = [f"tbb_{i:02d}" for i in range(7, 17)]  # tbb_07 ... tbb_16

    @classmethod
    def validate(cls):
        """Validasi semua env var wajib terisi, dan laporkan nama-nama yang belum diisi."""
        required = [
            ("FTP_HOST", cls.FTP_HOST),
            ("FTP_USER", cls.FTP_USER),
            ("FTP_PASS", cls.FTP_PASS),
            ("FTP_REMOTE_DIR", cls.FTP_REMOTE_BASE),
        ]
        missing = [name for name, val in required if not val]
        if missing:
            raise SystemExit(
                f"ERROR: variabel .env berikut belum diset: {', '.join(missing)}.\n"
                "Salin .env.example menjadi .env lalu isi kredensialnya."
            )


def load_config():
    """Load and validate configuration."""
    Config.validate()
    return Config