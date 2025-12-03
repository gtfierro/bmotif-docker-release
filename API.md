# BuildingMOTIF ESTCP Web API

Base URL (default Docker compose): `http://localhost:5000`

Authentication: none. Most write endpoints expect `multipart/form-data`; read endpoints are JSON unless noted.

## Interop / Helper Endpoints (this repo)

### /transform/manifest/rules — POST
- Purpose: Convert a rules JSON upload into a SHACL manifest and store it as a `ShapeCollection`.
- Request (multipart/form-data):
  - `rulesJson` (file, required): rules JSON.
- Response: `{"message": "Manifest created successfully"}` on success.

### /transform — POST
- Purpose: Apply rules to a compiled model and return a detailed report.
- Request (multipart/form-data):
  - `rulesJson` (file, required): rules JSON.
  - `modelID` (form field, required, int): ID of an existing model to compile and validate.
- Response: JSON `{"report": <html_report>, "results": [{rule, focus_node, details, success}, ...]}`.

### /transform/afxml — POST
- Purpose: Export an AFXML file for PI AF from rules + model.
- Request (multipart/form-data):
  - `rulesJson` (file, required)
  - `modelID` (form field, required, int)
  - `piServer` or `server` (form field, required)
  - `piDatabase` or `database` (form field, required)
  - `piExportPath` (optional)
  - `piImportPath` (optional)
- Response: `application/xml` attachment `rules.afxml`.

### /transform/libraries/from_rules — POST
- Purpose: Turn a rules JSON file into SHACL shapes, create a `ShapeCollection`, wrap it in a Library, and return its name.
- Request (multipart/form-data):
  - `file` or `rulesJson` (file, required)
  - `name` (optional; default derived from filename or `"rules_library"`)
- Response: `{"library": "<library_urn_or_name>"}`; 201 Created on success.

### /naming — POST
- Purpose: Run the built-in O27 point label parser against a CSV of labels.
- Request (multipart/form-data):
  - `files[]` (2 files expected): first = CSV of point labels, second = parser JSON (currently ignored; O27 parser is used).
- Response: `{"parsed": [...], "failed": [{"unparsed_suffix", "labels"}...]}`.

### /pointlist-to-template — POST
- Purpose: Convert a point schedule CSV into a BuildingMOTIF library + template.
- Request (multipart/form-data):
  - `file` (CSV, required) with columns `point,description`.
  - Optional fields: `template_name` (default `template`), `library_name` (default `library`), `target_class` (Brick class URI suffix, default `Air_Handling_Unit`), `overwrite` (`true` to replace existing library directory).
- Response: `{"template": "<template_yaml_string>"}`; also writes/loads the library server-side.

### /model-generation — POST
- Purpose: Generate a Brick model from a point list using a (possibly user-supplied) naming parser.
- Request (multipart/form-data):
  - `file` (CSV, required) of point labels.
  - `parser` (file, optional) containing JSON-encoded Python source that defines `my_parser`; mappings.json is injected for abbreviation lookups.
- Response: `{"model": "<turtle_graph>", "errors": {...}, "unmatched_suffixes": {...}}`.

### /manifest-generation — POST
- Purpose: Build a manifest from an equipment schedule and attach it to an existing model.
- Request (multipart/form-data):
  - `file` (CSV, required): equipment schedule.
  - `modelId` (form field, required)
  - `namespace` (form field, required): base namespace; `#` or `/` is appended if missing.
- Response: `{"modelID": "<id>", "manifest": "<ttl_string>"}`.

### /parsers — POST
- Purpose: Evaluate custom parsers against point labels.
- Request (application/json):
  - `parsers`: serialized parser definition (see frontend “Point Label Parser” page).
  - `point_labels`: array of strings.
- Response: array of parsed token results for each label.

### Mappings helper endpoints
- `POST /mappings/suggest/` — body `{"description": "..."}`; returns best-match Brick class suggestion.
- `GET /mappings/` — return the current mappings.json content.
- `POST /mappings/` — replace mappings with posted JSON array; returns 204.
- `POST /mappings/upload_csv` — multipart with `file` CSV (`abbreviation,description,brick_point_class,brick_equip_class,brick_location_class`); merges into mappings.json; returns 204.
- `GET /mappings/download_csv` — download current mappings as `text/csv`.

## BuildingMOTIF Core Endpoints (upstream blueprint)
These come from the `buildingmotif` package (`gtf-demo-branch`) and are exposed here with standard semantics. Shapes, templates, and models are all persisted in the same SQLite DB (`db.db`). Headers are JSON unless stated.

### Libraries
- `GET /libraries` — list libraries (`[{id, name, shape_collection_id, template_ids?}]`).
- `POST /libraries` — create a library from TTL; multipart fields `file` (TTL) and `name`; returns `{id, name}`.
- `GET /libraries/shapes` — grouped shapes across libraries keyed by definition type.
- `GET /libraries/{id}` — library details; `expand_templates=True` to inline templates.
- `GET /libraries/{id}/classes` — Brick classes in the library; optional `subclasses_of` query param.
- `GET /libraries/{id}/shape_collection/shapes` — shapes (URI + label) for the library’s shape collection.
- `GET /libraries/{id}/shape_collection/ontology_name` — returns `{ontology_name}`; use with `/graph/{ontology_name}` to fetch TTL.

### Templates
- `GET /templates` — list templates.
- `GET /templates/{id}` — template metadata; `parameters=true|false` to include optional args.
- `GET /templates/{id}/body` — template body as text/Turtle; `inline=true` inlines dependencies.
- `POST /templates/{id}/evaluate/bindings` — JSON `{model_id, bindings:{var:{\"@id\": uri}}}` → Turtle graph of instantiated template.
- `POST /templates/{id}/evaluate/ingress?model_id={modelId}` — body: file/TTL ingress payload → Turtle graph of instantiation.

### Models
- `GET /models` — list models.
- `POST /models` — create model; JSON `{"name": "...", "description": "..."}`.
- `GET /models/{id}` — model metadata.
- Graph IO:
  - `GET /models/{id}/graph` — Turtle.
  - `PUT /models/{id}/graph` — replace graph; body `text/turtle` or XML; returns Turtle.
  - `PATCH /models/{id}/graph` — merge graph from uploaded file (multipart `file`).
- Manifest:
  - `GET /models/{id}/manifest` — returns TTL or JSON `{body, library_uris?}`.
  - `POST /models/{id}/manifest` — either JSON `{library_ids:[...]}` to rebuild manifest or raw TTL to overwrite; returns TTL.
  - `GET /models/{id}/manifest/imports` — `{library_ids:[...]}` list of manifest imports.
- Validation:
  - `POST /models/{id}/validate` — JSON `{library_ids?:[...]}`; query `min_iterations`, `max_iterations`, `include_templates`; returns `{"valid": bool, "message", "reasons": {...}, "templates": [...]}`.
  - `POST /models/{id}/validate_shape` — JSON `{shape_collection_ids, shape_uris, target_class}`; returns `{shape_uri: [reason...]}`.
- `GET /models/{id}/target_nodes` — list of target nodes for template evaluation.

### Graph
- `GET /graph/{ontology_name}` — return a stored graph (shape collection or library) as `text/turtle` when available. Use `Accept: text/turtle`.

## Notes
- SQLite file lives at `db.db` in the API working directory.
- CORS is enabled for `http://localhost:4200` (Angular UI).
- The API commits a DB transaction after each request; server rolls back on exceptions.
