import os
import shutil
import logging
import traceback
import rdflib
from rdflib import URIRef
import ontoenv

from flask import Flask, current_app
from flask_cors import CORS
from flask_api import status
from sqlalchemy.exc import SQLAlchemyError
from buildingmotif.dataclasses import Library

from buildingmotif.api.views.library import blueprint as library_blueprint
from buildingmotif.api.views.model import blueprint as model_blueprint
from buildingmotif.api.views.template import blueprint as template_blueprint
from buildingmotif.api.views.graph import blueprint as graph_blueprint
from buildingmotif.building_motif.building_motif import BuildingMOTIF

from interop_metadata_applications.api.views.parser import blueprint as parsers_blueprint
from interop_metadata_applications.api.views.home import blueprint as home_blueprint
from interop_metadata_applications.api.views.transform import blueprint as transform_blueprint
from interop_metadata_applications.api.views.naming import blueprint as naming_blueprint
from interop_metadata_applications.api.views.pointlist_to_template import blueprint as pointlist_to_template_blueprint
from interop_metadata_applications.api.views.model_generation import blueprint as model_generation_blueprint
from interop_metadata_applications.api.views.manifest_generation import blueprint as manifest_generation_blueprint
from interop_metadata_applications.api.views.mappings import blueprint as mappings_blueprint
from buildingmotif.building_motif.building_motif import BuildingMOTIF


def _after_request(response):
    """Commit or rollback the session.

    :param response: response
    :type response: Flask.response
    :return: response
    :rtype: Flask.response
    """
    try:
        current_app.building_motif.session.commit()
    except SQLAlchemyError:
        current_app.building_motif.session.rollback()

    current_app.building_motif.Session.remove()

    return response


def _after_error(error):
    """Returns request with a 500 and the error message.

    :param error: python error
    :type error: Error
    :return: flask error response
    :rtype: Flask.response
    """
    # Log full traceback to server logs
    current_app.logger.exception("Unhandled exception")
    tb = "".join(traceback.format_exception(type(error), error, error.__traceback__))
    return tb, status.HTTP_500_INTERNAL_SERVER_ERROR


def create_app():
    """Creates a Flask API.

    :return: flask app
    :rtype: Flask.app
    """
    app = Flask(__name__, instance_relative_config=True)
    CORS(app, origins=["http://localhost:4200", "http://localhost", "http://127.0.0.1:4200", "http://127.0.0.1"], supports_credentials=True)
    # Enable debug settings based on environment variable in create_app
    app.config['DEBUG'] = os.getenv('FLASK_DEBUG') == '1'
    app.config['PROPAGATE_EXCEPTIONS'] = False
    if app.config['DEBUG']:
        app.logger.setLevel(logging.DEBUG)

    # we need to do this setup inside the app_context or it will set up 2 different building_motif instances
    with app.app_context():
        app.building_motif = BuildingMOTIF("sqlite:///db.db", shacl_engine="topquadrant", log_level=logging.INFO)
        app.building_motif.setup_tables()
        # set up libraries
        brick = Library.load(ontology_graph="https://brickschema.org/schema/1.4.4/Brick.ttl", run_shacl_inference=False, overwrite=False)
        if os.path.exists(".ontoenv"):
            shutil.rmtree(".ontoenv")
        env = ontoenv.OntoEnv(strict=False, temporary=True)
        env.add("https://brickschema.org/schema/1.4.4/Brick.ttl")
        for uri in env.list_closure(URIRef("https://brickschema.org/schema/1.4/Brick")):
            if uri.startswith("<") and uri.endswith(">"):
                uri = uri[1:-1]
            # skip brick
            if uri == "https://brickschema.org/schema/1.4/Brick":
                continue
            logging.info(f"Loading {uri}")
            try:
                Library.load(ontology_graph=uri, run_shacl_inference=False, infer_templates=False, overwrite=False)
            except rdflib.exceptions.ParserError:
                logging.error(f"Failed to load {uri}. Skipping (this is probably fine)")
        Library.load(ontology_graph="constraints/constraints.ttl", run_shacl_inference=False, infer_templates=False, overwrite=False)
        #Library.load(directory="asbuilt-lib", run_shacl_inference=False, infer_templates=False, overwrite=False)
        app.building_motif.session.commit()

    app.after_request(_after_request)
    app.register_error_handler(Exception, _after_error)

    app.register_blueprint(home_blueprint, url_prefix="/")
    app.register_blueprint(transform_blueprint, url_prefix="/transform")
    app.register_blueprint(naming_blueprint, url_prefix="/naming")
    app.register_blueprint(pointlist_to_template_blueprint, url_prefix="/pointlist-to-template")
    app.register_blueprint(model_generation_blueprint, url_prefix="/model-generation")
    app.register_blueprint(manifest_generation_blueprint, url_prefix="/manifest-generation")

    # buildingmotif endpoints
    app.register_blueprint(library_blueprint, url_prefix="/libraries")
    app.register_blueprint(template_blueprint, url_prefix="/templates")
    app.register_blueprint(model_blueprint, url_prefix="/models")
    app.register_blueprint(parsers_blueprint, url_prefix="/parsers")
    app.register_blueprint(mappings_blueprint, url_prefix="/mappings")
    app.register_blueprint(graph_blueprint, url_prefix="/graph")

    return app


if __name__ == "__main__":
    """Run API."""
    app = create_app()
    app.run(debug=True, host="0.0.0.0", threaded=True, port=5000)
