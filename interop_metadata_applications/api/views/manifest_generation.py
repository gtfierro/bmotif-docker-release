import flask
from flask import Blueprint, jsonify, request
from flask_api import status
import csv
from io import StringIO
from rdflib import Namespace, URIRef
from interop_metadata_applications.pointlistdemo import ManifestBuilder, Ontology
from buildingmotif.dataclasses import Model, ShapeCollection
from buildingmotif import get_building_motif

blueprint = Blueprint("manifest-generation", __name__)

@blueprint.route("", methods=(["POST"]))
def generate_manifest() -> flask.Response:
    equipment_schedule_file = request.files.get("file")
    model_id = request.form.get("modelId")
    namespace = request.form.get("namespace")

    if not equipment_schedule_file or not model_id or not namespace:
        return "Missing equipment schedule file or model ID or namespace", status.HTTP_400_BAD_REQUEST

    ontology_location = "https://brickschema.org/schema/1.4/Brick.ttl"
    brick = Ontology(ontology_location)
    equipment_schedule = csv.DictReader(StringIO(equipment_schedule_file.read().decode("utf-8")))

    # get the class for each equipment in the schedule
    manifest_builder = ManifestBuilder(brick, equipment_schedule)
    # if namesapce does not end iwth a # or /, add a #
    if not namespace.endswith("#") and not namespace.endswith("/"):
        namespace += "#"
    NS = Namespace(namespace)
    manifest = manifest_builder.build(NS)
    # put the manifest in a new ShapeCollection
    sc = ShapeCollection.create()
    sc.add_graph(manifest)

    # add the manifest to the model
    model = Model.load(model_id)
    model.update_manifest(sc)
    get_building_motif().session.commit()

    return jsonify({"modelID": model_id, "manifest": manifest.serialize(format="ttl")}), status.HTTP_200_OK
