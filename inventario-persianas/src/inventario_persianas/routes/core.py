import logging

import inventario_persianas.services.core as core
from flask import Blueprint, request
from inventario_persianas.services.utils import Error

log = logging.getLogger(__name__)


core_bp = Blueprint("core", __name__)


@core_bp.post("/new/tube/")
def new_tube():
    tube_json = core.new_tube()
    return {
        "tube": tube_json,
    }, 201


@core_bp.post("/tube/delete/")
def delete_tube():
    data = request.get_json()
    id = data.get("id")
    if id == None:
        return Error(f"id not found in data {data} ", 400).returnIt()

    return core.delete_tube(id)


"""
Should be able to get the recent created tubes that got 0 fabrics inside
but also the more recent  updated fabrics with their tubes, maybe i dont to bring all info
from the tube and i query once tube click? fuck knows
"""


@core_bp.post("/tubes")
def tubes():
    log.info("tubes()")
    data = request.get_json()

    offset = data.get("offset")
    limit = data.get("limit")
    draw = data.get("draw")
    filters = data.get("filters")

    log.debug(f"Data received {data}")

    if not data:
        return Error("No data ppase", 400).returnIt()

    if filters == None:
        return core.get_recent_tubes(offset, limit, draw)
    else:
        return core.get_tubes(offset, limit, draw, filters)


@core_bp.post("/fabrics")
def fabrics():
    log.info("fabrics()")
    data = request.get_json()

    offset = data.get("offset")
    limit = data.get("limit")
    draw = data.get("draw")
    filters = data.get("filters")

    log.debug(f"Data received {data}")

    if not data:
        return Error("No data ppase", 400).returnIt()

    if filters == None:
        return core.get_recent_fabrics(offset, limit, draw)

    else:
        return core.get_fabrics(offset, limit, draw, filters)


@core_bp.post("/tube/fabrics")
def tube_data():
    log.info("fabrics_from_tube()")
    data = request.get_json() or {}
    id = data.get("id")
    if not id:
        return Error(f"No id passed {data}", 400).returnIt()

    return core.get_tube_data(id)


@core_bp.get("/tubes2")
def tubes2():
    log.info("recent_tubes()")
    query = request.args.get("q")

    if not query:
        return Error("Query parameter not passed", 400).returnIt()
    return core.tubes2(query)


# If q is empty or not digits, return an empty list immediately


@core_bp.post("/tube/update/")
def update_tube():
    log.info("updat_tube()")
    data = request.get_json()

    tube_id = data.get("id")
    payload = data.get("payload")

    if tube_id == None or payload == None:
        return Error(f"tube id or payload are None {tube_id} {payload}", 400).returnIt()

    return core.update_tube(tube_id, payload)


@core_bp.post("/fabric/add_many")
def fabric_add_many():
    data = request.get_json()

    if not data:
        return {"error": "No data"}, 400

    fabrics: list[dict] = data.get("fabrics")
    if not fabrics:
        return {"error": "Key 'fabrics' was not passed in the data"}, 400

    inserted_fabrics = core.add_fabrics(fabrics)

    return {"fabrics": inserted_fabrics}, 200


# TODO UPDATE typescript and this to make it be PATCH
@core_bp.post("/fabric/edit/many/")
def update_fabrics():
    data = request.get_json()
    if not data:
        return Error("Payload to update was not passed", 400).returnIt()

    data = core.update_fabrics(data["data"])
    return data


@core_bp.post("/fabric/delete/")
def fabric_delete():
    data = request.get_json() or {}
    fabric_id = data.get("id")
    if not fabric_id:
        return Error(f"Id was not found {fabric_id}", 400).returnIt()

    return core.delete_fabric(fabric_id)


@core_bp.post("/fabric/move/")
def fabric_move():
    data = request.get_json() or {}
    fabric_id = data.get("fabric_id")
    payload = data.get("payload")
    if not fabric_id or not payload:
        return Error(
            f"'fabric_id' or 'payload' was not found {fabric_id} {payload}", 400
        ).returnIt()

    return core.move_fabric(fabric_id, payload)


@core_bp.post("/fabric/deduction/update/")
def update_deduction():
    log.debug("update_deductions():")
    data = request.get_json()
    if not data:
        return Error("Payload to update was not passed", 400).returnIt()

    fabric_id = data.get("fabric_id")
    deduction_id = data.get("deduction_id")
    deduction_partial_data = data.get("deduction_partial_data")

    if fabric_id is None or deduction_id is None or deduction_partial_data is None:
        log.debug(
            "Missing required fields: fabric_id, deduction_id, and deduction_partial_data are required"
        )
        return Error(
            "Missing required fields: fabric_id, deduction_id, and deduction_partial_data are required",
            400,
        ).returnIt()

    data = core.update_deduction(fabric_id, deduction_id, deduction_partial_data)

    return data


@core_bp.post("/fabric/new/deduction/")
def deduction_new():
    log.debug("deduction_new()")
    deduction = request.get_json()

    if deduction is None:
        return Error("Didnt receive data", 400).returnIt()

    return core.deduction_new(deduction)


@core_bp.post("/fabric/deduction/delete/")
def deduction_delete():
    log.debug("deduction_delete()")
    data = request.get_json()

    if data is None:
        return Error("Didnt receive data", 400).returnIt()

    fabric_id = data.get("fabric_id")
    deduction_id = data.get("deduction_id")

    if fabric_id == None or deduction_id == None:
        return Error(
            f"fabric_id or deduction_id is None {fabric_id} {deduction_id}", 400
        ).returnIt()

    return core.deduction_delete(fabric_id, deduction_id)


@core_bp.post("/fabric/comment/new/")
def comment_new():
    log.debug("comment_new()")
    data = request.get_json()

    if data is None:
        return Error("Didnt receive data", 400).returnIt()

    comment = data.get("comment")
    if comment == None:
        return Error(f"Comment is None {comment}", 400).returnIt()

    return core.comment_new(comment)


@core_bp.post("/fabric/comment/update/")
def comment_update():
    log.debug("comment_update()")
    data = request.get_json()

    if data is None:
        return Error("Didnt receive data", 400).returnIt()

    comment_partial = data.get("comment_partial")
    comment_id = data.get("comment_id")
    if comment_partial == None or comment_id == None:
        return Error(
            f"Commen or fabric_idt is None {comment_partial} {comment_id}", 400
        ).returnIt()

    return core.comment_update(comment_id, comment_partial)


@core_bp.post("/fabric/comment/delete/")
def comment_delete():
    log.debug("comment_delete()")
    data = request.get_json()

    if data is None:
        return Error("Didnt receive data", 400).returnIt()

    comment_id = data.get("comment_id")
    fabric_id = data.get("fabric_id")

    if comment_id == None or fabric_id == None:
        return Error(
            f"Commen or fabric_idt is None {comment_id} {fabric_id}", 400
        ).returnIt()

    return core.comment_delete(comment_id, fabric_id)
