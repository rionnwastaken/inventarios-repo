import json
import logging

from sqlalchemy.orm import selectinload

import inventario_persianas.services.catalogs as service
import inventario_persianas.model as mod
from flask import Blueprint, request
from inventario_persianas.model import (
    BlindModel,
    Color,
    FabricClassification,
    Location,
    Supplier,
    db,
)
from sqlalchemy import Select, delete
from sqlmodel import select

from inventario_persianas.services.utils import Error

log = logging.getLogger(__name__)


catalago_bp = Blueprint("catalago", __name__)


@catalago_bp.get("/colors/list")
def colors():
    colors = db.session.scalars(Select(mod.Color))
    return {
        "data": ([color.model_dump() for color in list(colors)]),
    }


@catalago_bp.post("/colors/add")
def colors_add():
    log.info("colors_add()")

    data = request.get_json()
    color_name: str = data.get("color_name")

    if not color_name:
        return {"error": "color_name must be in the body"}, 400

    color_name = color_name.capitalize()
    color_exists = db.session.scalar(
        Select(mod.Color).where(mod.Color.name == color_name)
    )

    if color_exists is not None:
        return {"error": f"Color {color_name} already exists"}, 422

    c = mod.Color(name=color_name)

    db.session.add(c)
    db.session.commit()
    return {"color": c.model_dump_json()}, 201


@catalago_bp.post("/colors/remove")
def colors_remove():
    log.info("colors_remove():")

    data = request.get_json()
    color_name: str = data.get("color_name")

    if not color_name:
        return {"error": "color_name must be in the body"}, 400

    color_name = color_name.capitalize()
    colorObj = db.session.scalar(Select(mod.Color).filter_by(name=color_name))

    if colorObj == None:
        return {"error": f"Color {color_name} was not found"}, 422

    db.session.delete(colorObj)
    db.session.commit()
    return {"color_name": color_name}, 200


@catalago_bp.post("/colors/bulk-remove")
def colors_bulk_remove():

    data = request.get_json()
    id_colors: list[int] = data.get("id_colors")

    if not id_colors:
        return {"error": "'id_colors' list[int] not passed"}, 400

    stmt = delete(Color).where(Color.id.in_(id_colors))
    try:
        db.session.execute(stmt)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 400

    return {"count_deleted": len(id_colors)}, 200


@catalago_bp.get("/all/")
def get_all_catalago():
    skip_classes = [Location]
    catalog_data = {}

    for model in mod.catalago_models:
        if model in skip_classes:
            continue

        catalog_data[model.__tablename__] = [
            obj.model_dump()
            for obj in db.session.scalars(select(model).order_by(model.id.asc()))
        ]

    catalog_data[Location.__tablename__] = [
        obj.payload()
        for obj in db.session.scalars(
            select(Location)
            .options(selectinload(Location.tags))
            .order_by(Location.id.asc())
        )
    ]

    pretty_json = json.dumps(catalog_data, indent=2, default=str)
    # log.debug(f"Catalog data:\n{pretty_json}")
    return catalog_data, 200


@catalago_bp.get("/fabric/optional_table_names_attributes")
def get_optional_attributs_of_fabric():

    models = [
        (FabricClassification, False),
        (BlindModel, True),
        (Supplier, True),
        (Color, True),
    ]

    catalog_data = {
        model.__tablename__: {"optional": optional} for model, optional in models
    }

    return catalog_data, 200


@catalago_bp.post("/add/")
def add_to_catalago():

    data = request.get_json() or {}
    table_name = data.get("table_name")
    value = data.get("value")

    if not table_name or not value:
        return Error("'table_name' or 'value' not found", 400).returnIt()

    return service.create_item(table_name, value)


@catalago_bp.post("/upload-location-image")
def upload_location_image():
    log.debug("upload_location_image()")
    files = request.files
    return service.save_image(files)


@catalago_bp.post("/update/location-image")
def update_location_image():
    log.debug("upload_location_image()")
    files = request.files
    location_id = request.form.get("id")
    description = request.form.get("description")

    if not location_id:
        return Error("FUCK YOU", 400)

    return service.update_image(files, int(location_id))


@catalago_bp.post("/location/delete/")
def location_delete():
    data = request.get_json()
    id = data.get("id")
    if not id:
        return Error("No ID provided", 400)

    return service.location_delete(id)


@catalago_bp.post("/location/update/")
def location_update():
    data = request.get_json()
    id = data.get("id")
    payload = data.get("payload")
    if not id or not payload:
        return Error(f"No ID provided or payload not provided {id} {payload}", 400)

    return service.location_update(id, payload)
