import logging
import os
from pathlib import Path

import inventario_persianas.constants as const
from flask import Flask, render_template
from inventario_persianas.model import db
from inventario_persianas.routes.catalog import catalago_bp
from inventario_persianas.routes.core import core_bp

static_folder = Path(os.getcwd()).parent / "UI" / "static"
template = Path(os.getcwd()).parent / "UI" / "static" / "html"

app = Flask(
    __name__,
    static_folder=static_folder,
    template_folder=template,
    static_url_path="/static",
)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + str(const.DATABASE_PATH)
db.init_app(app)
with app.app_context():
    db.create_all()


logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger()
log.info(f"Database:\n{const.DATABASE_PATH}")


app.register_blueprint(catalago_bp, url_prefix="/catalago")
app.register_blueprint(core_bp, url_prefix="/core")


@app.get("/")
def initial():
    return render_template("index.html")


from flask import send_from_directory

from werkzeug.exceptions import NotFound


@app.get("/images/<filename>")
def serve_location_image(filename):
    try:
        # Serves files directly from your LOCATION_IMAGES directory
        log.debug(f"serving image  {const.LOCATION_IMAGES} {filename}")
        return send_from_directory(const.LOCATION_IMAGES, f"{filename}.webp")
    except NotFound:
        log.debug("sending default image")
        return send_from_directory(const.LOCATION_IMAGES, "default_image.webp")


if __name__ == "__main__":
    app.run("localhost", 9999, debug=True)
