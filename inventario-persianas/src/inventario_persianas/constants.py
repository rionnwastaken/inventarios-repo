from pathlib import Path

import platformdirs

ROOT = Path(platformdirs.user_data_dir("inverntarios-persianas"))
ROOT.parent.mkdir(parents=True, exist_ok=True)


DATABASE_PATH = ROOT / "inventarios.db"
LOCATION_IMAGES = (
    ROOT / "location_images"
)  # Images for the real locations where tubes go
