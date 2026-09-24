import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import field_serializer
import decimal


from sqlalchemy import JSON, Column, DateTime, event, update
from sqlmodel import Field, Relationship, SQLModel
from flask_sqlalchemy import SQLAlchemy
from decimal import Decimal

log = logging.getLogger()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# Mixins inherit from SQLModel without table=True
class TimestampMixin(SQLModel):
    created_at: datetime = Field(
        default_factory=now_utc,
        sa_type=DateTime(timezone=True),
    )
    updated_at: datetime = Field(
        default_factory=now_utc,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": now_utc},
    )

    @field_serializer("created_at", "updated_at")
    def serialize_dt(self, dt: datetime | None, _info) -> str | None:
        if dt is None:
            return None

        # If database/SQLAlchemy stripped tzinfo, explicitly force UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        # Returns standard ISO string ending with 'Z' or offset (e.g., "2026-09-21T17:47:37.104709Z")
        return dt.isoformat()


class Color(SQLModel, table=True):
    __tablename__ = "color"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100, sa_column_kwargs={"unique": True})

    fabrics: List["Fabric"] = Relationship(back_populates="color")


class BlindModel(SQLModel, table=True):
    __tablename__ = "blind_model"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    fabrics: List["Fabric"] = Relationship(back_populates="blind_model")


class LocationTagLink(SQLModel, table=True):
    __tablename__ = "location_tag_link"

    location_id: Optional[int] = Field(
        default=None, foreign_key="location.id", primary_key=True
    )
    tag_id: Optional[int] = Field(
        default=None, foreign_key="location_tag.id", primary_key=True
    )


class Location(SQLModel, table=True):
    __tablename__ = "location"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    description: Optional[str] = Field(default=None, max_length=100)
    image_path: str = Field(max_length=100)

    tubes: List["Tube"] = Relationship(back_populates="location")
    tags: List["LocationTag"] = Relationship(
        back_populates="locations", link_model=LocationTagLink
    )

    def payload(self) -> Dict[str, Any]:
        data = self.model_dump()
        data["tags"] = [tag.model_dump() for tag in self.tags]
        return data


class LocationUpdate(SQLModel):
    description: Optional[str] = Field(default=None, max_length=100)
    image_path: Optional[str] = Field(max_length=100, default=None)


# 3. Add reverse relationship to LocationTag
class LocationTag(SQLModel, table=True):
    __tablename__ = "location_tag"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    locations: List[Location] = Relationship(
        back_populates="tags", link_model=LocationTagLink
    )


class Supplier(SQLModel, table=True):
    __tablename__ = "supplier"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    fabrics: List["Fabric"] = Relationship(back_populates="supplier")


class FabricClassification(SQLModel, table=True):
    __tablename__ = "fabric_classification"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    fabrics: List["Fabric"] = Relationship(back_populates="classification")


"""
updated_at should happen when a modification to a fabric occurs
"""


class Tube(TimestampMixin, table=True):
    __tablename__ = "tube"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    location_id: Optional[int] = Field(default=None, foreign_key="location.id")

    legacy_location_1: Optional[str] = Field(default=None, max_length=100)
    legacy_location_2: Optional[str] = Field(default=None, max_length=100)

    location: Optional[Location] = Relationship(back_populates="tubes")
    fabrics: List["Fabric"] = Relationship(back_populates="tube")
    tube_rectified: Optional["TubeRectified"] = Relationship(back_populates="tube")


"""
When a tube is rectified, it means that the tube was opened in real life
The fabric model, color, measurements are checked
That data is sent to the person using the software
Checks if there is discrenpancies for example
Measurements match in a fabric but color and model are different, update
A fabric that does not seem registered is added
When a fabric was not in the rectification it should be deleted
In this step of the process, the person in the software must be wise to determine
where the discrenpacies occur in the fabrics and do the corresponding modifications
"""


class TubeRectified(TimestampMixin, table=True):
    __tablename__ = "tube_verified"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    tube_id: int = Field(foreign_key="tube.id", sa_column_kwargs={"unique": True})
    tube: Optional[Tube] = Relationship(back_populates="tube_rectified")


"""So many attributes are optional, but thats what it is currently """


class Fabric(TimestampMixin, table=True):
    __tablename__ = "fabric"  # type:ignore #type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    tube_id: int = Field(foreign_key="tube.id")
    blind_model_id: Optional[int] = Field(foreign_key="blind_model.id")
    color_id: Optional[int] = Field(foreign_key="color.id")
    fabric_classification_id: int = Field(foreign_key="fabric_classification.id")
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id")

    # meters
    original_width: Decimal
    original_height: Decimal
    is_archived: bool = Field(default=False)  # Fabrics runs out of fabric to be used
    remaining_percent: Decimal = Field(default=Decimal(100))

    # Relationships
    tube: Optional[Tube] = Relationship(back_populates="fabrics")
    blind_model: Optional[BlindModel] = Relationship(back_populates="fabrics")
    color: Optional[Color] = Relationship(back_populates="fabrics")
    classification: Optional[FabricClassification] = Relationship(
        back_populates="fabrics"
    )

    supplier: Optional[Supplier] = Relationship(back_populates="fabrics")
    comments: List["FabricComment"] = Relationship(
        back_populates="fabric",
        sa_relationship_kwargs={"order_by": "desc(FabricComment.updated_at)"},
    )
    deductions: List["FabricDeduction"] = Relationship(
        back_populates="fabric",
        sa_relationship_kwargs={
            "foreign_keys": "FabricDeduction.fabric_id",
            "cascade": "all, delete-orphan",
            "order_by": "desc(FabricDeduction.updated_at)",
        },
    )

    @field_serializer(
        "original_height", "original_width", "remaining_percent", mode="plain"
    )
    def serialize_decimal(self, v: Decimal) -> str:
        return (
            f"{v.quantize(Decimal('0.001'), rounding=decimal.ROUND_HALF_UP).normalize():f}"
            if v is not None
            else v
        )

    def payload(self):
        fabric_json = self.model_dump(mode="json")
        fabric_json["deductions"] = []
        fabric_json["comments"] = []
        for deduct in self.deductions:
            fabric_json["deductions"].append(deduct.model_dump(mode="json"))

        for comment in self.comments:
            fabric_json["comments"].append(comment.model_dump(mode="json"))

        return fabric_json


class FabricUpdate(SQLModel):
    tube_id: Optional[int] = Field(default=None, foreign_key="tube.id")
    blind_model_id: Optional[int] = Field(default=None, foreign_key="blind_model.id")
    color_id: Optional[int] = Field(default=None, foreign_key="color.id")
    fabric_classification_id: Optional[int] = Field(
        default=None, foreign_key="fabric_classification.id"
    )
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id")

    original_width: Optional[Decimal] = None
    original_height: Optional[Decimal] = None
    is_archived: Optional[bool] = None


class FabricMarkForDeletion(TimestampMixin):
    __tablename__ = "fabric_mark_for_deletion"  # type:ignore #type:ignore
    comment: str = Field()
    tube_id: int = Field(foreign_key="tube.id")
    tube: Optional[Fabric] = Relationship(back_populates="fabric_mark_for_deletion")


class FabricComment(TimestampMixin, table=True):
    __tablename__ = "fabric_comment"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    comment: Optional[str] = Field(default=None, max_length=500)
    fabric_id: int = Field(foreign_key="fabric.id")

    fabric: Optional[Fabric] = Relationship(back_populates="comments")


class FabricCommentUpdate(TimestampMixin):
    id: Optional[int] = Field(default=None, primary_key=True)
    comment: Optional[str] = Field(default=None, max_length=500)


"""
So we are going to display the original measurement and also the actual value that it has
The history of quantity removed (We can only remove, not possible to add but we can update history)
If you try to remove more that it makes the current value less that 0 , then it must error cause you cant and 
you are tring to squeeze more out of the lemon when there is none.
Finally when the value is set to 0 
The fabric gets flagged for adding it to the archive, so that it is not searchable in the current active blinds
Maybe if a tube has only that fabric, then the tube is also sent to the archive or idk
I think only height is ever removed from the blind i think, gotta ask
Example

Current value 2.0 m | original 3.0 m
        - 1.0 m
"""


class FabricDeduction(TimestampMixin, table=True):
    __tablename__ = "fabric_deduction"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    fabric_id: int = Field(foreign_key="fabric.id")

    removed_height: Decimal
    removed_width: Decimal

    comment: Optional[str] = Field(default=None, max_length=500)

    fabric: Fabric = Relationship(
        back_populates="deductions",
        sa_relationship_kwargs={"foreign_keys": "FabricDeduction.fabric_id"},
    )

    @field_serializer("removed_height", "removed_width", mode="plain")
    def serialize_decimal(self, v: Decimal) -> str:
        return f"{v.normalize():f}" if v is not None else v


class FabricDeductionUpdate(SQLModel):
    fabric_id: Optional[int] = None
    removed_height: Optional[Decimal] = None
    removed_width: Optional[Decimal] = None
    comment: Optional[str] = Field(default=None, max_length=500)


class AuditLog(TimestampMixin, table=True):
    __tablename__ = "audit_log"  # type: ignore #type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    action: str = Field(max_length=50)
    target_table: str = Field(max_length=50)
    target_id: int
    extra_message: Optional[str] = Field(default=None, max_length=100)
    changes: Optional[Dict] = Field(default=None, sa_column=Column(JSON))


@event.listens_for(Fabric, "after_insert")
@event.listens_for(Fabric, "after_update")
@event.listens_for(Fabric, "after_delete")
def touch_parent_tube(mapper, connection, target: Fabric):
    connection.execute(
        update(Tube)
        .where(Tube.id == target.tube_id)
        .values(updated_at=datetime.now(timezone.utc))
    )


from datetime import datetime
from sqlalchemy import event, select


@event.listens_for(FabricDeduction, "after_insert")
@event.listens_for(FabricDeduction, "after_update")
@event.listens_for(FabricDeduction, "after_delete")
def update_fabric_and_tube_on_deduction_change(
    mapper, connection, target: FabricDeduction
):
    log.debug("update_fabric_and_tube_on_deduction_change()")
    now = datetime.now(timezone.utc)

    # 1. Update parent Fabric
    connection.execute(
        update(Fabric).where(Fabric.id == target.fabric_id).values(updated_at=now)
    )

    # 2. Query tube_id directly using the Core connection
    tube_id = connection.scalar(
        select(Fabric.tube_id).where(Fabric.id == target.fabric_id)
    )

    if tube_id is None:
        log.error("Fabric or Tube ID not found for fabric_id %s", target.fabric_id)
        return

    # 3. Update grandparent Tube
    connection.execute(update(Tube).where(Tube.id == tube_id).values(updated_at=now))


@event.listens_for(FabricComment, "after_insert")
@event.listens_for(FabricComment, "after_update")
@event.listens_for(FabricComment, "after_delete")
def update_fabric_and_tube_on_comment_change(mapper, connection, target: FabricComment):
    log.debug("update_fabric_and_tube_on_comment_change()")
    now = datetime.now(timezone.utc)

    # 1. Update parent Fabric
    connection.execute(
        update(Fabric).where(Fabric.id == target.fabric_id).values(updated_at=now)
    )

    # 2. Query tube_id directly using the Core connection
    tube_id = connection.scalar(
        select(Fabric.tube_id).where(Fabric.id == target.fabric_id)
    )

    if tube_id is None:
        log.error("Fabric or Tube ID not found for fabric_id %s", target.fabric_id)
        return

    # 3. Update grandparent Tube
    connection.execute(update(Tube).where(Tube.id == tube_id).values(updated_at=now))


catalago_models = [
    FabricClassification,
    BlindModel,
    Supplier,
    Color,
    Location,
    LocationTag,
]


fabric_column2catalago_models = {
    "blind_model_id": BlindModel,
    "color_id": Color,
    "fabric_classification_id": FabricClassification,
    "supplier_id": Supplier,
    "location_id": Location,
    "location_tag": LocationTag,
}


db = SQLAlchemy(model_class=SQLModel)


if __name__ == "__main__":
    pass
