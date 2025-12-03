# BuildingMOTIF Database Schema

The BuildingMOTIF server stores a small amount of relational metadata alongside the RDF graphs that hold templates and models. The ORM is defined in `buildingmotif/database/tables.py` using SQLAlchemy. By default it targets SQLite (with `PRAGMA foreign_keys = ON`), but it also works with PostgreSQL; JSON columns become JSONB on Postgres via the custom `JSONType`.

## Tables

- **shape_collection**
  - `id` integer, primary key.
  - `graph_id` string UUID of the RDF graph that contains SHACL shapes.
  - Referenced by `library.shape_collection_id` and `models.manifest_id`; deleting a shape collection cascades to those rows.

- **models**
  - `id` integer, primary key.
  - `name` string (nullable).
  - `description` text, defaults to empty string, non-null.
  - `graph_id` string UUID of the RDF graph that stores the model instance data.
  - `manifest_id` integer, foreign key to `shape_collection.id` with `ON DELETE CASCADE`.
  - Relationship: `manifest` → the associated `DBShapeCollection`.

- **library**
  - `id` integer, primary key.
  - `name` string, unique and non-null.
  - `shape_collection_id` integer, foreign key to `shape_collection.id` with `ON DELETE CASCADE`.
  - Relationship: `templates` → child `template` rows (cascade delete); each library has its own SHACL graph via `shape_collection`.

- **template**
  - `id` integer, primary key.
  - `name` string, non-null.
  - `body_id` string UUID pointing to the RDF graph that holds the compiled template body.
  - `optional_args` JSON (`JSONB` on Postgres) storing a list of optional parameter names.
  - `library_id` integer, foreign key to `library.id` with `ON DELETE CASCADE`.
  - Unique constraint on (`name`, `library_id`) to scope names to a library.
  - Relationships: belongs to a `library`; has many `template_dependency` rows.

- **template_dependency**
  - `id` integer, primary key.
  - `template_id` integer, foreign key to `template.id` with `ON DELETE CASCADE` (the dependent template).
  - `dependency_library_name` string name of the library containing the dependency.
  - `dependency_template_name` string name of the dependency template.
  - `args` JSON mapping dependency parameter names → dependent parameter names. Uses the custom serializer to enforce deterministic ordering for uniqueness.
  - Unique constraint on (`template_id`, `dependency_library_name`, `dependency_template_name`, `args`) to prevent duplicate edges.
  - Convenience hybrid property `dependency_template` resolves the referenced template by name and library.

## Type Helpers and Constraints

- **JSONType** (`buildingmotif/database/utils.py`) selects JSONB on PostgreSQL and JSON elsewhere. A custom serializer sorts dictionary items so that JSON values can participate in unique constraints (used for `template_dependency.args`). Empty dicts are coerced to `{None: None}` so the database never stores an empty JSON object that would bypass the uniqueness guarantee.
- SQLite foreign keys are enabled at connection time with an event listener (`set_sqlite_pragma`), ensuring `ON DELETE CASCADE` works during development.

## Migration Note

Alembic’s initial migration (`migrations/versions/6114d2b80bc6_init.py`) captures the original schema. The current ORM renamed `deps_association_table` to `template_dependency` and replaced direct FK references to dependency templates with name + library fields. If you rely on Alembic, generate a new migration to align an existing database with the current models before upgrading.
