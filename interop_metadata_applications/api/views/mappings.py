import json
import os
import csv
import io
from flask import Blueprint, request, jsonify, send_file
from flask_api import status

from interop_metadata_applications.pointlistdemo import Ontology

blueprint = Blueprint("mappings", __name__)
MAPPINGS_FILE = "mappings.json"

def _get_mappings():
    if not os.path.exists(MAPPINGS_FILE):
        return []
    with open(MAPPINGS_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def _save_mappings(mappings):
    with open(MAPPINGS_FILE, "w") as f:
        json.dump(mappings, f, indent=2)

ontology = Ontology("https://brickschema.org/schema/1.4/Brick.ttl")

@blueprint.route("/suggest/", methods=["POST"])
def suggest_class():
    """Suggest a brick class for a given description."""
    data = request.get_json()
    description = data.get("description")
    if not description:
        return "No description provided", status.HTTP_400_BAD_REQUEST

    match = ontology.try_align_record({"description": description})
    return jsonify(match or {})

@blueprint.route("/", methods=["GET"])
def get_mappings():
    """Get all mappings."""
    return jsonify(_get_mappings())

@blueprint.route("/", methods=["POST"])
def save_mappings_endpoint():
    """Save all mappings."""
    mappings = request.get_json()
    _save_mappings(mappings)
    return "", status.HTTP_204_NO_CONTENT

@blueprint.route("/upload_csv", methods=["POST"])
def upload_csv():
    """Upload a CSV file to add/update mappings."""
    if 'file' not in request.files:
        return "No file part", status.HTTP_400_BAD_REQUEST

    file = request.files['file']
    if file.filename == '':
        return "No selected file", status.HTTP_400_BAD_REQUEST

    if file:
        mappings = _get_mappings()
        mappings_by_abbr = {m['abbreviation']: m for m in mappings}

        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_input = csv.DictReader(stream)

        for row in csv_input:
            abbreviation = row.get('abbreviation')
            if not abbreviation or not row.get('description'):
                continue

            mapping = mappings_by_abbr.get(abbreviation, {'abbreviation': abbreviation})

            mapping['description'] = row.get('description', mapping.get('description'))
            mapping['brick_point_class'] = row.get('brick_point_class', mapping.get('brick_point_class'))
            mapping['brick_equip_class'] = row.get('brick_equip_class', mapping.get('brick_equip_class'))
            mapping['brick_location_class'] = row.get('brick_location_class', mapping.get('brick_location_class'))

            mappings_by_abbr[abbreviation] = mapping

        _save_mappings(list(mappings_by_abbr.values()))
        return "", status.HTTP_204_NO_CONTENT

    return "Error processing file", status.HTTP_500_INTERNAL_SERVER_ERROR


@blueprint.route("/download_csv", methods=["GET"])
def download_csv():
    """Download mappings as a CSV file."""
    mappings = _get_mappings()

    output = io.StringIO()
    fieldnames = [
        "abbreviation",
        "description",
        "brick_point_class",
        "brick_equip_class",
        "brick_location_class",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)

    writer.writeheader()
    writer.writerows(mappings)

    # Create an in-memory binary stream for send_file.
    mem = io.BytesIO()
    mem.write(output.getvalue().encode("utf-8"))
    mem.seek(0)

    return send_file(
        mem, as_attachment=True, download_name="mappings.csv", mimetype="text/csv"
    )
