from flask import Blueprint,request
from sqlalchemy import Delete, Select, delete
import inventario_persianas.services.catalogs as catalago
from inventario_persianas.model import Color, db
import inventario_persianas.model as mod
import logging

log = logging.getLogger(__name__)


catalago_bp = Blueprint("catalago",__name__)



@catalago_bp.get('/colors/list')
def colors():
    colors = db.session.scalars(Select(mod.Color))
    return {"data":([ color.model_dump() for color in list(colors)]),}


@catalago_bp.post('/colors/add')
def colors_add():
    log.info("colors_add()")

    data = request.get_json()
    color_name:str = data.get("color_name")

    if not color_name:
        return {"error":"color_name must be in the body"},400

    color_name = color_name.capitalize()
    color_exists = db.session.scalar(Select(mod.Color).where(mod.Color.name == color_name))

    if color_exists is not None:
        return {"error":f"Color {color_name} already exists"},422


    c = mod.Color(name=color_name)

    db.session.add(c)
    db.session.commit()
    return {"color":c.model_dump_json()},201


@catalago_bp.post('/colors/remove')
def colors_remove():
    log.info("colors_remove():")

    data = request.get_json()
    color_name:str = data.get("color_name")

    if not color_name:
        return {"error":"color_name must be in the body"},400

    color_name = color_name.capitalize()
    colorObj = db.session.scalar(Select(mod.Color).filter_by(name=color_name))

    if colorObj ==  None:
        return {"error":f"Color {color_name} was not found"},422

    db.session.delete(colorObj)
    db.session.commit()
    return {"color_name":color_name},200


@catalago_bp.post('/colors/bulk-remove')
def colors_bulk_remove():


    data = request.get_json()
    id_colors:list[int] = data.get("id_colors")

    if not id_colors:
        return {"error":"'id_colors' list[int] not passed"},400


    stmt = delete(Color).where(Color.id.in_(id_colors))
    try:
        db.session.execute(stmt)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error":str(e)},400

    return {"count_deleted":len(id_colors)}, 200


