import logging
from typing import Literal, Optional

import inventario_persianas.model as mod
from inventario_persianas.model import (
    AuditLog,
    db,
)
from enum import Enum
from typing import Any, Dict


log = logging.getLogger()


type Action = Literal["Insert", "Delete", "Update"]


class Error:
    message: str
    status: int

    def __init__(self, message, status) -> None:
        self.message = message
        self.status = status

    def returnIt(self):
        return {"error": self.message}, self.status


class AuditLogger:
    @staticmethod
    def _resolve_value(column: str, raw_value: Any) -> Dict[str, Any]:
        """Resolves catalog names for foreign keys or returns raw primitives."""
        if raw_value is None:
            return {"id": None, "value": None}

        if column in mod.fabric_column2catalago_models:
            model = mod.fabric_column2catalago_models[column]
            result = db.session.get(model, raw_value)
            return {
                "id": raw_value,
                "value": result.name if result else "Not found",
            }

        return {"id": None, "value": raw_value}

    @classmethod
    def _build_changes(
        cls,
        action: Action,
        old_values: Optional[dict],
        new_values: Optional[dict],
    ) -> dict:
        """Enforces required payload inputs and constructs the changes dictionary."""
        changes = {}

        if action == "Insert":
            if not new_values:
                raise ValueError(
                    "`new_values` dictionary is required for INSERT action."
                )
            for column, new_val in new_values.items():
                if new_val == None:
                    continue
                changes[column] = cls._resolve_value(column, new_val)

        elif action == "Update":
            if not old_values or not new_values:
                raise ValueError(
                    "Both `old_values` and `new_values` are required for UPDATE action."
                )
            for column, new_val in new_values.items():
                old_val = old_values.get(column)
                changes[column] = {
                    "previous": cls._resolve_value(column, old_val),
                    "now": cls._resolve_value(column, new_val),
                }

        elif action == "Delete":
            if not old_values:
                raise ValueError(
                    "`old_values` dictionary is required for DELETE action."
                )
            for column, old_val in old_values.items():
                if old_val == None:
                    continue
                changes[column] = (cls._resolve_value(column, old_val),)

        return changes

    @classmethod
    def log(
        cls,
        action: Action,
        target_table: str,
        target_id: int,
        old_values: Optional[dict] = None,
        new_values: Optional[dict] = None,
        user_info: Optional[str] = None,
        flush: bool = True,
    ) -> dict:
        """
        Single entrypoint to construct, persist, and dump an AuditLog entry.
        """
        changes = cls._build_changes(action, old_values, new_values)

        log_entry = AuditLog(
            action=action.value if isinstance(action, Enum) else action,
            target_table=target_table,
            target_id=target_id,
            user_info=user_info,
            changes=changes,
        )

        db.session.add(log_entry)

        if flush:
            db.session.flush()

        return log_entry.model_dump(mode="json")
