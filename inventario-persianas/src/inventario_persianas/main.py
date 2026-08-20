from flask import Flask, render_template
from pathlib import Path
from logging import getLogger
import os 
import inventario_persianas.model as mod
import inventario_persianas.services.catalogs as catalog
from sqlalchemy.orm import Session
from inventario_persianas.routes.catalog import catalago_bp
from inventario_persianas.routes.core import core_bp
import inventario_persianas.constants as const
from inventario_persianas.model import db
import logging


static_folder = Path(os.getcwd()).parent / "UI" / "static"
template = Path(os.getcwd()).parent / "UI" / "static" / "html"

app = Flask(__name__,static_folder=static_folder,template_folder=template,static_url_path="/static")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///"+ str(const.DATABASE_PATH)
db.init_app(app)
with app.app_context():
    db.create_all()


logging.basicConfig(level=logging.DEBUG)
log  = logging.getLogger()
log.info(f"Database:\n{const.DATABASE_PATH}")



app.register_blueprint(catalago_bp,url_prefix="/catalago")
app.register_blueprint(core_bp,url_prefix="/core")


@app.get("/")
def initial():
    return render_template("index.html")






print("hi")



if __name__ == "__main__":
    app.run("localhost",9999,debug=True)
