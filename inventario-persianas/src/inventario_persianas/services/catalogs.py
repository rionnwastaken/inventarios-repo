from inventario_persianas.model import (
    Color,
)
from sqlalchemy import Delete
from sqlalchemy.orm import Session


def add_color(db: Session, color_name: str):
    color = Color(name=color_name)
    db.add(color)
    db.commit()


def delete_color(db: Session, id: int):
    db.execute(Delete(Color).where(Color.id == id))
    db.commit()
