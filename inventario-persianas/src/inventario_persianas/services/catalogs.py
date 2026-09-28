from pathlib import Path

from sqlmodel import select

from inventario_persianas import constants
from inventario_persianas.model import (
    Color,
)
from sqlalchemy import Delete
from sqlalchemy.orm import Session, selectinload

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
        latest_location = (
            db.session.execute(select(Location).order_by(Location.id.desc()))
            .scalars()
            .first()
        )
        sequence_number = 1
        if latest_location:
            sequence_number = latest_location.sequence_number + 1
        location = Location(image_path="", sequence_number=sequence_number)

        db.session.add(location)
        db.session.flush()

        file_path = process_file(files, location)
        location.image_path = file_path
        location_json = location.model_dump(mode="json")

        AuditLogger.log("Insert", "location", location.id, new_values=location_json)

        # log.debug(f"Saved thumbnail to {file_path}")
        return {"location": location_json}, 201


@handle_db_exceptions
def update_image(files, location_id):
    with db.session.begin():
        location = db.session.get(Location, location_id)
        if not location:
            raise ValueError(f"Location not found with id {location_id}")

        process_file(files, location)
        location_json = location.model_dump(mode="json")
        AuditLogger.log(
            "Update",
            "location",
            location.id,
            message="Image update",
            new_values={},
            old_values={},
        )
        return {"location": location_json}, 201


def process_file(files, location: Location):
    if "image" not in files:
        raise ValueError("No image file provided")

    file = files["image"]
    if file.filename == "":
        raise ValueError("No selected file")

    file_path = process_and_save_thumbnail(
        file_storage=file,
        output_dir=constants.LOCATION_IMAGES,
        filename_prefix=f"image_{location.id}",
        max_size=(300, 300),
    )

    return file_path


def process_and_save_thumbnail(
    file_storage, output_dir: str, filename_prefix: str, max_size=(300, 300)
) -> str:
    from PIL import Image, ImageOps

    """
    Optimized for high-speed, lightweight grid thumbnails.
    Uses WebP format and fast downscaling.
    """
    file_path = os.path.join(output_dir, f"{filename_prefix}.webp")
    path = Path(file_path)

    if path.exists():
        os.remove(path)

    img = Image.open(file_storage)
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    img.thumbnail(max_size, Image.Resampling.BILINEAR)

    img.save(file_path, "WEBP", quality=80, method=4)

    return file_path


@handle_db_exceptions
def location_update_data(location_data: dict, id):
    with db.session.begin():
        location = db.session.get(Location, id, options=[selectinload(Location.tags)])

        if not location:
            raise ValueError(
                f"Location was not found with if {id}, data is {location_data}"
            )

        # if location.image
