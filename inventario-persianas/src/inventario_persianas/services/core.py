import logging

from typing import List, Optional
from decimal import Decimal
from functools import wraps


from inventario_persianas.exceptions import OverDrawing
from inventario_persianas.model import (
    Fabric,
    FabricComment,
    FabricCommentUpdate,
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
from sqlalchemy.orm import selectinload
from sqlmodel import desc, select
from sqlalchemy import distinct
from sqlalchemy import func

log = logging.getLogger(__name__)


# Mapping orientation keys to Python/SQLAlchemy comparison operators
OPERATORS = {
    "greater": lambda col, val: col >= val,
    "greater_than": lambda col, val: col > val,
    "less": lambda col, val: col <= val,
    "less_than": lambda col, val: col < val,
    "equal": lambda col, val: col == val,
}


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


@handle_db_exceptions
def new_tube():
    with db.session.begin():
        tube = Tube()
        db.session.add(tube)
        db.session.flush()

        tube_json = tube.payload()
        AuditLogger.log("Insert", "tube", tube.id, new_values=tube_json)
        log.debug(f"new tube json {tube_json} {len(tube_json)} ")

        return tube_json


# @handle_db_exceptions
# def tubes_and_fabrics(filters):
#     with db.session.begin():
#         # 1. Base query with eager loading for Tube
#         stmt = select(Fabric).options(joinedload(Fabric.tube))
#
#         # 2. Filter out archived fabrics by default (or adjust per business logic)
#         stmt = stmt.where(Fabric.is_archived == False)
#
#         # --- Array / List Filters (IN Clause) ---
#         if filters.get("blind_model"):
#             stmt = stmt.where(Fabric.blind_model_id.in_(filters["blind_model"]))
#
#         if filters.get("color"):
#             stmt = stmt.where(Fabric.color_id.in_(filters["color"]))
#
#         if filters.get("fabric_classification"):
#             stmt = stmt.where(
#                 Fabric.fabric_classification_id.in_(filters["fabric_classification"])
#             )
#
#         if filters.get("supplier"):
#             stmt = stmt.where(Fabric.supplier_id.in_(filters["supplier"]))
#
#         # --- Object Range Filters (Value + Orientation) ---
#         # Width
#         width_filter = filters.get("width")
#         if width_filter and width_filter.get("value") is not None:
#             orient = width_filter.get("orientation", "greater")
#             op = OPERATORS.get(orient, lambda col, val: col >= val)
#             stmt = stmt.where(op(Fabric.original_width, width_filter["value"]))
#
#         # Height
#         height_filter = filters.get("height")
#         if height_filter and height_filter.get("value") is not None:
#             orient = height_filter.get("orientation", "greater")
#             op = OPERATORS.get(orient, lambda col, val: col >= val)
#             stmt = stmt.where(op(Fabric.original_height, height_filter["value"]))
#
#         # Availability (remaining_percent)
#         avail_filter = filters.get("availability")
#         if avail_filter and avail_filter.get("value") is not None:
#             orient = avail_filter.get("orientation", "greater")
#             op = OPERATORS.get(orient, lambda col, val: col >= val)
#             stmt = stmt.where(op(Fabric.remaining_percent, avail_filter["value"]))
#
#         # 3. Execute query
#         fabrics = db.session.scalars(stmt).all()
#         fabrics_obj = [fabric.payload() for fabric in fabrics]
#
#         # 4. Extract unique tubes from returned fabrics
#         tubes_dict = {
#             f.tube.id: f.tube.payload() for f in fabrics if f.tube is not None
#         }
#         tubes_obj = list(tubes_dict.values())
#
#         return {
#             "tubes": tubes_obj,
#             "fabrics": fabrics_obj,
#         }, 200


@handle_db_exceptions
def update_tube(tube_id: int, payload: dict):
    with db.session.begin():
        tube = db.session.get(Tube, tube_id)

        if not tube:
            raise ValueError(f"Tube was not found with id {tube_id}")

        tube_payload = Tube.model_validate(payload).model_dump(exclude_unset=True)
        if not tube_payload or len(tube_payload) <= 0:
            raise ValueError(f"Payload is wrong shape {payload}")

        before_json = tube.payload()

        tube.sqlmodel_update(tube_payload)
        tube_json = tube.payload()

        db.session.add(tube)
        db.session.flush()
        db.session.refresh(tube)
        AuditLogger.log(
            "Update", "tube", tube_id, old_values=before_json, new_values=tube_payload
        )

        return {"tube": tube_json}, 200


# def recent_tubes_and_fabrics(offset=0, limit=50, draw=1):
#     log.info(f"recent_tubes_and_fabrics(offset={offset}, limit={limit}, draw={draw})")
#
#     # Convert to integers safely
#     offset = int(offset) if offset else 0
#     limit = int(limit) if limit else 50
#     draw = int(draw) if draw else 1
#
#     # 1. Query Total Records in the Database (Mandatory for DataTables Scroller)
#     total_tubes_count = db.session.scalar(select(func.count(Tube.id)))
#
#     # 2. Query recently updated Fabrics with OFFSET & LIMIT
#     stmt_fabrics = (
#         select(Fabric)
#         .options(
#             selectinload(Fabric.deductions),
#             selectinload(Fabric.comments),
#             selectinload(Fabric.tube),
#         )
#         .order_by(desc(Fabric.updated_at))
#         .offset(offset)  # <-- APPLIED OFFSET
#         .limit(limit)    # <-- APPLIED LIMIT
#     )
#     recent_fabrics = db.session.scalars(stmt_fabrics).all()
#
#     # 3. Query recently updated Tubes with OFFSET & LIMIT
#     stmt_tubes = (
#         select(Tube)
#         .order_by(desc(Tube.updated_at))
#         .offset(offset)  # <-- APPLIED OFFSET
#         .limit(limit)    # <-- APPLIED LIMIT
#     )
#     recent_tubes = db.session.scalars(stmt_tubes).all()
#
#     # 4. Deduplicate tubes
#     tubes_map = {
#         tube.id: tube.payload() for tube in recent_tubes if tube.id is not None
#     }
#
#     for fabric in recent_fabrics:
#         if fabric.tube and fabric.tube.id not in tubes_map:
#             tubes_map[fabric.tube.id] = fabric.tube.payload()
#
#     fabrics_obj = [fabric.payload() for fabric in recent_fabrics]
#     tubes_obj = list(tubes_map.values())
#
#     return {
#         "draw": draw,
#         "recordsTotal": total_tubes_count,      # Controls scrollbar total range
#         "recordsFiltered": total_tubes_count,   # Adjust if applying search filters
#         "tubes": tubes_obj,
#         "fabrics": fabrics_obj,
#         "size": len(tubes_obj),
#     }, 200


def get_recent_tubes(offset=0, limit=50, draw=1):
    offset = max(0, int(offset) if offset else 0)
    limit = max(1, int(limit) if limit else 50)
    draw = int(draw) if draw else 1

    # 1. Total count of Tubes in database
    total_count = db.session.scalar(select(func.count(Tube.id))) or 0

    stmt = select(Tube).order_by(desc(Tube.updated_at)).offset(offset).limit(limit)
    tubes = db.session.scalars(stmt).all()

    return {
        "draw": draw,
        "total_records": total_count,
        "data": [tube.payload() for tube in tubes],
    }, 200


def get_recent_fabrics(offset=0, limit=50, draw=1):
    offset = max(0, int(offset) if offset else 0)
    limit = max(1, int(limit) if limit else 50)
    draw = int(draw) if draw else 1

    # 1. Total count of Fabrics in database
    total_count = db.session.scalar(select(func.count(Fabric.id))) or 0

    # 2. Query Fabrics with parent tube, deductions, and comments
    stmt = (
        select(Fabric)
        .options(
            selectinload(Fabric.deductions),
            selectinload(Fabric.comments),
        )
        .order_by(desc(Fabric.updated_at))
        .offset(offset)
        .limit(limit)
    )
    fabrics = db.session.scalars(stmt).all()

    return {
        "draw": draw,
        "recordsTotal": total_count,
        "data": [fabric.payload() for fabric in fabrics],
    }, 200


def get_tubes(offset=0, limit=50, draw=1, filters=None):
    offset = max(0, int(offset) if offset else 0)
    limit = max(1, int(limit) if limit else 50)
    draw = int(draw) if draw else 1

    # Avoid mutable default argument pitfalls
    if filters is None:
        filters = {}

    # 1. Unfiltered total count of Tubes in database
    total_count = db.session.scalar(select(func.count(Tube.id))) or 0

    # 2. Build base query joining Tube -> Fabric
    # We query Tube, but JOIN Fabric so we can filter by fabric fields
    stmt = select(Tube).join(Tube.fabrics)

    # Filter out archived fabrics
    # stmt = stmt.where(Fabric.is_archived == False)

    # --- Fabric IN Clause Filters ---
    if filters.get("blind_model"):
        stmt = stmt.where(Fabric.blind_model_id.in_(filters["blind_model"]))

    if filters.get("color"):
        stmt = stmt.where(Fabric.color_id.in_(filters["color"]))

    if filters.get("fabric_classification"):
        stmt = stmt.where(
            Fabric.fabric_classification_id.in_(filters["fabric_classification"])
        )

    if filters.get("supplier"):
        stmt = stmt.where(Fabric.supplier_id.in_(filters["supplier"]))

    # --- Fabric Range Filters ---
    width_filter = filters.get("width")
    if width_filter and width_filter.get("value") is not None:
        orient = width_filter.get("orientation", "greater")
        op = OPERATORS.get(orient, lambda col, val: col >= val)
        stmt = stmt.where(op(Fabric.original_width, width_filter["value"]))

    height_filter = filters.get("height")
    if height_filter and height_filter.get("value") is not None:
        orient = height_filter.get("orientation", "greater")
        op = OPERATORS.get(orient, lambda col, val: col >= val)
        stmt = stmt.where(op(Fabric.original_height, height_filter["value"]))

    avail_filter = filters.get("availability")
    if avail_filter and avail_filter.get("value") is not None:
        orient = avail_filter.get("orientation", "greater")
        op = OPERATORS.get(orient, lambda col, val: col >= val)
        stmt = stmt.where(op(Fabric.remaining_percent, avail_filter["value"]))

    # 3. Calculate filtered total count (unique Tube IDs after applying filters)
    count_stmt = (
        select(func.count(distinct(Tube.id))).select_from(Tube).join(Tube.fabrics)
    )
    # Re-apply the same WHERE clauses to the count statement
    if stmt.whereclause is not None:
        count_stmt = count_stmt.where(stmt.whereclause)

    filtered_count = db.session.scalar(count_stmt) or 0

    # 4. Fetch paginated distinct Tubes with eager-loaded relationships
    paginated_stmt = (
        stmt.distinct()
        .options(
            selectinload(Tube.fabrics).selectinload(Fabric.deductions),
            selectinload(Tube.fabrics).selectinload(Fabric.comments),
        )
        .order_by(desc(Tube.updated_at))
        .offset(offset)
        .limit(limit)
    )

    tubes = db.session.scalars(paginated_stmt).all()

    # 5. Return standardized DataTables payload
    return {
        "draw": draw,
        "recordsTotal": total_count,
        "recordsFiltered": filtered_count,
        "data": [tube.payload() for tube in tubes],
    }, 200


@handle_db_exceptions
def get_tube_data(id: int):
    with db.session.begin():
        tube = db.session.get(
            Tube,
            id,
            options=[
                selectinload(Tube.fabrics).selectinload(Fabric.comments),
                selectinload(Tube.fabrics).selectinload(Fabric.deductions),
            ],
        )
        if not tube:
            raise ValueError(f"Tube not found with id {id}")

        fabrics = [fabric.payload() for fabric in tube.fabrics]

        return {"tube": tube.payload(), "fabrics": fabrics}


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
def delete_fabric(id: int):
    log.debug("delete_fabric")

    with db.session.begin():
        fabric = db.session.get(
            Fabric,
            id,
            options=[
                selectinload(Fabric.comments),
                selectinload(Fabric.deductions),
                selectinload(Fabric.tube),
            ],
        )

        if not fabric:
            raise ValueError(f"fabric not found with id {id}")

        if len(fabric.comments) > 0:
            raise ValueError("No se puede borrar tela con comentarios")

        if len(fabric.deductions) > 0:
            raise ValueError("No se puede borrar tela con deducciones")
        tube = fabric.tube
        fabric_json = fabric.payload()

        db.session.delete(fabric)
        db.session.flush()

        if tube:
            db.session.refresh(tube)
            tube_json = tube.payload()
        else:
            tube_json = {}

        AuditLogger.log("Delete", "fabric", fabric.id, old_values=fabric_json)

        data = (
            {
                "fabric": fabric_json,
                "tube": tube_json,
            },
            200,
        )

        log.debug("returning data ", data)
        return data


@handle_db_exceptions
def move_fabric(fabric_id: int, payload: dict):
    log.debug("move_fabric")

    retval = update_fabric(fabric_id, payload)
    with db.session.begin():
        data = retval[0]
        log.debug("data ", data)
        data["previous_tube"] = data.pop("tube")

        tube = db.session.get(Tube, data["fabric"]["tube_id"])
        if not tube:
            raise ValueError("Tube not found")
        data["tube"] = tube.payload()

        return retval


# @handle_db_exceptions
# def tubes(query):
#     if not query or not query.isdigit():
#         raise ValueError("")
#
#     target_id = int(query)
#
#     # Search for IDs starting with or containing the typed numbers
#     log.debug(f"query {query} {target_id} ")
#     stmt = (
#         select(Tube.id)
#         .where(cast(Tube.id, String).like(f"%{query}%"))
#         .order_by(
#             (Tube.id == target_id).desc(),  # Exact match at index 0
#             Tube.id.asc(),
#         )
#         .limit(20)
#     )
#
#     # .scalars().all() returns [12, 120, 121] directly
#     tube_ids = db.session.execute(stmt).scalars().all()
#
#     log.debug(f"Tubes found are {tube_ids} ")
#
#     return tube_ids, 200


@handle_db_exceptions
def update_fabrics(data: list[dict]) -> tuple[List[dict], int]:
    updated_fabrics = []
    with db.session.begin():
        for index, item in enumerate(data):
            fabric_id = item.get("id")
            payload = item.get("partial_data", {})

            fabric = db.session.get(
                Fabric,
                fabric_id,
                options=[
                    selectinload(Fabric.deductions),
                    selectinload(Fabric.comments),
                ],
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
            db.session.flush()
            db.session.refresh(fabric)

            AuditLogger.log(
                "Update",
                "fabric",
                fabric_id,
                old_values=fabric_data_before_update,
                new_values=partial_update_payload_json,
            )

            log.debug("Updated fabric: %s", fabric)
            updated_fabrics.append(fabric.payload())

        return updated_fabrics, 200


def prevent_fabric_invalid_measurement_update(fabric: Fabric, payload: dict):
    if len(fabric.deductions) > 0 and (
        payload.get("original_width" or payload.get("original_height"))
    ):
        raise ValidationError(
            "No se puede actualizar las medidas de la tela mienstras que tenga deducciones"
        )


@handle_db_exceptions
def update_fabric(id: int, payload: dict):
    with db.session.begin():
        fabric = db.session.get(
            Fabric,
            id,
            options=[
                selectinload(Fabric.deductions),
                selectinload(Fabric.comments),
                selectinload(Fabric.tube),
            ],
        )
        if not fabric:
            raise ValueError(f"Fabric with id {id} not found.")

        tube = fabric.tube

        if not tube:
            raise ValueError(f"Fabric does not belong to a tube {id}")

        prevent_fabric_invalid_measurement_update(fabric, payload)

        fabric_old_json = fabric.model_dump(mode="json")
        update_payload = FabricUpdate.model_validate(payload).model_dump(
            exclude_unset=True
        )

        log.debug("Partial_data here is %s", update_payload)

        if not update_payload or len(update_payload) <= 0:
            raise ValueError(
                f"Fabric id {id}: 'partial_data' contains no valid update fields. {payload}"
            )

        fabric.sqlmodel_update(update_payload)
        db.session.add(fabric)
        db.session.flush()
        db.session.refresh(fabric)
        db.session.refresh(tube)

        AuditLogger.log(
            "Update",
            "fabric",
            id,
            old_values=fabric_old_json,
            new_values=payload,
        )

        log.debug("Updated fabric: %s", fabric)
        return {
            "fabric": fabric.payload(),
            "tube": tube.payload(),
        }, 200


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
        db.session.refresh(fabric)

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

        return {
            "fabric": fabric.payload(),
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
def comment_update(comment_id: int, payload: dict):

    with db.session.begin():
        comment = db.session.get(FabricComment, comment_id)

        if not comment:
            raise ValueError(f"Comment not found with id {comment_id}")

        fabric = db.session.get(
            Fabric,
            comment.fabric_id,
            options=[selectinload(Fabric.deductions), selectinload(Fabric.comments)],
        )

        if not fabric:
            raise ValueError(f"Fabric not found with id {comment.fabric_id}")

        comment_old_json = comment.model_dump(mode="json")
        comment_payload = FabricCommentUpdate.model_validate(payload).model_dump(
            exclude_unset=True
        )

        if not comment_payload or len(comment_payload) <= 0:
            raise ValueError(
                f"Comment id {comment_id}: 'partial_data' contains no valid update fields. {payload}"
            )

        comment.sqlmodel_update(comment_payload)
        db.session.add(comment)
        db.session.flush()
        db.session.refresh(fabric)

        AuditLogger.log(
            "Update",
            "fabric",
            comment_id,
            old_values=comment_old_json,
            new_values=payload,
        )

        log.debug("Updated comment: %s", comment)

        return {"fabric": fabric.payload(), "comment": comment.model_dump(mode="json")}

    return {}, 200


@handle_db_exceptions
def comment_delete(comment_id: int, fabric_id: int):
    with db.session.begin():
        comment = db.session.get(FabricComment, comment_id)
        if comment == None:
            raise ValueError(f"Comment was not found with id {comment_id}")

        fabric = db.session.get(
            Fabric,
            fabric_id,
            options=[selectinload(Fabric.deductions), selectinload(Fabric.comments)],
        )
        if fabric == None:
            raise ValueError(f"fabric was not found with id {fabric_id}")

        comment_json = comment.model_dump(mode="json")
        AuditLogger.log("Delete", "fabric_comment", comment.id, old_values=comment_json)

        db.session.delete(comment)
        fabric.comments.remove(comment)
        db.session.flush()
        db.session.refresh(fabric)

        return {"fabric": fabric.payload(), "comment": comment_json}, 200
