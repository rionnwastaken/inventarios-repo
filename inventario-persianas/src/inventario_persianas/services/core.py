import logging

from operator import and_
from typing import List, Optional
from decimal import Decimal
from functools import wraps

from sqlalchemy import select, desc
from sqlmodel import String, cast, or_


from inventario_persianas.exceptions import OverDrawing
from inventario_persianas.model import (
    ExcelTubeInfo,
    ExcelTubeLocation,
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
from sqlalchemy import func

log = logging.getLogger(__name__)


# Mapping orientation keys to Python/SQLAlchemy comparison operators
OPERATORS = {
    "greater": lambda col, val: col >= val,
    "less": lambda col, val: col <= val,
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
            return Error((e), 400).returnIt()
        except OverDrawing as e:
            log.exception(e)
            return Error((e), 400).returnIt()
        except ValueError as e:
            log.exception(e)
            return Error((e), 400).returnIt()

        except Exception as e:
            log.exception(e)
            return Error((e), 400).returnIt()

    return wrapper


@handle_db_exceptions
def new_tube(tube_id=None):
    with db.session.begin():
        if tube_id != None:
            tube_exists = db.session.get(Tube, tube_id)
            if tube_exists:
                raise ValueError({"error": f"Tubo {tube_id} ya existe", "status": 409})
            tube = Tube(id=tube_id)
        else:
            tube = Tube()

        db.session.add(tube)
        db.session.flush()

        tube_json = tube.payload()
        AuditLogger.log("Insert", "tube", tube.id, new_values=tube_json)
        log.debug(f"new tube json {tube_json} {len(tube_json)} ")

        return {"tube": tube_json}, 201


@handle_db_exceptions
def delete_tube(id):
    with db.session.begin():
        tube = db.session.get(Tube, id, options=[selectinload(Tube.fabrics)])
        if not tube:
            raise ValueError(f"Tube with id {id} was not found")

        if len(tube.fabrics) > 0:
            raise ValueError(
                f"No se puede borrar tubo con que tiene {len(tube.fabrics)} telas"
            )

        excel_info = db.session.scalar(select(ExcelTubeInfo).where(ExcelTubeInfo.tube_id == tube.id))
        if (excel_info):
            excel_info_payload = excel_info.payload()
            db.session.delete(excel_info)
            db.session.flush()
            AuditLogger.log("Delete", "excel_tube_info", excel_info.id, old_values=excel_info_payload)


        tube_json = tube.payload()

        db.session.delete(tube)
        db.session.flush()

        AuditLogger.log("Delete", "tube", tube.id, old_values=tube_json)

        return {"tube": tube_json}


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
        "total_filtered": total_count,
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
        "total_records": total_count,
        "total_filtered": total_count,
        "data": [fabric.payload() for fabric in fabrics],
    }, 200


FABRIC_IN_FILTERS = {
    "blind_model": Fabric.blind_model_id,
    "color": Fabric.color_id,
    "fabric_classification": Fabric.fabric_classification_id,
    "supplier": Fabric.supplier_id,
}

FABRIC_RANGE_FILTERS = {
    "width": Fabric.original_width,
    "height": Fabric.original_height,
    "availability": Fabric.remaining_percent,
}

EXCEL_INFO_FILTERS = {"excel_tube_location": ExcelTubeInfo.locations}

DEFAULT_OP = lambda col, val: col >= val  # noqa


def parse_datatable_params(offset, limit, draw):
    offset = max(0, int(offset) if offset else 0)
    limit = max(1, int(limit) if limit else 50)
    draw = int(draw) if draw else 1
    return offset, limit, draw


def apply_filters(stmt, filters):
    """Adds the fabric WHERE clauses to any statement that includes Fabric."""
    filters = filters or {}

    log.debug(f"apply_fabric_filters() received filters are {filters} ")

    for key, column in FABRIC_IN_FILTERS.items():
        values = filters.get(key)
        if values:
            stmt = stmt.where(
                or_(
                    column.in_(values),
                    Fabric.id.is_(None),  # Allows empty/naked tubes
                )
            )

    for key, column in FABRIC_RANGE_FILTERS.items():
        f = filters.get(key)
        if f and f.get("value") is not None:
            op = OPERATORS.get(f.get("orientation", "greater"), DEFAULT_OP)
            stmt = stmt.where(
                or_(
                    op(column, f["value"]),
                    Fabric.id.is_(None),  # Allows empty/naked tubes
                )
            )

    stmt = stmt.outerjoin(ExcelTubeInfo, Tube.id == ExcelTubeInfo.tube_id)

    for key, relationship_attr in EXCEL_INFO_FILTERS.items():
        values = filters.get(key)
        if values:
            # Ensure values is treated as a list for .in_()
            if not isinstance(values, (list, tuple)):
                values = [values]

            stmt = stmt.where(relationship_attr.any(ExcelTubeLocation.id.in_(values)))

    tube_verified = filters.get("tube_verified")
    if tube_verified is not None:
        if tube_verified:
            # Verified: Either NOT in Excel (program-created) OR Excel entry is verified=True
            stmt = stmt.where(
                or_(ExcelTubeInfo.id.is_(None), ExcelTubeInfo.verified == True)
            )
        else:
            # Not verified: Must be in Excel AND have verified=False
            stmt = stmt.where(
                and_(ExcelTubeInfo.id.is_not(None), ExcelTubeInfo.verified == False)
            )

    return stmt


def datatable_response(model, stmt, *, offset, limit, draw, order_by, options=()):
    """
    Runs the count + pagination for any filtered select(model) statement
    and returns the DataTables payload.
    """
    total_count = db.session.scalar(select(func.count(model.id))) or 0

    # Count unique ids of the filtered statement (joins and wheres are kept)
    ids_subq = stmt.with_only_columns(model.id).distinct().subquery()
    filtered_count = db.session.scalar(select(func.count()).select_from(ids_subq)) or 0

    paginated_stmt = (
        stmt.distinct().options(*options).order_by(order_by).offset(offset).limit(limit)
    )
    rows = db.session.scalars(paginated_stmt).all()
    rows_payload = [row.payload() for row in rows]

    log.debug(f"Retuning payload of {len(rows_payload)}")

    return {
        "draw": draw,
        "total_records": total_count,
        "total_filtered": filtered_count,
        "data": rows_payload,
    }, 200


def get_tubes(data):

    log.debug("start to get tubes")

    offset = data.get("offset")
    limit = data.get("limit")
    draw = data.get("draw")
    filters = data.get("filters", {})
    search = data.get("search")

    offset, limit, draw = parse_datatable_params(offset, limit, draw)

    # Tube matches if ANY of its fabrics matches
    stmt = apply_filters(
        select(Tube).outerjoin(Tube.fabrics),
        filters,
    )

    log.debug(f"end get tubes and statement is {stmt}")
    return datatable_response(
        Tube,
        stmt,
        offset=offset,
        limit=limit,
        draw=draw,
        order_by=desc(Tube.updated_at),
    )


def get_fabrics(offset=0, limit=50, draw=1, filters=None):
    offset, limit, draw = parse_datatable_params(offset, limit, draw)
    filters = filters or {}

    stmt = apply_filters(
        select(Fabric).join(Fabric.tube),
        filters,
    )

    return datatable_response(
        Fabric,
        stmt,
        offset=offset,
        limit=limit,
        draw=draw,
        order_by=desc(Fabric.updated_at),
        options=(
            selectinload(Fabric.deductions),
            selectinload(Fabric.comments),
        ),
    )


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
def add_fabric(fabric_data: dict):

    log.debug(f"Fabrics to add data {fabric_data} ")
    with db.session.begin():
        fabric_data.pop("created_at", None)
        fabric_data.pop("updated_at", None)

        log.debug(f"Fabric here is {fabric_data}")
        fabric = Fabric.model_validate(fabric_data)
        db.session.add(fabric)
        db.session.flush()
        fabric_json = fabric.payload()

        tube = db.session.get(Tube, fabric.tube_id)
        if not tube:
            raise ValueError(
                f"Tube not found with id {fabric.tube_id} from fabric {fabric_json} "
            )

        log_json = AuditLogger.log(
            "Insert", "fabric", fabric.id, new_values=fabric_json
        )
        return {"fabric": fabric_json, "tube": tube.payload()}, 200


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


# TODO prevent if trying to move to current tube
@handle_db_exceptions
def move_fabric(fabric_id: int, payload: dict):
    log.debug("move_fabric")

    retval = update_fabric(fabric_id, payload, {"message": "Move to another tube"})
    with db.session.begin():
        data = retval[0]
        log.debug("data ", data)
        data["previous_tube"] = data.pop("tube")

        tube = db.session.get(Tube, data["fabric"]["tube_id"])
        if not tube:
            raise ValueError("Tube not found")
        data["tube"] = tube.payload()

        return retval


# TODO FIX this bullshit, there are 2 functions that query tubes


@handle_db_exceptions
def search_tubes(query):
    target_id = int(query)

    # Search for IDs starting with or containing the typed numbers
    log.debug(f"query {query} {target_id} ")
    stmt = (
        select(Tube.id)
        .where(cast(Tube.id, String).like(f"%{query}%"))
        .order_by(
            (Tube.id == target_id).desc(),  # Exact match at index 0
            Tube.id.asc(),
        )
        .limit(20)
    )

    # .scalars().all() returns [12, 120, 121] directly
    tube_ids = db.session.execute(stmt).scalars().all()

    log.debug(f"Tubes found are {tube_ids} ")

    return tube_ids, 200


@handle_db_exceptions
def search_excel_tubes(query):
    # Try parsing query as an integer to prioritize exact matches if applicable
    try:
        target_id = int(query)
    except (ValueError, TypeError):
        target_id = None

    log.debug(f"query {query} target_id {target_id}")

    # Search exclusively by excel_tube_id
    stmt = select(ExcelTubeInfo).where(
        cast(ExcelTubeInfo.excel_tube_id, String).like(f"%{query}%")
    )

    # Order by exact match first (if query is a valid number), then ascending
    if target_id is not None:
        stmt = stmt.order_by(
            (ExcelTubeInfo.excel_tube_id == target_id).desc(),
            ExcelTubeInfo.excel_tube_id.asc(),
        )
    else:
        stmt = stmt.order_by(ExcelTubeInfo.excel_tube_id.asc())

    stmt = stmt.limit(20)

    excel_tubes = db.session.execute(stmt).scalars().all()
    log.debug(f"ExcelTubeInfos found: {len(excel_tubes)}")

    # Map the results to the requested structure
    results = [
        {
            "excel_id": info.excel_tube_id,
            "textile": info.textile.name
            if info.textile and hasattr(info.textile, "name")
            else info.textile_id,
            "tube_id": info.tube_id,
        }
        for info in excel_tubes
    ]

    return results, 200


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
def update_fabric(id: int, payload: dict, extra: dict[str, str] = None):
    if not extra:
        extra = {}
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
            message=extra.get("message"),
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


@handle_db_exceptions
def tube_excel_info(tube_id: int):
    with db.session.begin():
        statement = (
            select(ExcelTubeInfo)
            .options(selectinload(ExcelTubeInfo.locations))
            .where(ExcelTubeInfo.tube_id == tube_id)
        )
        excel_info = db.session.execute(statement).scalar()

        if not excel_info:
            raise ValueError(f"Excel info data not found with id {tube_id}")

        return excel_info.payload(), 200


@handle_db_exceptions
def update_excel_info_verified(id: int, verified):
    with db.session.begin():
        excel_info = db.session.get(ExcelTubeInfo, id)
        if not excel_info:
            raise ValueError(f"ExcelInfo not found with id {id}")

        excel_info.verified = verified
        db.session.add(excel_info)
        db.session.flush()
        AuditLogger.log(
            "Update",
            "excel_info",
            id,
            old_values={"verified": not verified},
            new_values={"verified": verified},
        )
        return {"excel_info": excel_info.payload()}, 200
