from pathlib import Path

from sqlmodel import select

from inventario_persianas import constants
from inventario_persianas.model import (
    Color,
    LocationTag,
    Tube,
)
from sqlalchemy import Delete, exists
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
        location_json = location.payload()

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
        # TODO WHY it complains if new values and olva values empty dict
        AuditLogger.log(
            "Update",
            "location",
            location.id,
            message="Image update",
            new_values={"yeah": "hey"},
            old_values={"yeah": "saywaht"},
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


@handle_db_exceptions
def location_delete(id: int):
    with db.session.begin():
        latest_location = (
            db.session.execute(select(Location).order_by(Location.id.desc()))
            .scalars()
            .first()
        )

        if not latest_location:
            raise ValueError("No existe ninguna ubicacion para eliminar")

        if latest_location.id != id:
            raise ValueError(f"Id provided {id} does not belong to the last location")

        has_tubes = db.session.query(exists().where(Tube.location_id == id)).scalar()

        if has_tubes:
            raise ValueError(
                "No se puede borrar la ubicacion ya que existen tubos asignados a la ubicacion"
            )

        location_json = latest_location.payload()
        db.session.delete(latest_location)
        db.session.flush()
        AuditLogger.log(
            "Delete", "location", id, old_values=location_json, new_values=None
        )

        return location_json, 200


@handle_db_exceptions
def location_update(id: int, payload: dict):
    log.debug("location_update:")
    log.debug("payload is ", payload)
    with db.session.begin():
        location = db.session.get(Location, id, options=[selectinload(Location.tags)])
        if not location:
            raise ValueError(f"Location with id {id} was not found")

        tags_id = payload.get("tags_id")

        if tags_id != None and not isinstance(tags_id, list):
            raise ValueError(f"attribute tags_id is not a list {tags_id}")

        before_location_json = location.payload()

        if tags_id is not None:
            current_ids = {tag.id for tag in location.tags}
            incoming_ids = set(tags_id)

            if current_ids != incoming_ids:
                statement = select(LocationTag).where(LocationTag.id.in_(incoming_ids))
                tags = list(db.session.execute(statement).scalars())

                found_ids = {tag.id for tag in tags}
                missing_ids = incoming_ids - found_ids
                if missing_ids:
                    raise ValueError(
                        f"Tag(s) with ID(s) {sorted(missing_ids)} do not exist in the database."
                    )

                log.debug(f"Updating tags of location {id} with tags {tags}")
                location.tags = tags

        db.session.add(location)
        db.session.flush()

        location_json = location.payload()

        AuditLogger.log(
            "Update",
            "location",
            location.id,
            old_values=before_location_json,
            new_values=location_json,
        )

        return {"location": location_json}, 200

        return before_location_json, 200
