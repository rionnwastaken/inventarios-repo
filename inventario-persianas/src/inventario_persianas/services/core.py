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

def add_fabrics(fabrics_to_add: list[dict]) -> tuple[None | Error,list[dict] | None]:

    log.debug(f"Fabrics to add data {fabrics_to_add} ")
    try:
        # Option A: Create SQLModel objects using model_validate (filters/validates types)
        fabrics = []

        for f in fabrics_to_add:  # `fabrics` is your incoming list of dicts
            f.pop("created_at", None)
            f.pop("updated_at", None)

            temp_id = f.get("temp_id")
            if  temp_id is None:
                return Error("'temp_id' was not found",400),None

            log.debug(f"Fabric here is {f}")
            fabric_obj = Fabric.model_validate(f)
            db.session.add(fabric_obj)
            fabrics.append({
                "temp_id":temp_id,
                "fabric":fabric_obj
                })


        
        db.session.flush()

        for f in fabrics:
            create_audit_log(action="Insert", target_table="fabric", target_id=f["fabric"].id)

        retval = [{
            "temp_id":obj["temp_id"],
            "fabric":obj["fabric"].model_dump(),
        } for obj in fabrics]

        log.debug(f"Fabrics {fabrics}")
        log.debug(f"Return value {retval}")

        db.session.commit()

        
        return None,retval

    except SQLAlchemyError as e:
        db.session.rollback()  # Crucial: prevents session corruption in Flask
        log.error(traceback.format_exc(e))
        log.error(e)
        return Error(str(e),400),None
    except Exception as e:
        log.error(traceback.format_exc(e))
        log.error(e)
        db.session.rollback()
        return Error(str(e),400),None







    




