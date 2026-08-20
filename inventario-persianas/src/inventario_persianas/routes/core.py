
from flask import Blueprint,request
from sqlalchemy import Delete, Select, delete
import inventario_persianas.services.catalogs as catalago
from inventario_persianas.model import Color, db
import inventario_persianas.model as mod
import logging
import inventario_persianas.services.core as core

log = logging.getLogger(__name__)


core_bp = Blueprint("core",__name__)



@core_bp.post("/new/tube/")
def new_tube():
    tube_json,log_json =  core.new_tube()
    return {
        "tube":tube_json,
        "log":log_json,
    },201


"""
Should be able to get the recent created tubes that got 0 fabrics inside
but also the more recent  updated fabrics with their tubes, maybe i dont to bring all info
from the tube and i query once tube click? fuck knows
"""
@core_bp.get("/recent_tubes")
def recent_tubes():
    log.info("recent_tubes()")
    tubes,fabrics,size =  core.recent_tubes_and_fabrics()
    return {
        "tubes":tubes,
        "fabrics":fabrics,
        "size":size,
    },200


@core_bp.post("/fabric/add_many")
def fabric_add_many():
    data = request.get_json()
    
    if not data:
        return {"error":"No data"} , 400

    fabrics:list[dict] = data.get("fabrics")
    if not fabrics:
        return {"error":"Key 'fabrics' was not passed in the data"} , 400


    err,inserted_fabrics = core.add_fabrics(fabrics)

    if err:
        return {"error":err.__str__()},400

    if not inserted_fabrics:
        return {"error":"Fabris were not inserted due to error"} , 400


    return {"fabrics":inserted_fabrics},200
