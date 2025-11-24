import logging
import json
from rdflib import URIRef, RDF, OWL

import flask
from flask import Blueprint, jsonify, request
from flask_api import status


from buildingmotif import get_building_motif
from buildingmotif.dataclasses import Model, Library, ShapeCollection
from buildingmotif.exports.brick2af.validation import (
    apply_rules_to_model,
    get_model_diffs,
    get_report,
)
from buildingmotif.exports.brick2af.utils import generate_manifest
from buildingmotif.exports.brick2af.ttl_to_af import Translator
import importlib.resources as importlib_resources

logger = logging.getLogger(__name__)
blueprint = Blueprint("transform", __name__)


@blueprint.route("/manifest/rules", methods=(["POST"]))
def create_manifest() -> flask.Response:
    # get files
    rules_json = request.files.get("rulesJson")

    if not rules_json:
        return jsonify({"error": "No rules file provided"}), status.HTTP_400_BAD_REQUEST

    try:
        # Parse uploaded rules JSON into dict
        rules_json.stream.seek(0)
        rules_dict = json.load(rules_json)

        # Generate manifest graph using new API (returns rdflib.Graph)
        manifest_graph = generate_manifest(rules_dict)

        # Persist as a ShapeCollection
        bmotif = get_building_motif()
        manifest = ShapeCollection.create()
        manifest.add_graph(manifest_graph)
        bmotif.session.commit()

        return jsonify({"message": "Manifest created successfully"}), status.HTTP_200_OK
    except Exception as e:
        logger.exception("Failed to create manifest from rules")
        return jsonify(
            {"error": "Failed to create manifest from rules", "details": str(e)}
        ), status.HTTP_500_INTERNAL_SERVER_ERROR


@blueprint.route("", methods=(["POST"]))
def apply_rules() -> flask.Response:
    # get files
    # TODO: create manifest from rules file. Use the code from my original transform.py
    rules_json = request.files.get("rulesJson")
    modelID = int(request.form.get("modelID"))

    pre_compiled_model = Model.load(id=modelID)
    model = pre_compiled_model.compile()

    # parse rules JSON
    rules = json.load(rules_json)
    logger.info("Loaded rules JSON for apply_rules")

    # Apply rules and get diffset
    logger.info(f"Applying rules {rules} to model {model}")
    successful_rules = apply_rules_to_model(model, rules)
    logger.info("Successfully configured rules (bindings): %s", successful_rules)
    logger.info(f"Applied rules to model {model}. Grouping diffs")
    grouped_diffs, context = get_model_diffs(model)
    logger.info(f"REPORT {context.report.serialize()}")
    logger.info(f"Grouped diffs {grouped_diffs}")
    report = get_report(grouped_diffs, successful_rules)

    # Format results
    results = {
        "report": report,
        "results": [
            {
                "rule": rule,
                "focus_node": focus_node,
                "details": details,
                "success": True,
            }
            for rule, i in successful_rules.items()
            for focus_node, details in i.items()
        ]
        + [
            {
                "rule": rule,
                "focus_node": focus_node,
                "details": details,
                "success": False,
            }
            for rule, i in grouped_diffs.items()
            for focus_node, details in i.items()
        ],
    }

    return jsonify(results), status.HTTP_200_OK


@blueprint.route("/afxml", methods=(["POST"]))
def export_afx_xml() -> flask.Response:
    """
    Generate an AFXML export for the uploaded rules JSON and selected model.
    Returns the AFXML as an application/xml attachment without writing persistent files.
    """
    try:
        rules_file = request.files.get("rulesJson")
        model_id_raw = request.form.get("modelID")

        if not rules_file or not model_id_raw:
            return jsonify(
                {"error": "rulesJson file and modelID are required"}
            ), status.HTTP_400_BAD_REQUEST

        model_id = int(model_id_raw)

        # Load and compile model
        pre_compiled_model = Model.load(id=model_id)
        model = pre_compiled_model.compile()

        # Parse rules JSON
        try:
            rules = json.load(rules_file)
        except Exception as e:
            logger.exception("Failed to parse rules JSON for AFXML export")
            return jsonify(
                {"error": "Invalid rules JSON", "details": str(e)}
            ), status.HTTP_400_BAD_REQUEST

        # Gather PI AF config inputs from form
        pi_server = request.form.get("piServer") or request.form.get("server")
        pi_database = request.form.get("piDatabase") or request.form.get("database")
        pi_export_path = request.form.get("piExportPath")
        pi_import_path = request.form.get("piImportPath")

        if not pi_server or not pi_database:
            return jsonify(
                {"error": "piServer and piDatabase are required"}
            ), status.HTTP_400_BAD_REQUEST

        # Load default units mapping from the package's sample config
        try:
            with (
                importlib_resources.files("buildingmotif.exports.brick2af")
                .joinpath("pi_config.json")
                .open("r", encoding="utf-8") as f
            ):
                default_config = json.load(f)
        except Exception:
            default_config = {"units": {}}

        pi_config = {
            "server": pi_server,
            "database": pi_database,
            "units": default_config.get("units", {}),
        }
        if pi_export_path:
            pi_config["piexportpath"] = pi_export_path
        if pi_import_path:
            pi_config["piimportpath"] = pi_import_path

        # Determine valid rules (success cases) for the model
        successful_rules = apply_rules_to_model(model, rules)
        logger.info("Successfully configured rules (bindings): %s", successful_rules)
        valid_rules = successful_rules

        # Build AF XML using object-based API and dynamic PI config (no subprocess, no chdir)
        class _TranslatorWithConfig(Translator):
            def __init__(self, config: dict):
                self._dynamic_config = config
                super().__init__()

            def read_config_file(self):
                # Inject dynamic config and set expected attributes used by base Translator
                cfg = self._dynamic_config or {}
                self.config = cfg
                # Core PI AF connection attributes expected by ttl_to_af.Translator
                self.defaultserver = cfg.get(
                    "server", getattr(self, "defaultserver", None)
                )
                self.defaultdatabase = cfg.get(
                    "database", getattr(self, "defaultdatabase", None)
                )
                if self.defaultserver and self.defaultdatabase:
                    # UNC-style default URI: \\SERVER\DATABASE
                    self.defaulturi = (
                        f"\\\\{self.defaultserver}\\{self.defaultdatabase}"
                    )
                # Optional paths and units mapping
                self.piimportpath = cfg.get(
                    "piimportpath", getattr(self, "piimportpath", None)
                )
                self.piexportpath = cfg.get(
                    "piexportpath", getattr(self, "piexportpath", None)
                )
                self.units = cfg.get("units", getattr(self, "units", {}))

        translator = _TranslatorWithConfig(pi_config)
        translator.add_rules_from_dict(rules, valid_rules)
        af_obj = translator.create_af_tree_from_model(model)
        xml_bytes = str(af_obj).encode("utf-8")

        resp = flask.Response(
            response=xml_bytes, content_type="application/xml; charset=utf-8"
        )
        resp.headers["Content-Disposition"] = 'attachment; filename="rules.afxml"'
        resp.headers["Access-Control-Expose-Headers"] = "Content-Disposition"
        return resp, status.HTTP_200_OK

    except Exception as e:
        logger.exception("Failed to generate AFXML export")
        return jsonify(
            {"error": "Failed to generate AFXML export", "details": str(e)}
        ), status.HTTP_500_INTERNAL_SERVER_ERROR


@blueprint.route("/libraries/from_rules", methods=(["POST"]))
def create_library_from_rules() -> flask.Response:
    """
    Accepts a rules JSON file, converts it into SHACL shapes, stores the shapes
    as a ShapeCollection, creates a Library referencing that collection, and
    returns the created Library as JSON.
    Frontend usage: POST multipart/form-data with "file" (rules JSON) and optional "name".
    """
    # Accept both "file" (frontend) and "rulesJson" (legacy) keys
    rules_file = request.files.get("file") or request.files.get("rulesJson")
    # get the filename from the uploaded file or use a default name
    name = (
        rules_file.filename if rules_file and rules_file.filename else "rules_library"
    )

    if not rules_file:
        return jsonify({"error": "No rules file provided"}), status.HTTP_400_BAD_REQUEST

    try:
        # Parse uploaded rules JSON into dict
        rules_file.stream.seek(0)
        rules_dict = json.load(rules_file)

        # Generate SHACL shapes graph using new API (returns rdflib.Graph)
        manifest_graph = generate_manifest(rules_dict)

        bmotif = get_building_motif()

        # Persist shapes as a ShapeCollection and create a Library pointing to it
        # ensure 'name' is a valid URI starting with 'urn:'
        if not (
            name.startswith("urn:")
            or name.startswith("http://")
            or name.startswith("https://")
        ):
            name = f"urn:{name}"
        lib = Library.create(name=name)
        # add the 'ontology' declaration for the graph
        manifest_graph.add((URIRef(lib.name), RDF.type, OWL.Ontology))
        lib.get_shape_collection().add_graph(manifest_graph)

        bmotif.session.commit()

        # Return the name of the created library
        return jsonify({"library": name}), status.HTTP_201_CREATED
    except Exception as e:
        logger.exception("Failed to create library from rules")
        return jsonify(
            {"error": "Failed to create library from rules", "details": str(e)}
        ), status.HTTP_500_INTERNAL_SERVER_ERROR
