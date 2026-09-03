import logging

import inventario_persianas.services.core as core
from flask import Blueprint, request
from inventario_persianas.services.utils import Error

log = logging.getLogger(__name__)


core_bp = Blueprint("core", __name__)


@core_bp.post("/new/tube/")
def new_tube():
    tube_json, log_json = core.new_tube()
    return {
        "tube": tube_json,
        "log": log_json,
    }, 201


"""
Should be able to get the recent created tubes that got 0 fabrics inside
but also the more recent  updated fabrics with their tubes, maybe i dont to bring all info
from the tube and i query once tube click? fuck knows
"""


@core_bp.get("/recent_tubes")
def recent_tubes():
    log.info("recent_tubes()")
    tubes, fabrics, size = core.recent_tubes_and_fabrics()
    return {
        "tubes": tubes,
        "fabrics": fabrics,
        "size": size,
    }, 200


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

    err, updated_fabrics = core.update_fabrics(data["data"])
    if err:
        return err.returnIt()

    import json

    log.debug(
        "Returing the following data %s",
        json.dumps(updated_fabrics, indent=4, default=str),
    )
    return updated_fabrics, 200


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
