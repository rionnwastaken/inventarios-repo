import logging
import traceback
from typing import List, Optional, Tuple
import json

import inventario_persianas.model as mod
from inventario_persianas.app_types import Change
from inventario_persianas.model import (
    Fabric,
    FabricDeduction,
    FabricDeductionUpdate,
    FabricUpdate,
    SpareFabric,
    Tube,
    db,
)
from inventario_persianas.model_test import flaky
from inventario_persianas.services.utils import (
    Error,
    create_audit_log,
    create_json_with_actual_values_auditlog,
)
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload, selectinload
from sqlmodel import desc, select

log = logging.getLogger(__name__)


def new_tube():
    tube = Tube()
    db.session.add(tube)
    db.session.flush()

    tube_json = tube.model_dump()
    tube_json["fabric_count"] = 0
    tube_json["rectified"] = False

    log_json = create_audit_log("Insert", "tube", tube.id)
    db.session.commit()

    log.debug(tube_json)

    return tube_json, log_json


def recent_tubes_and_fabrics():
    log.info("recent_tubes_and_fabrics()")
    stmt_tubes = (
        select(Tube)
        .options(
            selectinload(Tube.fabrics).options(
                selectinload(Fabric.deductions).options(
                    selectinload(FabricDeduction.spare_fabric)
                )
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
            deductions = fabric.deductions
            obj = fabric.model_dump()
            obj["deductions"] = []
            for deduct in deductions:
                dedudct_obj = deduct.model_dump()
                spare_fabric = None
                if deduct.spare_fabric:
                    spare_fabric = deduct.spare_fabric.model_dump()
                dedudct_obj["spare_fabric"] = spare_fabric
                obj["deductions"].append(dedudct_obj)
            fabrics_obj.append(obj)

    log.debug("Fabrics loaded %s", json.dumps(fabrics_obj, default=str, indent=4))

    return tubes_obj, fabrics_obj, len(tubes_obj)


def add_fabrics(fabrics_to_add: list[dict]) -> tuple[None | Error, list[dict] | None]:

    log.debug(f"Fabrics to add data {fabrics_to_add} ")
    try:
        # Option A: Create SQLModel objects using model_validate (filters/validates types)
        fabrics = []

        for f in fabrics_to_add:  # `fabrics` is your incoming list of dicts
            f.pop("created_at", None)
            f.pop("updated_at", None)

            temp_id = f.get("temp_id")
            if temp_id is None:
                return Error("'temp_id' was not found", 400), None

            log.debug(f"Fabric here is {f}")
            fabric_obj = Fabric.model_validate(f)
            db.session.add(fabric_obj)
            fabrics.append({"temp_id": temp_id, "fabric": fabric_obj})

        db.session.flush()

        for f in fabrics:
            create_audit_log(
                action="Insert", target_table="fabric", target_id=f["fabric"].id
            )

        retval = [
            {
                "temp_id": obj["temp_id"],
                "fabric": obj["fabric"].model_dump(),
            }
            for obj in fabrics
        ]

        log.debug(f"Fabrics {fabrics}")
        log.debug(f"Return value {retval}")

        db.session.commit()

        return None, retval

    except SQLAlchemyError as e:
        db.session.rollback()  # Crucial: prevents session corruption in Flask
        log.error(traceback.format_exc(e))
        log.error(e)
        return Error(str(e), 400), None
    except Exception as e:
        log.error(traceback.format_exc(e))
        log.error(e)
        db.session.rollback()
        return Error(str(e), 400), None


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
                    Fabric, fabric_id, options=[selectinload(Fabric.deductions)]
                )
                if not fabric:
                    raise ValueError(f"Fabric with id {fabric_id} not found.")

                fabric_data_before_update = fabric.model_dump()
                partial_update_payload = FabricUpdate.model_validate(
                    partial_data
                ).model_dump(exclude_unset=True)

                if not partial_update_payload or len(partial_update_payload) <= 0:
                    raise ValueError(
                        f"Fabric id {fabric_id}: 'partial_data' contains no valid update fields. {partial_data}"
                    )

                fabric.sqlmodel_update(partial_update_payload)
                db.session.add(fabric)

                create_audit_log(
                    "Update",
                    "fabric",
                    fabric_id,
                    changes=Change(
                        data=create_json_with_actual_values_auditlog(
                            fabric_data_before_update, partial_update_payload
                        )
                    ),
                )

                updated_fabrics.append(fabric)

            db.session.flush()
            data = []
            for fabric in updated_fabrics:
                fabric_obj = fabric.model_dump()
                fabric_obj["deductions"] = [d.model_dump() for d in fabric.deductions]
                data.append(fabric_obj)

            # result_dicts = [fabric.model_dump() for fabric in updated_fabrics]
            log.debug("results dict here are  %s", data)
            return None, data

    except ValidationError as e:
        return Error(f"Validation failed: {e.errors(include_url=False)}", 400), None

    except ValueError as e:
        return Error(str(e), 400), None

    except Exception as e:
        log.error(traceback.format_exc())
        return Error(f"Database update failed: {str(e)}", 500), None


def validate_fabric_deduction_limits(
    fabric: Fabric,
    width: float,
    height: float,
    current_deduction_id: Optional[int] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Validates if proposed width/height deductions exceed the remaining dimensions of a fabric.

    Returns:
        Tuple[bool, Optional[str]]: (is_valid, error_message)
    """

    if width == None:
        return False, "El ancho esta vacio"

    if height == None:
        return False, "El alt esta vacio"

    remaining_height = fabric.original_height

    for d in fabric.deductions:
        if current_deduction_id != None and d.id == current_deduction_id:
            continue

        if d.removed_height is not None:
            remaining_height -= d.removed_height

    if width > fabric.original_width:
        msg = f"No se puede quitar {width} mts del ancho  {fabric.original_width} mts"
        log.debug(f"Fabric ID {fabric.id}: {msg}")
        return False, msg

    if height > remaining_height:
        msg = (
            f"No se puede quitar {height} mts del alto restante {remaining_height} mts"
        )
        log.debug(f"Fabric ID {fabric.id}: {msg}")
        return False, msg

    return True, None


def deduction_new(deduction):
    try:
        fabricDeduction = FabricDeduction.model_validate(deduction, strict=True)
    except Exception as e:
        log.error(e)
        log.error(traceback.format_exc())
        return Error(f"Could not validate FabricDeduction {deduction}", 400)

    fabric = db.session.get(
        Fabric, fabricDeduction.fabric_id, options=[selectinload(Fabric.deductions)]
    )
    if not fabric:
        log.error(f"Fabric was not found with id {fabricDeduction.fabric_id}")
        return Error(
            f"Fabric was not found with id {fabricDeduction.fabric_id}", 400
        ).returnIt()

    measurement_valid, message = validate_fabric_deduction_limits(
        fabric, fabricDeduction.removed_width, fabricDeduction.removed_height
    )

    if not measurement_valid:
        return Error(message, 400).returnIt()

    fabric.deductions.append(fabricDeduction)
    db.session.flush()

    audit_obj = create_audit_log(
        "Insert", target_id=fabricDeduction.id, target_table="fabric_deduction"
    )

    log.debug(f"New deduction {audit_obj}")

    # Create sparefabric
    spare_fabric_obj = None
    if fabricDeduction.removed_width != fabric.original_width:
        spareFabric = SpareFabric(
            width=fabric.original_width - fabricDeduction.removed_width,
            height=fabricDeduction.removed_height,
            deduction_id=fabricDeduction.id,  # type: ignore
        )

        db.session.add(spareFabric)
        db.session.flush()
        create_audit_log(
            "Insert",
            target_id=spareFabric.id,  # type:ignore
            target_table="spare_fabric",
        )
        fabricDeduction.spare_fabric = spareFabric
        spare_fabric_obj = spareFabric.model_dump()
        db.session.flush()

    fabric_obj = fabric.model_dump()
    fabric_obj["deductions"] = []
    fabricDeduction_obj = fabricDeduction.model_dump()
    fabricDeduction_obj["spare_fabric"] = (
        None
        if not fabricDeduction.spare_fabric
        else fabricDeduction.spare_fabric.model_dump()
    )

    for deduct in fabric.deductions:
        dedudct_obj = deduct.model_dump()
        spare_fabric = None
        if deduct.spare_fabric:
            spare_fabric = deduct.spare_fabric.model_dump()
        dedudct_obj["spare_fabric"] = spare_fabric
        fabric_obj["deductions"].append(dedudct_obj)

    # fabric_obj["spare_fabric"] = spare_fabric_obj
    db.session.commit()

    return {"fabric": fabric_obj, "deduction": fabricDeduction_obj}, 200


def update_deduction(
    fabric_id: int, deduction_id: int, deduction_payload: dict
) -> Tuple[Optional[Error], Optional[dict]]:
    log.debug("update_deduction(fabric_id, deduction)")
    log.debug(fabric_id, deduction_payload)

    fabric = db.session.get(Fabric, fabric_id)
    fabricDeduction = db.session.get(FabricDeduction, deduction_id)

    if not fabric:
        return Error(f"Fabric with id {fabric_id} not found.", 400), None

    if not fabricDeduction:
        return Error(f"FabricDeduction with id {deduction_id} not found.", 400), None

    # Validate into a separate validated_data object (do NOT overwrite fabricDeduction)
    try:
        validated_data = FabricDeductionUpdate.model_validate(deduction_payload)
    except Exception as e:
        log.error(traceback.format_exc())
        log.error(e)
        return Error(f"Validation error {e}", 400), None

    partial_payload_update = validated_data.model_dump(exclude_unset=True)
    if not partial_payload_update:
        return Error(
            f"Fabric id {fabric_id}: 'partial_data' contains no valid update fields. {deduction_payload}",
            400,
        ), None

    measurement_valid, message = validate_fabric_deduction_limits(
        fabric,
        partial_payload_update.get("removed_width", fabricDeduction.removed_width),
        partial_payload_update.get("removed_height", fabricDeduction.removed_height),
        current_deduction_id=deduction_id,  # Ignore old values of this deduction during calculation
    )

    if not measurement_valid:
        log.debug(message)
        return Error(message, 400), None

    # Capture state before mutating the actual database model
    before_fabricDeduction_obj = fabricDeduction.model_dump()

    # Apply partial updates directly to the tracked DB entity
    fabricDeduction.sqlmodel_update(partial_payload_update)
    db.session.flush()

    log.debug(f"d before refresh {fabricDeduction}")
    # Refresh relationship state so fabric.deductions contains the newly updated deduction
    # db.session.refresh(fabricDeduction)
    # db.session.refresh(fabric)

    after_fabricDeduction_obj = fabricDeduction.model_dump()
    log.debug(f"d after refresh {fabricDeduction}")

    create_audit_log(
        "Update",
        "fabric_deduction",
        deduction_id,
        changes=Change(
            data=create_json_with_actual_values_auditlog(
                before_fabricDeduction_obj, partial_payload_update
            )
        ),
    )

    if partial_payload_update.get("removed_width") or partial_payload_update.get(
        "removed_height"
    ):
        spare_fabric, status = get_spare_fabric(
            fabric, fabricDeduction, partial_payload_update
        )
        if status == "Created":
            fabricDeduction.spare_fabric = spare_fabric
        if status != "created":
            if fabricDeduction.removed_width == fabric.original_width:
                log.debug(
                    f"removed width is equal to fabric origianl width {fabricDeduction.removed_width, fabric.original_width}"
                )
                delete_spare_fabric(
                    fabric, fabricDeduction, partial_payload_update, spare_fabric
                )
            else:
                update_spare_fabric(
                    fabric, fabricDeduction, partial_payload_update, spare_fabric
                )

            db.session.flush()
    # Executes if either key exists and its value is not None or 0
    really_after_everything_deduction_obj = fabricDeduction.model_dump()
    really_after_everything_deduction_obj["spare_fabric"] = (
        None
        if not fabricDeduction.spare_fabric
        else fabricDeduction.spare_fabric.model_dump()
    )

    fabric_obj = fabric.model_dump()
    fabric_obj["deductions"] = []
    for d in fabric.deductions:
        deduct_obj = d.model_dump()
        spare_fabric = None
        if d.spare_fabric:
            spare_fabric = d.spare_fabric.model_dump()
        deduct_obj["spare_fabric"] = spare_fabric
        fabric_obj["deductions"].append(deduct_obj)

    # fabric_obj["deductions"] = [d.model_dump() for d in fabric.deductions]

    db.session.commit()

    return None, {
        "fabric": fabric_obj,
        "deduction": really_after_everything_deduction_obj,
    }


def get_spare_fabric(fabric: Fabric, fabricDeduction: FabricDeduction, partial_payload):
    log.debug("Inside get_spare_fabric")

    spare_fabric = db.session.scalar(
        select(SpareFabric).where(SpareFabric.deduction_id == fabricDeduction.id)
    )

    if spare_fabric == None:
        log.debug("Creating spare_fabric")
        spare_fabric = SpareFabric(
            width=fabric.original_width - fabricDeduction.removed_width,
            height=fabricDeduction.removed_height,
            deduction_id=fabricDeduction.id,  # type: ignore
        )
        db.session.add(spare_fabric)
        db.session.flush()
        create_audit_log(
            "Insert",
            target_id=spare_fabric.id,  # type:ignore
            target_table="spare_fabric",
        )

        return spare_fabric, "created"

    return spare_fabric, ""


def update_spare_fabric(
    fabric: Fabric,
    fabricDeduction: FabricDeduction,
    partial_payload,
    spare_fabric: SpareFabric,
):

    log.debug("Updating spare fabric")

    spare_partial = {}
    before_spare_fabric_obj = spare_fabric.model_dump()
    # It means  we ned to remove the spare_fabric

    if partial_payload.get("removed_width"):
        spare_fabric.width = fabric.original_width - fabricDeduction.removed_width
        spare_partial["width"] = spare_fabric.width

    if partial_payload.get("removed_height"):
        spare_fabric.height = fabricDeduction.removed_height
        spare_partial["height"] = spare_fabric.height

    after_spare_fabric_obj = spare_fabric.model_dump()

    create_audit_log(
        "Update",
        "spare_fabric",
        spare_fabric.id,  # type:ignore
        changes=Change(
            data=create_json_with_actual_values_auditlog(
                before_spare_fabric_obj, spare_partial
            )
        ),
    )


def delete_spare_fabric(
    fabric: Fabric,
    fabricDeduction: FabricDeduction,
    partial_payload,
    spare_fabric: SpareFabric,
):
    log.debug("Deleting spare_fabric")
    create_audit_log("Delete", "spare_fabric", spare_fabric.id)
    db.session.delete(spare_fabric)


if __name__ == "__main__":
    app = flaky()
    with app.app_context():
        stmt = select(mod.Fabric).options(selectinload(Fabric.deductions))

        result = mod.db.session.scalar(stmt)
        d = result.deductions
        print(result)
        print(result.deductions)

    print(result.deductions)
