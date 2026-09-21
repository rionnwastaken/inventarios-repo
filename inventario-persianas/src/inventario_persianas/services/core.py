import logging
from typing import List, Optional
import json
from decimal import Decimal
from functools import wraps

from inventario_persianas.exceptions import OverDrawing
from inventario_persianas.model import (
    Fabric,
    FabricComment,
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
            selectinload(Tube.fabrics).options(
                selectinload(Fabric.deductions), selectinload(Fabric.comments)
            ),
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
            fabric_obj = fabric.payload()
            fabrics_obj.append(fabric_obj)

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

            retval.append(
                {
                    "temp_id": temp_id,
                    "fabric": add_fabric(payload),
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
    fabric_json = fabric.payload()

    log_json = AuditLogger.log("Insert", "fabric", fabric.id, new_values=fabric_json)

    return fabric_json


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
            fabric_obj = fabric.payload()
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
            f"No se puede quitar {width} mts del ancho  {fabric.original_width} mts\nFabric ID {fabric.id}:"
        )

    if height > remaining_height:
        raise OverDrawing(
            f"No se puede quitar {height} mts del alto restante {remaining_height} mts"
        )

    return True


def validate_deduction(
    fabric: Fabric, deduction: FabricDeduction, dedudction_edited=False
):

    used_m2 = fabric.original_height * fabric.original_width
    deduction_m2 = deduction.removed_height * deduction.removed_height

    for deduct in fabric.deductions:
        if dedudction_edited and deduct.id == deduction.id:
            continue
        m2 = deduct.removed_height * deduct.removed_width
        used_m2 -= m2

    if deduction_m2 > used_m2:
        raise OverDrawing(f"No se puede quitar {deduction_m2} m2 a {used_m2} m2")

    # for deduct in fabric.deduct


def update_available_fabric_percentage(fabric: Fabric):

    old_values = fabric.model_dump(mode="json")
    whole_m2 = fabric.original_height * fabric.original_width
    rem_m2 = whole_m2

    for deduct in fabric.deductions:
        rem_m2 -= deduct.removed_height * deduct.removed_width

    remaining_percent = (rem_m2 * 100) / whole_m2
    fabric.remaining_percent = remaining_percent

    AuditLogger.log(
        "Update",
        "fabric",
        fabric.id,
        message="Percentage",
        old_values=old_values,
        new_values=fabric.model_dump(mode="json", include={"remaining_percent"}),
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

        validate_deduction(fabric, fabricDeduction)

        fabric.deductions.append(fabricDeduction)
        db.session.flush()
        fabricDedudction_json = fabricDeduction.model_dump(mode="json")
        update_available_fabric_percentage(fabric)

        AuditLogger.log(
            "Insert",
            "fabric_deduction",
            fabricDeduction.id,
            new_values=fabricDedudction_json,
        )

        fabric_obj = fabric.payload()
        fabricDeduction_obj = fabricDeduction.model_dump()

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

        before_fabricDeduction_obj = fabricDeduction.model_dump()
        before_fabricDeduction_json = fabricDeduction.model_dump(mode="json")

        fabricDeduction.sqlmodel_update(partial_payload_update)
        db.session.flush()

        validate_deduction(
            fabric,
            fabricDeduction,
            dedudction_edited=True,  # Ignore old values of this deduction during calculation
        )
        update_available_fabric_percentage(fabric)

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

        fabric_obj = fabric.payload()

        return {
            "fabric": fabric_obj,
            "deduction": fabricDeduction_obj,
        }, 200


@handle_db_exceptions
def deduction_delete(fabric_id: int, deduction_id: int):

    with db.session.begin():
        fabric = db.session.get(
            Fabric,
            fabric_id,
            options=[selectinload(Fabric.deductions), selectinload(Fabric.comments)],
        )
        deduction = db.session.get(FabricDeduction, deduction_id)

        if not fabric or not deduction:
            raise ValueError(f"fabric or deduction not found {fabric} {deduction}")

        AuditLogger.log(
            "Delete",
            "fabric_deduction",
            deduction_id,
            old_values=deduction.model_dump(mode="json"),
        )

        db.session.delete(deduction)
        fabric.deductions.remove(deduction)
        db.session.flush()
        update_available_fabric_percentage(fabric)
        fabric_json = fabric.payload()

        return {
            "fabric": fabric_json,
            "deduction_id": deduction_id,
        }


@handle_db_exceptions
def comment_new(comment: dict):
    log.info("comment_new(comment:")
    with db.session.begin():
        fabric_id = comment.get("fabric_id")
        fabric: Fabric | None = db.session.get(
            Fabric,
            fabric_id,
            options=[selectinload(Fabric.deductions), selectinload(Fabric.comments)],
        )
        if fabric == None:
            raise ValueError(f"Fabric_id {fabric_id} does not exist in table")
        fabricComment = FabricComment.model_validate(comment)
        db.session.add(fabricComment)
        db.session.flush()
        fabric.comments.insert(0, fabricComment)
        comment_json = fabricComment.model_dump(mode="json")
        AuditLogger.log(
            "Insert", "fabric_comment", fabricComment.id, new_values=comment_json
        )

        fabric_json = fabric.payload()
        return {"fabric": fabric_json, "comment": comment_json}, 200


@handle_db_exceptions
def comment_update(payload: dict, fabric_id: int):

    return {}, 200


@handle_db_exceptions
def comment_delete(comment_id: int, fabric_id: int):

    return {}, 200
