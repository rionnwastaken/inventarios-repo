import logging
import traceback
from typing import List, Optional, Tuple
import json
from decimal import Decimal
from functools import wraps

from inventario_persianas.exceptions import OverDrawing
from inventario_persianas.model import (
    Fabric,
    FabricDeduction,
    FabricDeductionUpdate,
    FabricUpdate,
    Tube,
    db,
)
from inventario_persianas.services.utils import (
    AuditLogger,
    Error,
)
from pydantic import ValidationError
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import joinedload, selectinload
from sqlmodel import desc, select

log = logging.getLogger(__name__)


def handle_db_exceptions(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ValidationError as e:
            log.exception(e)
            return Error(e, 400).returnIt()
        except NoResultFound as e:
            log.exception(e)
            return Error(str(e), 400).returnIt()
        except OverDrawing as e:
            log.exception(e)
            return Error(str(e), 400).returnIt()
        except ValueError as e:
            log.exception(e)
            return Error(str(e), 400).returnIt()

    return wrapper


def new_tube():
    tube = Tube()
    db.session.add(tube)
    db.session.flush()

    tube_json = tube.model_dump(mode="json")
    tube_json["fabric_count"] = 0
    tube_json["rectified"] = False

    log_json = AuditLogger.log("Insert", "tube", tube.id, new_values=tube_json)
    db.session.commit()

    log.debug(tube_json)

    return tube_json, log_json


def recent_tubes_and_fabrics():
    log.info("recent_tubes_and_fabrics()")
    stmt_tubes = (
        select(Tube)
        .options(
            selectinload(Tube.fabrics).options(selectinload(Fabric.child_deductions)),
            joinedload(Tube.tube_rectified),
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
        tube_dict["rectified"] = True if tube.tube_rectified else False

        last_update = tube_dict["updated_at"]
        print(type(last_update), last_update)

        tubes_obj.append(tube_dict)
        for fabric in fabrics_list:
            deductions = fabric.child_deductions
            obj = fabric.model_dump()
            obj["deductions"] = []
            for deduct in deductions:
                dedudct_obj = deduct.model_dump()
                obj["deductions"].append(dedudct_obj)
            fabrics_obj.append(obj)

    log.debug("Fabrics loaded %s", json.dumps(fabrics_obj, default=str, indent=4))

    return tubes_obj, fabrics_obj, len(tubes_obj)


@handle_db_exceptions
def add_fabrics(fabrics_to_add: list[dict]) -> list[dict]:

    log.debug(f"Fabrics to add data {fabrics_to_add} ")
    with db.session.begin():
        fabrics = []
        retval = []

        for payload in fabrics_to_add:
            temp_id = payload.get("temp_id")
            if temp_id is None:
                raise NoResultFound("'temp_id' was not found")

            fabric = add_fabric(payload)
            retval.append(
                {
                    "temp_id": temp_id,
                    "fabric": fabric.model_dump(),
                }
            )

        log.debug(f"Fabrics {fabrics}")
        log.debug(f"Return value {retval}")

        return retval


def add_fabric(payload: dict):

    payload.pop("created_at", None)
    payload.pop("updated_at", None)

    log.debug(f"Fabric here is {payload}")
    fabric = Fabric.model_validate(payload)
    db.session.add(fabric)
    db.session.flush()
    fabric_json = fabric.model_dump(mode="json")

    log_json = AuditLogger.log("Insert", "fabric", fabric.id, new_values=fabric_json)

    return fabric


def update_fabrics(data: list[dict]) -> Tuple[Optional[Error], Optional[List[dict]]]:
    updated_fabrics: list[Fabric] = []

    try:
        with db.session.begin():
            for index, item in enumerate(data):
                if not isinstance(item, dict):
                    raise ValueError(f"Item at index {index} must be a dictionary.")

                fabric_id = item.get("id")
                partial_data = item.get("partial_data")

                if fabric_id is None:
                    raise ValueError(
                        f"Item at index {index}: missing required field 'id'."
                    )

                if not isinstance(fabric_id, int):
                    raise ValueError(
                        f"Item at index {index}: 'id' must be an integer, got {type(fabric_id).__name__}."
                    )

                if partial_data is None or not isinstance(partial_data, dict):
                    raise ValueError(
                        f"Item at index {index}: 'partial_data' must be a valid dictionary."
                    )

                fabric = db.session.get(
                    Fabric, fabric_id, options=[selectinload(Fabric.child_deductions)]
                )
                if not fabric:
                    raise ValueError(f"Fabric with id {fabric_id} not found.")

                fabric_data_before_update = fabric.model_dump(mode="json")
                partial_update_payload = FabricUpdate.model_validate(
                    partial_data
                ).model_dump(exclude_unset=True)

                partial_update_payload_json = FabricUpdate.model_validate(
                    partial_data
                ).model_dump(exclude_unset=True, mode="json")

                log.debug("Partial_data here is %s", partial_update_payload)

                if not partial_update_payload or len(partial_update_payload) <= 0:
                    raise ValueError(
                        f"Fabric id {fabric_id}: 'partial_data' contains no valid update fields. {partial_data}"
                    )

                fabric.sqlmodel_update(partial_update_payload)
                db.session.add(fabric)

                AuditLogger.log(
                    "Update",
                    "fabric",
                    fabric_id,
                    old_values=fabric_data_before_update,
                    new_values=partial_update_payload_json,
                )

                log.debug("Updated fabric: %s", fabric)
                updated_fabrics.append(fabric)

            log.debug("we good here?")
            db.session.flush()
            data = []
            for fabric in updated_fabrics:
                fabric_obj = fabric.model_dump(mode="json")
                fabric_obj["deductions"] = [
                    d.model_dump(mode="json") for d in fabric.child_deductions
                ]
                data.append(fabric_obj)

            return None, data

    except ValidationError as e:
        log.error(traceback.format_exc())
        return Error(f"Validation failed: {e.errors(include_url=False)}", 400), None

    except ValueError as e:
        log.error(traceback.format_exc())
        return Error(str(e), 400), None

    except Exception as e:
        log.error(traceback.format_exc())
        return Error(f"Database update failed: {str(e)}", 500), None


def validate_fabric_deduction_limits(
    fabric: Fabric,
    width: Decimal,
    height: Decimal,
    current_deduction_id: Optional[int] = None,
) -> bool:
    """
    Validates if proposed width/height deductions exceed the remaining dimensions of a fabric.

    Returns:
        Tuple[bool, Optional[str]]: (is_valid, error_message)
    """

    if width == None:
        raise ValueError("El ancho es nulo")

    if height == None:
        raise ValueError("El alto es nulo")

    remaining_height = fabric.original_height

    for d in fabric.child_deductions:
        if current_deduction_id != None and d.id == current_deduction_id:
            continue

        if d.removed_height is not None:
            p = remaining_height
            remaining_height -= d.removed_height
            log.debug(f"Removing from {p} - {d.removed_height} = {remaining_height}")

    if width > fabric.original_width:
        raise OverDrawing(
            "No se puede quitar {width} mts del ancho  {fabric.original_width} mts\nFabric ID {fabric.id}:"
        )

    if height > remaining_height:
        raise OverDrawing(
            f"No se puede quitar {height} mts del alto restante {remaining_height} mts"
        )

    return True


@handle_db_exceptions
def deduction_new(deduction):
    with db.session.begin():
        log.debug("Deduction data %s", deduction)
        fabricDeduction = FabricDeduction.model_validate(deduction, strict=False)

        fabric = db.session.get(
            Fabric,
            fabricDeduction.parent_fabric_id,
            options=[selectinload(Fabric.child_deductions)],
        )
        if not fabric:
            raise NoResultFound(
                f"Fabric was not found with id {fabricDeduction.parent_fabric_id}"
            )

        measurement_valid = validate_fabric_deduction_limits(
            fabric, fabricDeduction.removed_width, fabricDeduction.removed_height
        )

        fabric.child_deductions.append(fabricDeduction)
        db.session.flush()
        fabricDedudction_json = fabricDeduction.model_dump(mode="json")

        AuditLogger.log(
            "Insert",
            "fabric_deduction",
            fabricDeduction.id,
            new_values=fabricDedudction_json,
        )

        fabric_obj = fabric.model_dump()
        fabric_obj["deductions"] = []
        fabricDeduction_obj = fabricDeduction.model_dump()

        for deduct in fabric.child_deductions:
            dedudct_obj = deduct.model_dump()
            fabric_obj["deductions"].append(dedudct_obj)

        return {"fabric": fabric_obj, "deduction": fabricDeduction_obj}, 200


@handle_db_exceptions
def update_deduction(
    fabric_id: int, deduction_id: int, deduction_payload: dict
) -> Tuple[Optional[Error], Optional[dict]]:
    log.debug("update_deduction(fabric_id, deduction)")
    log.debug(fabric_id, deduction_payload)
    with db.session.begin():
        fabric = db.session.get(
            Fabric, fabric_id, options=[selectinload(Fabric.child_deductions)]
        )
        fabricDeduction = db.session.get(FabricDeduction, deduction_id)

        if not fabric:
            raise NoResultFound(f"Fabric with id {fabric_id} not found.")

        if not fabricDeduction:
            raise NoResultFound(f"FabricDeduction with id {deduction_id} not found.")

        validated_data = FabricDeductionUpdate.model_validate(deduction_payload)

        partial_payload_update = validated_data.model_dump(exclude_unset=True)
        partial_payload_update_json = validated_data.model_dump(
            exclude_unset=True, mode="json"
        )
        if not partial_payload_update:
            raise ValueError(
                f"Fabric id {fabric_id}: 'partial_data' contains no valid update fields. {deduction_payload}"
            )

        measurement_valid = validate_fabric_deduction_limits(
            fabric,
            partial_payload_update.get("removed_width", fabricDeduction.removed_width),
            partial_payload_update.get(
                "removed_height", fabricDeduction.removed_height
            ),
            current_deduction_id=deduction_id,  # Ignore old values of this deduction during calculation
        )

        before_fabricDeduction_obj = fabricDeduction.model_dump()
        before_fabricDeduction_json = fabricDeduction.model_dump(mode="json")

        fabricDeduction.sqlmodel_update(partial_payload_update)
        db.session.flush()

        log.debug(f"d before refresh {fabricDeduction}")

        after_fabricDeduction_obj = fabricDeduction.model_dump()
        log.debug(f"d after refresh {fabricDeduction}")

        AuditLogger.log(
            "Update",
            "fabric_deduction",
            fabricDeduction.id,
            old_values=before_fabricDeduction_json,
            new_values=partial_payload_update_json,
        )

        fabricDeduction_obj = fabricDeduction.model_dump()

        fabric_obj = fabric.model_dump()
        fabric_obj["deductions"] = []
        for d in fabric.child_deductions:
            deduct_obj = d.model_dump()
            fabric_obj["deductions"].append(deduct_obj)

        return None, {
            "fabric": fabric_obj,
            "deduction": fabricDeduction_obj,
        }
