from interop_metadata_applications.pointlistdemo import Ontology, TemplateBuilder, ShapeBuilder, ParserBuilder
import interop_metadata_applications.demo
import shutil
import os
import io
import json
import rdflib
import pathlib
from buildingmotif.namespaces import BRICK
from buildingmotif import BuildingMOTIF
from buildingmotif.dataclasses import Library
from buildingmotif import get_building_motif
import sys
from csv import DictReader
import logging
import flask
from flask import Blueprint, current_app, jsonify, request
from flask_api import status

logger = logging.getLogger(__name__)
blueprint = Blueprint("pointlist-to-template", __name__)

MAPPINGS_FILE = "mappings.json"
def _get_mappings():
    if not os.path.exists(MAPPINGS_FILE):
        return []
    with open(MAPPINGS_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

ontology_location = "https://brickschema.org/schema/1.4/Brick.ttl"
ontology = Ontology(ontology_location)

@blueprint.route("", methods=(["POST"]))
def make_library() -> flask.Response:
    # get pointlist CSV file from the 'files' form field
    pointlist = request.files.get("file")
    if not pointlist:
        return "No file provided", status.HTTP_400_BAD_REQUEST
    bm = get_building_motif()
    template_name = request.form.get("template_name") or "template"
    library_name = request.form.get("library_name") or "library"
    target_class = request.form.get("target_class") or "Air_Handling_Unit"
    overwrite = request.form.get("overwrite") == "true"

    # NOTE: the file needs 'point' and 'description' columns
    reader = DictReader(io.StringIO(pointlist.read().decode("utf-8")))
    logger.info(f"Read pointlist from {pointlist.filename}")
    point_classes = []
    for row in reader:
        point_classes.append({"point": row["point"], "description": row["description"]})

    all_mappings = _get_mappings()
    b = TemplateBuilder(BRICK[target_class])
    b.add_mappings(point_classes, all_mappings)
    logger.info(f"Added mappings for {len(point_classes)} points to the template using stored mappings")

    # determine if the ssession is 'dirty' in some way
    if bm.session.dirty or bm.session.new or bm.session.deleted:
        logger.warning(f"Session is dirty, rolling back {bm.session.dirty=} {bm.session.new=} {bm.session.deleted=}")
        bm.session.rollback()
    bm.session.flush()
    
    libdir = pathlib.Path(library_name)

    # if the overwrite flag is set, remove the existing library directory
    logger.info(f"overwrite? {overwrite=} {os.path.isdir(libdir)=}")
    if overwrite and os.path.isdir(libdir):
        logger.info(f"Overwriting existing library {library_name}")
        shutil.rmtree(libdir)

    # create the library directory if it doesn't exist
    os.makedirs(libdir, exist_ok=True)
    template_path = pathlib.Path(libdir) / f"{template_name}.yml"
    with open(template_path, "w") as f:
        f.write(b.to_yaml_string(template_name))
    logger.info(f"Saved template to {template_path}\n{b.to_yaml_string(template_name)}")

    # if there is already a .ttl file in the library directory, load it.
    # Otherwise, create a new .ttl file with a <library_name a owl:Ontology> triple
    if not os.path.exists(libdir / f"{library_name}.ttl"):
        logger.info(f"Created new library {library_name}")
        g = rdflib.Graph()
        g.bind("owl", rdflib.OWL)
        g.bind("rdf", rdflib.RDF)
        g.bind("rdfs", rdflib.RDFS)
        g.bind("brick", BRICK)
        g.add((rdflib.URIRef(f"urn:{library_name}"), rdflib.RDF.type, rdflib.OWL.Ontology))
    else:
        logger.info(f"Loaded existing library {library_name}")
        g = rdflib.Graph().parse(str(libdir / f"{library_name}.ttl"), format="turtle")

    sb = ShapeBuilder(BRICK[target_class]) 
    sb.add_mappings(point_classes, all_mappings)
    g += sb.body

# for O27
#    body = """
#@prefix brick: <https://brickschema.org/schema/Brick#> .
#@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
#@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
#@prefix owl: <http://www.w3.org/2002/07/owl#> .
#@prefix sh: <http://www.w3.org/ns/shacl#> .
#@prefix : <urn:library/> .
#
#:vav a sh:NodeShape ;
#    sh:targetClass brick:Variable_Air_Volume_Box ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Discharge_Air_Temperature_Sensor ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "DA-T" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Supply_Air_Temperature_Sensor ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "AirSourceSA-T" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Air_Flow_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "FLOW-STPT" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Air_Flow_Sensor ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "FLOW" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Damper_Position_Command ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "DMPR-POS" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Fan_Command ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "FAN" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Runtime_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "RunHours" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Occupancy_Status ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "OCC-STAT" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Run_Enable_Command ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "RUN" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Unoccupied_Heating_Zone_Air_Temperature_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "ZN-STPT-HT-UNOC" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Unoccupied_Cooling_Zone_Air_Temperature_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "ZN-STPT-CL-UNOC" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Occupied_Heating_Zone_Air_Temperature_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "ZN-STPT-HT-OCC" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Occupied_Cooling_Zone_Air_Temperature_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "ZN-STPT-CL-OCC" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Effective_Heating_Zone_Air_Temperature_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "ZN-STPT-HT-EFF" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Effective_Cooling_Zone_Air_Temperature_Setpoint ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "ZN-STPT-CL-EFF" ;
#    ] ;
#    sh:property [
#        sh:path brick:hasPoint ;
#        sh:qualifiedValueShape [
#            sh:class brick:Zone_Air_Temperature_Sensor ;
#        ] ;
#        sh:qualifiedMinCount 1 ;
#        sh:name "ZN_T" ;
#    ] ;
#.
#    """
#     body = """
# @prefix brick: <https://brickschema.org/schema/Brick#> .
# @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
# @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
# @prefix owl: <http://www.w3.org/2002/07/owl#> .
# @prefix sh: <http://www.w3.org/ns/shacl#> .
# @prefix : <urn:library/> .
# 
# :vav a sh:NodeShape ;
#     sh:targetClass brick:Variable_Air_Volume_Box ;
# # DA-T,Discharge Air Temp Sensor
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Discharge_Air_Temperature_Sensor ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "DA-T" ;
#     ] ;
# # HW-VLV,Reheat Valve Command
#     sh:property [
#         sh:path brick:hasPart ;
#         sh:qualifiedValueShape [
#             sh:class brick:Hot_Water_Valve ;
#             sh:property [
#                 sh:path brick:hasPoint ;
#                 sh:qualifiedValueShape [
#                     sh:class brick:Valve_Position_Command ;
#                 ] ;
#                 sh:qualifiedMinCount 1 ;
#             ] ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "HW-VLV" ;
#     ] ;
# # OCC-CMD,Occupancy Command
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Occupancy_Command ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "OCC-CMD" ;
#     ] ;
# # ZN-T,Zone Temperature Sensor
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Zone_Air_Temperature_Sensor ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "ZN-T" ;
#     ] ;
# # ZN-H,Zone Humidity Sensor
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Zone_Air_Humidity_Sensor ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "ZN-H" ;
#     ] ;
# # OCC-CLG-SP,Occupied Air Temp Cooling Setpoint
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Occupied_Cooling_Air_Temperature_Setpoint ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "OCC-CLG-SP" ;
#     ] ;
# # OCC-HTG-SP,Occupied Air Temp Heating Setpoint
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Occupied_Heating_Air_Temperature_Setpoint ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "OCC-HTG-SP" ;
#     ] ;
# # UNOCC-CLG-SP,Unoccupied Air Temp Cooling Setpoint
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Unoccupied_Cooling_Air_Temperature_Setpoint ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "UNOCC-CLG-SP" ;
#     ] ;
# # UNOCC-HTG-SP,Unoccupied Air Temp Heating Setpoint
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Unoccupied_Heating_Air_Temperature_Setpoint ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "UNOCC-HTG-SP" ;
#     ] ;
# # EFFCLG-SP,Effective Air Temp Cooling Setpoint
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Effective_Cooling_Zone_Air_Temperature_Setpoint ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "EFFCLG-SP" ;
#     ] ;
# # EFFHTG-SP,Effective Air Temp Heating Setpoint
#     sh:property [
#         sh:path brick:hasPoint ;
#         sh:qualifiedValueShape [
#             sh:class brick:Effective_Heating_Zone_Air_Temperature_Setpoint ;
#         ] ;
#         sh:qualifiedMinCount 1 ;
#         sh:name "EFFHTG-SP" ;
#     ] ;
# .
#     """
    #g.parse(data=body, format="turtle")
    g.serialize(str(libdir / f"{library_name}.ttl"), format="turtle")

    # load the library into the database, using the temporary directory
    try:
        Library.load(name="https://brickschema.org/schema/1.4/Brick")
        logger.info(f"Loaded Brick library")
        Library.load(directory=str(libdir), overwrite=True)
        logger.info(f"Loaded {library_name} library")
    except Exception as e:
        get_building_motif().session.rollback()
        return str(e), status.HTTP_500_INTERNAL_SERVER_ERROR

    bm.session.commit()
    return jsonify({'template': b.to_yaml_string(template_name)}), status.HTTP_200_OK
