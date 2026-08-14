import inventario_persianas.model as mod


from sqlalchemy.orm import Session
from sqlalchemy import Delete
from inventario_persianas.model import Color, Supplier, Location, BlindModel, FabricClassification, Tube
from inventario_persianas.model import Color, db
from inventario_persianas.services.utils import create_audit_log


def new_tube():
    tube = Tube()
    db.session.add(tube)
    db.session.commit()
    log_json = create_audit_log("New Tube","tube",tube.id)

    return tube.model_dump(), log_json

    




