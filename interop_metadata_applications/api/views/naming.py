import flask
import q
import json
from flask import Blueprint, current_app, jsonify, request
from flask_api import status
from flask import Blueprint, current_app, jsonify
from rdflib import URIRef
from sqlalchemy.orm.exc import NoResultFound
from interop_metadata_applications.demo.parse_pi_tags import O27_label_parser, b315_label_parser
from buildingmotif.ingresses import CSVIngress, NamingConventionIngress
from buildingmotif.label_parsing import analyze_failures
import logging


logger = logging.getLogger(__name__)
blueprint = Blueprint("naming", __name__)


def get_failed_labels(ing: NamingConventionIngress):
    sorted_groups = sorted(
        analyze_failures(ing.failures).items(),
        key=lambda x: len(x[1]),
        reverse=True,
    )
    return list(sorted_groups)

@blueprint.route("", methods=(["POST"]))
def test_naming_convention() -> flask.Response:
    point_labels_csv, parser_json = request.files.getlist("files[]")

    # TODO: looks like the (de)serialization of parsers is broken; we 
    # will eventually need to look into this. UNTIL THEN make sure you use
    # the interop_metadata_applications.demo.parse_pi_tags parser

    # parse the naming convention JSON file into the Parser
    #parser_dict = json.loads(parser_json.read())
    #q.q(parser_dict)
    #q.q(parser_dict.keys())
    #parser = deserialize(parser_dict)
    #q.q(f"Deserialized! {parser}")

    parser = O27_label_parser

    # apply the parser to the point labels
    source = CSVIngress(data=point_labels_csv.read().decode('utf-8'))
    ing = NamingConventionIngress(source, parser)
    parsed = [r.fields for r in ing.records]
    failed = [{'unparsed_suffix': r[0], 'labels': r[1]} for r in get_failed_labels(ing)]

    # make list of passing and failing points
    return jsonify({'parsed': parsed, 'failed': failed}), status.HTTP_200_OK
