import logging
from typing import List, Optional
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

        except Exception as e:
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
            selectinload(Tube.fabrics).options(selectinload(Fabric.deductions)),
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
            deductions = fabric.deductions
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


@handle_db_exceptions
def update_fabrics(data: list[dict]) -> tuple[List[dict], int]:
    updated_fabrics = []
    with db.session.begin():
        for index, item in enumerate(data):
            fabric_id = item.get("id")
            payload = item.get("partial_data", {})

            fabric = db.session.get(
                Fabric, fabric_id, options=[selectinload(Fabric.deductions)]
            )
            if not fabric:
                raise ValueError(f"Fabric with id {fabric_id} not found.")

            if len(fabric.deductions) > 0 and (
                payload.get("original_width" or payload.get("original_height"))
            ):
                raise ValidationError(
                    "No se puede actualizar las medidas de la tela mienstras que tenga deducciones"
                )

            fabric_data_before_update = fabric.model_dump(mode="json")
            partial_update_payload = FabricUpdate.model_validate(payload).model_dump(
                exclude_unset=True
            )

            partial_update_payload_json = FabricUpdate.model_validate(
                payload
            ).model_dump(exclude_unset=True, mode="json")

            log.debug("Partial_data here is %s", partial_update_payload)

            if not partial_update_payload or len(partial_update_payload) <= 0:
                raise ValueError(
                    f"Fabric id {fabric_id}: 'partial_data' contains no valid update fields. {payload}"
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
            db.session.flush()
            fabric_obj = fabric.model_dump(mode="json")
            fabric_obj["deductions"] = [
                d.model_dump(mode="json") for d in fabric.deductions
            ]
            updated_fabrics.append(fabric_obj)

        return updated_fabrics, 200


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

    for d in fabric.deductions:
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


def validate_deduction(fabric: Fabric, deduction: FabricDeduction):

    whole_m2 = fabric.original_height * fabric.original_width
    used_m2 = whole_m2

    # for deduct in fabric.deduct


def create_child_fabric(parent_fabric: Fabric, parent_deduction: FabricDeduction):
    log.debug("create_child_fabric()")
    attrs_to_copy = [
        "tube_id",
        "blind_model_id",
        "color_id",
        "fabric_classification_id",
        "supplier_id",
    ]
    child_data = {attr: getattr(parent_fabric, attr) for attr in attrs_to_copy}
    child_fabric = Fabric(
        **child_data,
        original_width=parent_fabric.original_width - parent_deduction.removed_width,
        original_height=parent_deduction.removed_height,
        rank=parent_fabric.rank + 1,
        is_archived=False,
        parent_deduction_id=parent_deduction.id,
    )
    db.session.add(child_fabric)
    db.session.flush()
    AuditLogger.log(
        "Insert",
        "fabric",
        child_fabric.id,
        new_values=child_fabric.model_dump(mode="json"),
        message="Child fabric",
    )


def update_child_fabric(
    *,
    child_fabric: Fabric | None = None,
    child_fabric_id: int | None = None,
    partial_payload: dict = {},
):
    log.debug("update_child_fabric()")

    if child_fabric and child_fabric_id:
        raise TypeError("Arguments 'child_fabric' and 'id' are mutually exclusive")

    if child_fabric:
        validated = FabricUpdate.model_validate(partial_payload)

        child_fabric_partial = validated.model_dump(exclude_unset=True)
        child_fabric_partial_json = validated.model_dump(
            exclude_unset=True, mode="json"
        )
        if not child_fabric_partial or len(child_fabric_partial) <= 0:
            raise ValueError(
                f"No valid keys were passed for the update\nData passed {partial_payload}"
            )

        child_fabric_json = child_fabric.model_dump(mode="json")
        child_fabric.sqlmodel_update(child_fabric_partial)
        AuditLogger.log(
            "Update",
            "fabric",
            child_fabric.id,
            old_values=child_fabric_json,
            new_values=child_fabric_partial_json,
            message="Child fabric",
        )


@handle_db_exceptions
def deduction_new(deduction):
    with db.session.begin():
        log.debug("Deduction data %s", deduction)
        fabricDeduction = FabricDeduction.model_validate(deduction, strict=False)

        fabric = db.session.get(
            Fabric,
            fabricDeduction.fabric_id,
            options=[selectinload(Fabric.deductions)],
        )
        if not fabric:
            raise NoResultFound(
                f"Fabric was not found with id {fabricDeduction.fabric_id}"
            )

        measurement_valid = validate_fabric_deduction_limits(
            fabric, fabricDeduction.removed_width, fabricDeduction.removed_height
        )

        fabric.deductions.append(fabricDeduction)
        db.session.flush()
        fabricDedudction_json = fabricDeduction.model_dump(mode="json")

        AuditLogger.log(
            "Insert",
            "fabric_deduction",
            fabricDeduction.id,
            new_values=fabricDedudction_json,
        )

        if fabricDeduction.removed_width < fabric.original_width:
            create_child_fabric(fabric, fabricDeduction)

        fabric_obj = fabric.model_dump()
        fabric_obj["deductions"] = []
        fabricDeduction_obj = fabricDeduction.model_dump()

        for deduct in fabric.deductions:
            dedudct_obj = deduct.model_dump()
            fabric_obj["deductions"].append(dedudct_obj)

        return {"fabric": fabric_obj, "deduction": fabricDeduction_obj}, 200


@handle_db_exceptions
def update_deduction(
    fabric_id: int, deduction_id: int, deduction_payload: dict
) -> tuple[dict, int]:
    log.debug("update_deduction(fabric_id, deduction)")
    log.debug(fabric_id, deduction_payload)
    with db.session.begin():
        fabric = db.session.get(
            Fabric, fabric_id, options=[selectinload(Fabric.deductions)]
        )
        fabricDeduction = db.session.get(
            FabricDeduction,
            deduction_id,
            options=[selectinload(FabricDeduction.child_fabric)],
        )

        if not fabric:
            raise NoResultFound(f"Fabric with id {fabric_id} not found.")

        if not fabricDeduction:
            raise NoResultFound(f"FabricDeduction with id {deduction_id} not found.")

        validated_data = FabricDeductionUpdate.model_validate(deduction_payload)

        partial_payload_update = validated_data.model_dump(exclude_unset=True)
        partial_payload_update_json = validated_data.model_dump(
            exclude_unset=True, mode="json"
        )
        if not partial_payload_update or len(partial_payload_update) <= 0:
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
        child_fabric = fabricDeduction.child_fabric
        if not child_fabric:
            raise ValueError("child_fabric es nulo en la deduccion (No es posible)")
        if len(child_fabric.deductions) > 0:
            raise Exception(
                "No se puede modificar la deduccion ya que la tela creada por deduccion a tenido por su cuenta una modificacion, si se desea hacer la modificacion, primero se tiene que quitar todas las deducciones de la tela creada por la deduccion"
            )

        removed_width = partial_payload_update.get("removed_width")
        removed_height = partial_payload_update.get("removed_height")
        child_fabric_payload = {}
        if removed_width:
            child_fabric_payload["original_width"] = (
                fabric.original_width - removed_width
            )
        if removed_height:
            child_fabric_payload["original_height"] = removed_height

        update_child_fabric(
            child_fabric=child_fabric, partial_payload=child_fabric_payload
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
        for d in fabric.deductions:
            deduct_obj = d.model_dump()
            fabric_obj["deductions"].append(deduct_obj)

        return {
            "fabric": fabric_obj,
            "deduction": fabricDeduction_obj,
        }, 200
