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
    r"C:\Program Files\Supermium\chrome.exe",
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


def is_webapp_browser_running(exe_name, profile_tag="supermium_webapp_profile"):
    """Check if any browser process is still running with our isolated profile."""
    try:
        output = subprocess.check_output(
            [
                "wmic",
                "process",
                "where",
                f"name='{exe_name}'",
                "get",
                "CommandLine",
            ],
            creationflags=subprocess.CREATE_NO_WINDOW,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return profile_tag in output
    except Exception:
        return False


def kill_server_tree(proc):
    """Force-kill the Python server and any child processes."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        proc.terminate()
        proc.wait()


if __name__ == "__main__":
    env = os.environ.copy()
    src_path = str(PROJECT_DIR / "src")
    env["PYTHONPATH"] = (
        f"{src_path}{os.pathsep}{env['PYTHONPATH']}"
        if "PYTHONPATH" in env
        else src_path
    )

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
                exe_name = os.path.basename(supermium_exe)  # e.g., "chrome.exe"
                profile_tag = "supermium_webapp_profile"
                profile_dir = os.path.join(tempfile.gettempdir(), profile_tag)

                subprocess.Popen(
                    [
                        supermium_exe,
                        f"--user-data-dir={profile_dir}",
                        f"--app={URL}",
                        "--no-first-run",
                        "--no-default-browser-check",
                    ]
                )

                # Wait for Supermium to initialize its window process
                time.sleep(2)

                # 2. Stay alive as long as the isolated Supermium window is open
                while is_webapp_browser_running(exe_name, profile_tag):
                    time.sleep(1)
            else:
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
        # 3. Cleanly shut down the entire server tree when the browser exits
        kill_server_tree(server_process)
