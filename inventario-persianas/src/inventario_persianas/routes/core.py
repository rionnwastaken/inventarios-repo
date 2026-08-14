
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
