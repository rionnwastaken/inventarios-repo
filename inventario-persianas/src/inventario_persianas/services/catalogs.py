import inventario_persianas.model as mod


from sqlalchemy.orm import Session
from sqlalchemy import Delete
from inventario_persianas.model import Color, Supplier, Location, BlindModel, FabricClassification



def add_color(db:Session,color_name:str):
    color = Color(name=color_name)
    db.add(color)
    db.commit()


def delete_color(db:Session,id:int):
    db.execute(Delete(Color).where(Color.id == id))
    db.commit()


