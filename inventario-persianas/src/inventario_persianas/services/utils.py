from dataclasses import field

from flask import session

import inventario_persianas.model as mod

from sqlalchemy.orm import Session
from sqlalchemy import Delete
from inventario_persianas.model import AuditLog, Color, Supplier, Location, BlindModel, FabricClassification
from inventario_persianas.model import Color, db
from typing import Literal



from typing import Optional, Dict, Any

from inventario_persianas.app_types import Change
import logging

log = logging.getLogger()



type Action = Literal["Insert", "Edit", "Delete","Update"]
def create_audit_log(
    action: Action,
    target_table: str,
    target_id: int,
    user_info: Optional[str] = None,
    changes: Optional[Change] = None,
) -> dict:
    """Creates and persists an AuditLog entry into the database."""
    log_entry = AuditLog(
        action=action,
        target_table=target_table,
        target_id=target_id,
        user_info=user_info,
        changes=changes,
    )

    db.session.add(log_entry)
    # db.session.flush()
    return log_entry.model_dump()


class Error:
    message:str
    status:int

    def __init__(self,message,status) -> None:
        self.message = message
        self.status = status

    def returnIt(self):
        return {"error":self.message},self.status




"""
When its a foreign id, we need to retrieve the actual value
This might belong to audit log cause thats where it is used
"""
def create_json_with_actual_values_auditlog(old_values:dict,new_values:dict):
    data = {}

    for column,_ in old_values.items():
        
        if column in mod.fabric_column2catalago_models:
            model = mod.fabric_column2catalago_models[column]

            old_id = old_values[column]
            new_id = new_values[column]

            old_result = db.session.get(model,old_id) or None 
            new_result = db.session.get(model,new_id) or None

            data[column] = {}

            if old_result:
                data[column]["previous"] = {
                        "id":old_id,
                        "value":old_result.name,
                        }
            else:
                data[column]["previous"] = {
                        "id":old_id,
                        "value":"Not found",
                        }

            if new_result:
                data[column]["now"] = {
                        "id":new_id,
                        "value":new_result.name,
                        }
            else:
                data[column]["now"] = {
                        "id":new_id,
                        "value":"Not found",
                        }

            continue

        old_value = old_values[column]
        new_value = new_values[column]
        
        data[column] = {}
        data[column]["previous"] = {
                "id":None,
                "value":old_value
                }

        data[column]["now"] = {
                "id":None,
                "value":new_value
                }

    return data





