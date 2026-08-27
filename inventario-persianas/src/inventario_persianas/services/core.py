from sqlmodel import desc, select

import inventario_persianas.model as mod


from sqlalchemy.orm import Session,selectinload,joinedload
from sqlalchemy import Delete
from inventario_persianas.model import Color, Fabric, Supplier, Location, BlindModel, FabricClassification, Tube
from inventario_persianas.model import Color, db
from inventario_persianas.services.utils import create_audit_log
import logging
from pydantic import ValidationError
from typing import Tuple, List, Dict, Optional, Any
import traceback


log = logging.getLogger(__name__)


def new_tube():
    tube = Tube()
    db.session.add(tube)
    db.session.flush()


    tube_json = tube.model_dump()
    log_json = create_audit_log("New Tube","tube",tube.id)
    db.session.commit()


    log.debug(tube_json)

    return tube_json, log_json


def recent_tubes_and_fabrics():
    log.info("recent_tubes_and_fabrics()")
    stmt_tubes = (
        select(Tube)
        .options(
            selectinload(Tube.fabrics).options(
                selectinload(Fabric.deductions)
                ),
            joinedload(Tube.tube_rectified)     
    )

        .order_by(desc(Tube.updated_at))
        .limit(100)
    )
    tubes_al = db.session.scalars(stmt_tubes).all()

    tubes_obj = []
    fabrics_obj = []

    for tube in tubes_al:
        fabrics_list = tube.fabrics or []

        tube_dict = tube.model_dump()
        tube_dict["fabric_count"] = len(fabrics_list)
        # tube_dict["location_id"] = tube.location_id
        tube_dict["rectified"] = True if tube.tube_rectified else False

        last_update = tube_dict["updated_at"]
        print(type(last_update),last_update)


        tubes_obj.append(tube_dict)
        for fabric in fabrics_list:
            deductions = fabric.deductions
            obj = fabric.model_dump()
            obj["deductions"] = [d.model_dump() for d in deductions]
            fabrics_obj.append(obj)

    return tubes_obj, fabrics_obj, len(tubes_obj)


from sqlalchemy.exc import SQLAlchemyError

def add_fabrics(fabrics_to_add: list[dict]) -> tuple[None | Exception,list[dict] | None]:
    try:
        # Option A: Create SQLModel objects using model_validate (filters/validates types)
        fabrics = []

        for f in fabrics_to_add:  # `fabrics` is your incoming list of dicts
            f.pop("created_at", None)
            f.pop("updated_at", None)

            fabric_obj = Fabric.model_validate(f)
            fabrics.append(fabric_obj)


        
        db.session.add_all(fabrics)
        db.session.flush()
        db.session.commit()

        for f in fabrics:
            create_audit_log(action="Insert",target_table="fabric",target_id=f.id)

        return None,[obj.model_dump() for obj in fabrics]

    except SQLAlchemyError as e:
        db.session.rollback()  # Crucial: prevents session corruption in Flask
        log.error(e)
        return e,None
    except Exception as e:
        log.error(e)
        db.session.rollback()
        return e,None







    




