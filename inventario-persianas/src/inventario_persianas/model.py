import logging
from datetime import datetime, timezone
from typing import List, Optional


from inventario_persianas.app_types import Change
from pydantic import PositiveFloat
from sqlalchemy import JSON, Column, DateTime, event, update
from sqlmodel import Field, Relationship, SQLModel
from flask_sqlalchemy import SQLAlchemy

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


class Location(SQLModel, table=True):
    __tablename__ = "location"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    description: Optional[str] = Field(default=None, max_length=100)

    tubes: List["Tube"] = Relationship(back_populates="location")
    location_images: List["LocationImage"] = Relationship(back_populates="location")


class LocationImage(SQLModel, table=True):
    __tablename__ = "location_image"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    image_path: str = Field(max_length=100)
    location_id: int = Field(foreign_key="location.id")

    location: Optional[Location] = Relationship(back_populates="location_images")


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
    original_width: float
    original_height: float
    is_archived: bool = Field(default=False)  # Fabrics runs out of fabric to be used

    # Relationships
    tube: Optional[Tube] = Relationship(back_populates="fabrics")
    blind_model: Optional[BlindModel] = Relationship(back_populates="fabrics")
    color: Optional[Color] = Relationship(back_populates="fabrics")
    classification: Optional[FabricClassification] = Relationship(
        back_populates="fabrics"
    )
    supplier: Optional[Supplier] = Relationship(back_populates="fabrics")
    comments: List["FabricComment"] = Relationship(back_populates="fabric")
    deductions: List["FabricDeduction"] = Relationship(
        back_populates="fabric",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class FabricUpdate(SQLModel):
    tube_id: Optional[int] = Field(default=None, foreign_key="tube.id")
    blind_model_id: Optional[int] = Field(default=None, foreign_key="blind_model.id")
    color_id: Optional[int] = Field(default=None, foreign_key="color.id")
    fabric_classification_id: Optional[int] = Field(
        default=None, foreign_key="fabric_classification.id"
    )
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id")

    original_width: Optional[PositiveFloat] = None
    original_height: Optional[PositiveFloat] = None
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

    removed_height: float
    removed_width: float

    comment: Optional[str] = Field(default=None, max_length=500)
    fabric: Optional[Fabric] = Relationship(back_populates="deductions")
    spare_fabric: Optional["SpareFabric"] = Relationship(back_populates="deduction")


class FabricDeductionUpdate(SQLModel):
    fabric_id: Optional[int] = None
    removed_height: Optional[float] = None
    removed_width: Optional[float] = None
    comment: Optional[str] = Field(default=None, max_length=500)


"""
The spare fabric is made when a deduction has a width not equal
to the original width, so now you get a small fabric with
width = original_width - removed_width
height = removed_height
Technically height could be the original_height, but would make the code
harder when new deductions happen
"""


class SpareFabric(SQLModel, table=True):
    __tablename__ = "spare_fabric"  # type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    deduction_id: int = Field(foreign_key="fabric.id")
    width: float
    height: float

    deduction: Optional[FabricDeduction] = Relationship(back_populates="spare_fabric")


class AuditLog(TimestampMixin, table=True):
    __tablename__ = "audit_log"  # type: ignore #type:ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    action: str = Field(max_length=50)
    target_table: str = Field(max_length=50)
    target_id: int
    user_info: Optional[str] = Field(default=None, max_length=100)
    changes: Optional[Change] = Field(default=None, sa_column=Column(JSON))


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


catalago_models = [
    FabricClassification,
    BlindModel,
    Supplier,
    Color,
    LocationImage,
]


fabric_column2catalago_models = {
    "blind_model_id": BlindModel,
    "color_id": Color,
    "fabric_classification_id": FabricClassification,
    "supplier_id": Supplier,
}


db = SQLAlchemy(model_class=SQLModel)


if __name__ == "__main__":
    pass
