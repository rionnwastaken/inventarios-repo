from inventario_persianas import constants
from inventario_persianas.model import (
    Color,
)
from sqlalchemy import Delete
from sqlalchemy.orm import Session

from inventario_persianas.services.core import handle_db_exceptions

from inventario_persianas.model import (
    Location,
    db,
)
from inventario_persianas.services.utils import AuditLogger
import os
import logging

log = logging.getLogger(__name__)


def add_color(db: Session, color_name: str):
    color = Color(name=color_name)
    db.add(color)
    db.commit()


def delete_color(db: Session, id: int):
    db.execute(Delete(Color).where(Color.id == id))
    db.commit()


@handle_db_exceptions
def save_image(files):
    with db.session.begin():
        if "image" not in files:
            raise ValueError("No image file provided")

        file = files["image"]
        if file.filename == "":
            raise ValueError("No selected file")

        # 1. Instantiate location and generate ID
        location = Location(image_path="")
        db.session.add(location)
        db.session.flush()

        # 2. Process binary file and save thumbnail via helper
        file_path = process_and_save_thumbnail(
            file_storage=file,
            output_dir=constants.LOCATION_IMAGES,
            filename_prefix=f"image_{location.id}",
            max_size=(300, 300),
        )

        # 3. Update database record with final file path
        location.image_path = file_path
        location_json = location.model_dump(mode="json")

        AuditLogger.log("Insert", "location", location.id, new_values=location_json)

        log.debug(f"Saved thumbnail to {file_path}")
        return {"location": location_json}, 201


def process_and_save_thumbnail(
    file_storage, output_dir: str, filename_prefix: str, max_size=(300, 300)
) -> str:
    from PIL import Image, ImageOps

    """
    Optimized for high-speed, lightweight grid thumbnails.
    Uses WebP format and fast downscaling.
    """
    file_path = os.path.join(output_dir, f"{filename_prefix}.webp")
    img = Image.open(file_storage)
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    img.thumbnail(max_size, Image.Resampling.BILINEAR)

    img.save(file_path, "WEBP", quality=80, method=4)

    return file_path
