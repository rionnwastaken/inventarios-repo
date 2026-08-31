import logging
from typing import Literal, Optional

import inventario_persianas.model as mod
from inventario_persianas.app_types import Change
from inventario_persianas.model import (
    AuditLog,
    db,
)

log = logging.getLogger()


type Action = Literal["Insert", "Edit", "Delete", "Update"]


# Improve audit log so that it caters insertions, updates and deletions
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
    message: str
    status: int

    def __init__(self, message, status) -> None:
        self.message = message
        self.status = status

    def returnIt(self):
        return {"error": self.message}, self.status


"""
When its a foreign id, we need to retrieve the actual value
This might belong to audit log cause thats where it is used
"""


def create_json_with_actual_values_auditlog(
    full_old_values: dict, new_values: dict
) -> dict:
    data = {}

    # Iterate strictly over the keys present in the partial payload
    for column, new_value in new_values.items():
        old_value = full_old_values.get(column)

        if column in mod.fabric_column2catalago_models:
            model = mod.fabric_column2catalago_models[column]

            old_result = (
                db.session.get(model, old_value) if old_value is not None else None
            )
            new_result = (
                db.session.get(model, new_value) if new_value is not None else None
            )

            data[column] = {
                "previous": {
                    "id": old_value,
                    "value": old_result.name if old_result else "Not found",
                },
                "now": {
                    "id": new_value,
                    "value": new_result.name if new_result else "Not found",
                },
            }
        else:
            data[column] = {
                "previous": {
                    "id": None,
                    "value": old_value,
                },
                "now": {
                    "id": None,
                    "value": new_value,
                },
            }

    return data
