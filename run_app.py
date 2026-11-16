import os
import socket
import subprocess
import sys
import tempfile
import time
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
PORT = 9999
URL = f"http://{HOST}:{PORT}"

# Project root directory where Flask/SQLite expects to run
PROJECT_DIR = Path(__file__).resolve().parent / "inventario-persianas"
APP_SCRIPT = PROJECT_DIR / "src" / "inventario_persianas" / "main.py"

# Common Supermium install locations on Windows 7
SUPERMIUM_PATHS = [
    r"C:\Program Files\Supermium\supermium.exe",
    r"C:\Program Files (x86)\Supermium\supermium.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Supermium\Application\supermium.exe"),
]


def find_supermium():
    """Return the Supermium executable path on Windows, or None on Linux/if not found."""
    if os.name != "nt":
        return None
    for path in SUPERMIUM_PATHS:
        if os.path.exists(path):
            return path
    return None


def wait_for_server(host=HOST, port=PORT, timeout=15):
    """Wait until the local server accepts TCP connections."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.2)
    return False


if __name__ == "__main__":
    # Optional: ensures `from inventario_persianas...` imports work cleanly
    env = os.environ.copy()
    src_path = str(PROJECT_DIR / "src")
    env["PYTHONPATH"] = (
        f"{src_path}{os.pathsep}{env['PYTHONPATH']}"
        if "PYTHONPATH" in env
        else src_path
    )

    # Hide the console window on Windows when launching the Flask subprocess
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

    # 1. Start the local web server with cwd set to inventario-persianas
    server_process = subprocess.Popen(
        [sys.executable, str(APP_SCRIPT)],
        cwd=str(PROJECT_DIR),
        env=env,
        creationflags=creation_flags,
    )

    try:
        if wait_for_server():
            supermium_exe = find_supermium()

            if supermium_exe:
                # Windows 7 with Supermium: isolated app window tied to server lifespan
                profile_dir = os.path.join(
                    tempfile.gettempdir(), "supermium_webapp_profile"
                )
                browser_process = subprocess.Popen(
                    [
                        supermium_exe,
                        f"--user-data-dir={profile_dir}",
                        f"--app={URL}",
                        "--no-first-run",
                        "--no-default-browser-check",
                    ]
                )
                browser_process.wait()
            else:
                # Fallback (Linux or Windows without Supermium): open default browser
                webbrowser.open(URL)
                print(
                    f"Server running at {URL}. Press Ctrl+C in this terminal to stop."
                )
                server_process.wait()
        else:
            print(f"Timed out waiting for {APP_SCRIPT} on port {PORT}.")
    except KeyboardInterrupt:
        pass
    finally:
        # 2. Cleanly shut down the Python server when the browser/terminal exits
        if server_process.poll() is None:
            server_process.terminate()
            server_process.wait()
