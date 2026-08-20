import inventario_persianas.model as mod

from sqlalchemy.orm import Session
from sqlalchemy import Delete
from inventario_persianas.model import AuditLog, Color, Supplier, Location, BlindModel, FabricClassification
from inventario_persianas.model import Color, db
from typing import Literal



from typing import Optional, Dict, Any

from inventario_persianas.app_types import Change



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
    db.session.commit()
    db.session.refresh(log_entry)
    return log_entry.model_dump()

