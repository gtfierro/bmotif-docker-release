from collections import defaultdict
from tqdm import tqdm
import logging
import json
from buildingmotif.namespaces import SH, BRICK, bind_prefixes
from buildingmotif.dataclasses import Library
from copy import deepcopy
import sys, os, json, re, uuid, random, string
from rdflib import RDFS, RDF, SH, BRICK, Namespace, Graph, Literal, BNode, URIRef
from interop_metadata_applications.bmotif_o27 import generate_markdown_report

logger = logging.getLogger(__name__)

BRICK = Namespace('https://brickschema.org/schema/Brick#')

# build relationship
RELATIONSHIPS = ["hasPoint", "hasPart", "isPointOf", "isPartOf", "feeds"]
RELATIONSHIPS += [f"{r}+" for r in RELATIONSHIPS]
RELATIONSHIPS += [f"{r}?" for r in RELATIONSHIPS]
RELATIONSHIPS += [f"{r}*" for r in RELATIONSHIPS]


original_shape_cache = {}

def find_original_shape(model, shape_uri: URIRef) -> URIRef:
    """
    From the given property or node shape URI, find *users* of the URI
    until we find the original shape. Users of the URI can be related to this
    URI through sh:property or sh:node.
    """
    if shape_uri in original_shape_cache:
        return original_shape_cache[shape_uri]
    graph = model.get_manifest().graph
    original_shape = shape_uri
    while True:
        query = f"""
            SELECT ?shape WHERE {{
                ?shape (sh:or|sh:and|sh:xone)?/sh:property|sh:node {original_shape.n3()} .
            }}
        """
        res = graph.query(query)
        if len(res) == 0:
            break
        original_shape = list(res)[0][0]
    original_shape_cache[shape_uri] = original_shape
    return original_shape


def _gensym():
    """generates random sparql variable name"""
    return 'var' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

def _sparql_recurse(defn, varname, hook=None):
    query = ""

    if isinstance(defn, str):
        if hook is not None and hook != varname:
            # then varname is hasPoint from hook
            query += f"?{hook} brick:hasPoint ?{varname} .\n"
        query += f"?{varname} rdf:type {BRICK[defn].n3()} .\n"
        return query
    
    for key, value in defn.items():
        if key == "choice":
            # UNION of the list of descriptions in 'value'
            query += "{\n"
            query += " UNION ".join([f"{{ {_sparql_recurse(v, varname, hook=hook)} }}\n" for v in value])
            query += "}\n"

        elif key in RELATIONSHIPS:
            # start with a random var
            subject_var = hook or _gensym()
            
            # get the relationship name
            suffix = key[-1] if key[-1] in ["+", "?", "*"] else ""
            relname = key.replace("+", "").replace("?", "").replace("*", "")
            # get the relationship type
            reltype = BRICK[relname]
            
            # the object of the relationship is one of two things:
            # - varname, if 'value' is a type
            # - a new variable, if 'value' is a dict
            if isinstance(value, str):
                object_var = varname
            else:
                object_var = _gensym()

            # add the relationship to the query
            query += f"?{subject_var} {reltype.n3()}{suffix} ?{object_var} .\n"
            # add the object to the query
            query += _sparql_recurse(value, varname, hook=object_var)

        else: # key represents a type
            subject_var = hook or _gensym()
            query += f"?{subject_var} rdf:type {BRICK[key].n3()} .\n"
            # value should be a dictionary
            query += _sparql_recurse(value, varname, hook=subject_var)

    return query

def _definition_to_sparql(classname, defn, variable):
    """
    defn is a JSON structure like this:
        "Chilled_Water_Valve_Command": {
            "choice": [
                {"hasPoint": "Chilled_Water_Valve_Command"},
                {"hasPart": {"Chilled_Water_Valve": {"hasPoint": "Valve_Command"}}}
            ]
        },
    This method turns this into a SPARQL query which retrieves values into a variable
    named whatever the top-level key is
    """
    query = f"""SELECT ?root ?{variable} WHERE {{ 
        ?root rdf:type {classname.n3()} .
        {_sparql_recurse(defn, variable, hook="root")} 
    }}"""
    return query

def apply_rules_to_model(model, rules):
    logger.info(f"Applying rules to model {model.graph}")
    successful_rules = defaultdict(lambda: defaultdict(dict))
    #graph = Graph(store="Oxigraph")
    #graph.parse(data=model.graph.serialize(format="ttl"), format="ttl")
    for rule, defn in tqdm(rules.items()):
        logger.info(f"WORKING ON RULE {rule}")
        rule = f"urn:rules_manifest/{rule}"
        for classname in defn["applicability"]:
            class_ = BRICK[classname]
            for variable, vardef in defn["definitions"].items():
                logger.info(f"variable {variable} has definition {vardef}")
                query = _definition_to_sparql(class_, defn["definitions"][variable], variable)
                logger.info(f"querying {query} for rule {rule} var {variable}")

                results = model.graph.query(query)
                for row in results.bindings:
                    logger.info(f"row {row}")
                    row = {str(k): v for k, v in row.items()}
                    inst = row['root']
                    successful_rules[rule][inst].update(row)

        # loop through all 'inst' for this rule. If the length of its dictionary == len(defn["definitions"]), then it's successful
        for inst in deepcopy(successful_rules[rule]):
            if len(successful_rules[rule][inst]) != len(defn["definitions"]) + 1: # +1 for the 'root' variable
                del successful_rules[rule][inst]

    return successful_rules


def get_model_diffs(model):
    validation_context = model.validate(error_on_missing_imports=False)
    model.graph.serialize('/tmp/model2.ttl', format='turtle')
    validation_context.report.serialize('/tmp/report.ttl', format='turtle')

    grouped_diffs = defaultdict(lambda: defaultdict(set))
    for focus_node, diffs in tqdm(validation_context.diffset.items()):
        logger.info(f"focus_node {focus_node} diffs {len(diffs)}")
        for diff in tqdm(diffs):
            original_shape = find_original_shape(model, diff.failed_shape)
            ## remove focus_node from the successful rules
            #if original_shape in successful_rules:
            #    if focus_node in successful_rules[original_shape]:
            #        del successful_rules[original_shape][focus_node]
            grouped_diffs[original_shape][focus_node].add(diff.reason())
        # set all the diffs to be a list
        for original_shape in grouped_diffs:
            for focus_node in grouped_diffs[original_shape]:
                grouped_diffs[original_shape][focus_node] = list(grouped_diffs[original_shape][focus_node])
    return grouped_diffs

def get_report(grouped_diffs: defaultdict, successful_rules: defaultdict):
    return generate_markdown_report(grouped_diffs, successful_rules, '')
