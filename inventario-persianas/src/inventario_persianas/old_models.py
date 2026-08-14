from datetime import date, datetime
import logging
from typing import List, Optional
from sqlalchemy import Boolean, Engine, LargeBinary, String, Float, Date, ForeignKey, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import inventario_persianas.config as config
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import  DateTime, JSON, func
import sqlmodel 



from datetime import datetime, timezone

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=now_utc,  # Python generates aware UTC datetime on INSERT
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=now_utc,  # Initial value
        onupdate=now_utc, # Updated value on UPDATE
        nullable=False
    )



class Base(DeclarativeBase,SerializerMixin):
    pass


db = SQLAlchemy(model_class=Base)


class Color(db.Model):
    __tablename__ = "color"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100),unique=True)

    fabrics: Mapped[List["Fabric"]] = relationship(back_populates="color")


    def to_dict(self):
        return {
                "id":self.id,
                "name":self.name
                }


class BlindModel(db.Model):
    __tablename__ = "blind_model"

    id: Mapped[int] = mapped_column(primary_key=True)
    model: Mapped[str] = mapped_column(String(100))

    fabrics: Mapped[List["Fabric"]] = relationship(back_populates="blind_model")


class Location(db.Model):
    __tablename__ = "location"
    id: Mapped[int] = mapped_column(primary_key=True)
    description: Mapped[str] = mapped_column(String(100),nullable=True)
    tubes: Mapped[List["Tube"]] = relationship(back_populates="location")


class LocationImage(db.Model):
    __tablename__ = "location_image"
    id: Mapped[int] = mapped_column(primary_key=True)
    image_path: Mapped[str] = mapped_column(String(100),nullable=False)
    location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("location.id"), nullable=False
    )
    loaction: Mapped[Location] = relationship(back_populates="location_image")


class Supplier(db.Model):
    __tablename__ = "supplier"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier: Mapped[str] = mapped_column(String(100),nullable=False)

    fabrics: Mapped[List["Fabric"]] = relationship(back_populates="supplier")


#Sheer,Blackout
class FabricClassification(db.Model):
    __tablename__ = "fabric_classification"

    id: Mapped[int] = mapped_column(primary_key=True)
    classification: Mapped[str] = mapped_column(String(100),nullable=False)

    fabrics: Mapped[List["Fabric"]] = relationship(back_populates="classification")


class Tube(db.Model):
    __tablename__ = "tube"

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[Optional[int]] = mapped_column( # It must be nullable because at first we wont know for sure where it coudl be
        ForeignKey("location.id"), nullable=True
    )
# Historical hints from Excel (keeps messy data out of the Location table)
    legacy_location_1: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    legacy_location_2: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


    # Relationships
    location: Mapped[Location] = relationship(back_populates="tubes")
    fabrics: Mapped[List["Fabric"]] = relationship(back_populates="tube")

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
class TubeRectified(db.Model): #Tube verified means thats its measurements have been rectified, only holds the ids of tubes that have been verified
    __tablename__ = "tube_verified"

    id: Mapped[int] = mapped_column(primary_key=True)
    tube_id: Mapped[int] = mapped_column(
        ForeignKey("tube.id"), nullable=False,unique=True
    )
    tube: Mapped[Tube] = relationship(back_populates="tube")



class Fabric(db.Model):
    __tablename__ = "fabric"

    id: Mapped[int] = mapped_column(primary_key=True)
    tube_id: Mapped[int] = mapped_column(ForeignKey("tube.id"))
    blind_model_id: Mapped[int] = mapped_column(ForeignKey("blind_model.id"))
    color_id: Mapped[int] = mapped_column(ForeignKey("color.id"))
    classification_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("fabric_classification.id"), nullable=True
    )
    supplier_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("supplier.id"), nullable=True
    )

    original_width:Mapped[float] = mapped_column(nullable=False)
    original_height:Mapped[float] = mapped_column(nullable=False)
    current_height: Mapped[float] = mapped_column(Float, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    tube: Mapped["Tube"] = relationship(back_populates="fabric")
    blind_model: Mapped["BlindModel"] = relationship(back_populates="fabric")
    color: Mapped["Color"] = relationship(back_populates="fabric")
    classification: Mapped[Optional["FabricClassification"]] = relationship(
        back_populates="fabric"
    )
    supplier: Mapped[Optional["Supplier"]] = relationship(back_populates="fabric")

    deductions: Mapped[List["FabricDeduction"]] = relationship(
        back_populates="fabric", cascade="all, delete-orphan"
    )

class FabricComment(db.Model):
    __tablename__ = 'fabric_comment'
    id: Mapped[int] = mapped_column(primary_key=True)

    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    creation_date: Mapped[date] = mapped_column(Date,nullable=False)
    last_update: Mapped[date] = mapped_column(Date,nullable=False)
    fabric_id: Mapped[int] = mapped_column(ForeignKey("fabric.id"),nullable=False)

    fabric : Mapped[Fabric] = relationship(back_populates="fabric_comment")
    


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
class FabricDeduction(db.Model):
    __tablename__ = "fabric_deduction"

    id: Mapped[int] = mapped_column(primary_key=True)

    fabric_id: Mapped[int] = mapped_column(ForeignKey("fabric.id"))

# Stores the actual delta (amount cut off)
    removed_height: Mapped[float] = mapped_column(Float, nullable=False)
    # Optional: kept if trimming width ever occurs; defaults to 0
    removed_width: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    creation_date: Mapped[date] = mapped_column(Date) #Inmutable
    last_update: Mapped[date] = mapped_column(Date) #Mutable
    

    # Relationships
    fabric: Mapped["Fabric"] = relationship(back_populates="measurement_histories")

class AuditLog(db.Model):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    action: Mapped[str] = mapped_column(String(50))       # 'CREATE', 'UPDATE', 'DELETE'
    target_table: Mapped[str] = mapped_column(String(50)) # 'location', 'tube', etc.
    target_id: Mapped[int] = mapped_column()              # ID of the row being altered
    user_info: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    changes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # Old vs New values





# engine = create_engine(f"sqlite:///{config.DATABASE_PATH}")
# Base.metadata.create_all(engine)




