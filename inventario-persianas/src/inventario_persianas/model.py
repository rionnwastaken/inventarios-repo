from datetime import date, datetime, timezone
from typing import List, Optional
from sqlalchemy import JSON, Column, DateTime, func
from sqlmodel import Field, Relationship, SQLModel
from typing import ClassVar

from inventario_persianas.app_types import Change


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# Mixins inherit from SQLModel without table=True
class TimestampMixin(SQLModel):
    created_at: datetime = Field(
        default_factory=now_utc,
        sa_column=Column(DateTime(timezone=True), nullable=False, default=now_utc),
    )
    updated_at: datetime = Field(
        default_factory=now_utc,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=now_utc,
            onupdate=now_utc,
        ),
    )


class Color(SQLModel, table=True):
    __tablename__ = "color"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100, sa_column_kwargs={"unique": True})

    fabrics: List["Fabric"] = Relationship(back_populates="color")


class BlindModel(SQLModel, table=True):
    __tablename__ = "blind_model"

    id: Optional[int] = Field(default=None, primary_key=True)
    model: str = Field(max_length=100)

    fabrics: List["Fabric"] = Relationship(back_populates="blind_model")


class Location(SQLModel, table=True):
    __tablename__ = "location"

    id: Optional[int] = Field(default=None, primary_key=True)
    description: Optional[str] = Field(default=None, max_length=100)

    tubes: List["Tube"] = Relationship(back_populates="location")
    location_images: List["LocationImage"] = Relationship(back_populates="location")


class LocationImage(SQLModel, table=True):
    __tablename__ = "location_image"

    id: Optional[int] = Field(default=None, primary_key=True)
    image_path: str = Field(max_length=100)
    location_id: int = Field(foreign_key="location.id")

    location: Optional[Location] = Relationship(back_populates="location_images")


class Supplier(SQLModel, table=True):
    __tablename__ = "supplier"

    id: Optional[int] = Field(default=None, primary_key=True)
    supplier: str = Field(max_length=100)

    fabrics: List["Fabric"] = Relationship(back_populates="supplier")


class FabricClassification(SQLModel, table=True):
    __tablename__ = "fabric_classification"

    id: Optional[int] = Field(default=None, primary_key=True)
    classification: str = Field(max_length=100)

    fabrics: List["Fabric"] = Relationship(back_populates="classification")


class Tube(SQLModel, table=True):
    __tablename__ = "tube"

    id: Optional[int] = Field(default=None, primary_key=True)
    location_id: Optional[int] = Field(default=None, foreign_key="location.id")

    legacy_location_1: Optional[str] = Field(default=None, max_length=100)
    legacy_location_2: Optional[str] = Field(default=None, max_length=100)

    location: Optional[Location] = Relationship(back_populates="tubes")
    fabrics: List["Fabric"] = Relationship(back_populates="tube")
    tube_rectified: Optional["TubeRectified"] = Relationship(back_populates="tube")


class TubeRectified(SQLModel, table=True):
    __tablename__ = "tube_verified"

    id: Optional[int] = Field(default=None, primary_key=True)
    tube_id: int = Field(foreign_key="tube.id", sa_column_kwargs={"unique": True})

    tube: Optional[Tube] = Relationship(back_populates="tube_rectified")


class Fabric(SQLModel, table=True):
    __tablename__ = "fabric"

    id: Optional[int] = Field(default=None, primary_key=True)
    tube_id: int = Field(foreign_key="tube.id")
    blind_model_id: int = Field(foreign_key="blind_model.id")
    color_id: int = Field(foreign_key="color.id")
    classification_id: Optional[int] = Field(
        default=None, foreign_key="fabric_classification.id"
    )
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id")

    original_width: float
    original_height: float
    current_height: float
    is_archived: bool = Field(default=False)

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


class FabricComment(SQLModel, table=True):
    __tablename__ = "fabric_comment"

    id: Optional[int] = Field(default=None, primary_key=True)
    comment: Optional[str] = Field(default=None, max_length=500)
    creation_date: date
    last_update: date
    fabric_id: int = Field(foreign_key="fabric.id")

    fabric: Optional[Fabric] = Relationship(back_populates="comments")


class FabricDeduction(SQLModel, table=True):
    __tablename__ = "fabric_deduction"

    id: Optional[int] = Field(default=None, primary_key=True)
    fabric_id: int = Field(foreign_key="fabric.id")

    removed_height: float
    removed_width: float = Field(default=0.0)

    comment: Optional[str] = Field(default=None, max_length=500)
    creation_date: date
    last_update: date

    fabric: Optional[Fabric] = Relationship(back_populates="deductions")


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log" #type: ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(
        default_factory=now_utc, sa_column_kwargs={"server_default": func.now()}
    )
    action: str = Field(max_length=50)
    target_table: str = Field(max_length=50)
    target_id: int
    user_info: Optional[str] = Field(default=None, max_length=100)
    changes: Optional[Change] = Field(default=None, sa_column=Column(JSON))


from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy(model_class=SQLModel)
