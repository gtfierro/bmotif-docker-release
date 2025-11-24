import flask
import traceback
import json
from collections import defaultdict
from flask_api import status
from rdflib import Namespace, Literal
from rdflib.namespace import RDF, OWL, RDFS, DCTERMS
from flask import Blueprint, current_app, jsonify, request
from interop_metadata_applications.api.views.mappings import _get_mappings
from interop_metadata_applications.demo.parse_pi_tags import O27_label_parser, b315_label_parser
from interop_metadata_applications.pointlistdemo import ParserBuilder, Ontology
from buildingmotif.ingresses import CSVIngress, NamingConventionIngress, SemanticGraphSynthesizerIngress
from buildingmotif.label_parsing.combinators import abbreviations
from buildingmotif.dataclasses import Library
from buildingmotif.namespaces import PARAM
import logging

logger = logging.getLogger(__name__)
blueprint = Blueprint("model-generation", __name__)

# TODO: do we create a new endpoint which retrieves a list of all templates? can we use the existing bmotif stuff?

@blueprint.route("", methods=(["POST"]))
def generate_model() -> flask.Response:
    pointlist = request.files.get("file")
    if not pointlist:
        return "No file provided", status.HTTP_400_BAD_REQUEST
    source = CSVIngress(data=pointlist.read().decode("utf-8"))
    logger.info(f"source: {source}")
    logger.info(f"parser: {request.files}")
    #label_parser = O27_label_parser # arbitrary default
    parser_source = request.files.get("parser")
    print(f"parser_source: {parser_source}")
    if parser_source:
        parser_source = json.loads(parser_source.read().decode("utf-8"))
        logging.info(f"{parser_source}")
        # exec the parser source code and get the 'my_parser' variable
        loc = {}
        # get mappings and make them available to the parser
        mappings_list = _get_mappings()
        mappings_dict = {
            m["abbreviation"]: m for m in mappings_list if m.get("abbreviation")
        }
        point_mappings = abbreviations({m["abbreviation"]: m["brick_point_class"] for m in mappings_list if m.get("abbreviation") and m.get("brick_point_class")})
        equipment_mappings = abbreviations({m["abbreviation"]: m["brick_equip_class"] for m in mappings_list if m.get("abbreviation") and m.get("brick_equip_class")})
        loc["mappings"] = mappings_dict
        loc["point_mappings"] = point_mappings
        loc["equipment_mappings"] = equipment_mappings
        logging.info(f"loc: {loc}")
        logging.info(f"point_mappings: {point_mappings}")
        logging.info(f"equipment_mappings: {equipment_mappings}")
        # exec the parser source code in a new local namespace
        exec(parser_source, globals(), loc)
        # get the parser from the local variables
        label_parser = loc["my_parser"]
        logging.info(f"now label_parser: {label_parser}")

    logging.info(f"label_parser: {label_parser}")
    #logging.warning(f"old parser results: {pi_tag_parser('AHU_1EEF')}")
    ing = NamingConventionIngress(source, label_parser)
    logger.info(f"ing: {ing}")
    brick = Library.load(name="https://brickschema.org/schema/1.4/Brick")
    logger.info(f"brick: {brick}")
    equipment_templates = Library.load(name="asbuilt-lib")
    logger.info(f"equipment_templates: {equipment_templates} with {equipment_templates.get_templates()}")
    try:
        logger.info(f"ing records: {ing.records}")
    except Exception as e:
        logger.error(traceback.format_exc())
        logger.error(f"Error: {e}")
    try:
        sgs = SemanticGraphSynthesizerIngress(ing, [equipment_templates], brick.get_shape_collection().graph)
    except Exception as e:
        logger.error(f"Error: {e}")
        logger.error(traceback.format_exc())
        return str(e), status.HTTP_500_INTERNAL_SERVER_ERROR
    BLDG = Namespace("http://example.org/building#")
    logger.info(f"sgs: {sgs.graph(BLDG).serialize()}")
    #model.add_graph(sgs.graph(BLDG))
    #print(model.graph.serialize()[:1000])
    logger.info(f"worked with templates {sgs.sgs.templates}")
    from buildingmotif.graph_generation.classes import TokenizedLabel
    logger.info(f"failures: {ing.failures}")
    logger.info(f"records: {sgs.upstream.records}")
    labels = [TokenizedLabel.from_dict(x.fields) for x in sgs.upstream.records]
    logger.info(f"labels: {labels}")

    graph = sgs.graph(BLDG)
    # remove all triples with the PARAM namespace
    for s, p, o in graph.triples((None, None, None)):
        if str(s).startswith(str(PARAM)):
            graph.remove((s, p, o))
        elif str(p).startswith(str(PARAM)):
            graph.remove((s, p, o))
        elif str(o).startswith(str(PARAM)):
            graph.remove((s, p, o))

    # Ensure the graph declares an owl:Ontology with optional label/description
    try:
        model_name = request.form.get("name")
        model_desc = request.form.get("description")
    except Exception:
        model_name = None
        model_desc = None

    if not any(graph.triples((None, RDF.type, OWL.Ontology))):
        ontology_subject = BLDG["ontology"]
        graph.add((ontology_subject, RDF.type, OWL.Ontology))
        if model_name:
            graph.add((ontology_subject, RDFS.label, Literal(model_name)))
        if model_desc:
            graph.add((ontology_subject, DCTERMS.description, Literal(model_desc)))

    # process naming convention failures. There are two kinds:
    # - the final token has an error. This is indicated by the .error attribute of the final token
    # - no token generated an error, but the whole label was not parsed. We determine this by adding the token lengths together
    #   and comparing to the length of the original label

    # group by error:
    errors = defaultdict(list)
    unmatched_suffixes = defaultdict(list)
    for failure, tokens in ing.failures.items():
        # if there is an error in the final token, we can use that
        error = tokens[-1].error if tokens[-1].error else None
        if error:
            errors[error].append(failure)
            continue
        # otherwise, we get the length of the tokens and compare to the length of the original label
        # the suffix is the part of the label that was not parsed.
        token_len = sum([len(t.value) for t in tokens if t.value is not None])
        suffix = failure[token_len:]
        unmatched_suffixes[suffix].append(failure)


    return jsonify({'model': graph.serialize(), 'errors': errors, 'unmatched_suffixes': unmatched_suffixes}), status.HTTP_200_OK

