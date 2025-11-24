import json
from numba import jit
import os
import numpy as np
import pandas as pd
import polars as pl
import logging
import re
import yaml
from csv import DictReader
from collections import defaultdict
from typing import Optional, Union, List
import rdflib
from rdflib import URIRef
from buildingmotif.namespaces import PARAM, BRICK, RDF, SH, OWL
from tqdm import tqdm
from buildingmotif.label_parsing.parser import Parser
from buildingmotif.label_parsing.combinators import regex, until, many, maybe, sequence, rest
from rdflib import Namespace, URIRef
from buildingmotif.namespaces import BRICK
from buildingmotif.label_parsing.tokens import TokenResult, Identifier, Constant

from transformers import AutoModel, AutoTokenizer
import torch.nn.functional as F
import torch
print("Loading embedding model -- this may take a few minutes")
model_path = "Alibaba-NLP/gte-modernbert-base"
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModel.from_pretrained(model_path)
BATCH_SIZE = 20

# disable numba debugging messages
numba_logger = logging.getLogger('numba')
numba_logger.setLevel(logging.WARNING)

@jit
def fast_dot_product(query, matrix, k=3):
    dot_products = query @ matrix.T

    idx = np.argpartition(dot_products, -k)[-k:]
    idx = idx[np.argsort(dot_products[idx])[::-1]]

    score = dot_products[idx]

    return idx, score


def compute_embeddings(docs: list[str]) -> np.ndarray:

    dataset_embeddings = []
    tokenized_batch = tokenizer(
        docs, max_length=8192, padding=True, truncation=True, return_tensors="pt"
    )
    with torch.no_grad():
        outputs = model(**tokenized_batch)
        embeddings = outputs.last_hidden_state[:, 0].detach().cpu()
    dataset_embeddings.append(embeddings)
    dataset_embeddings = torch.cat(dataset_embeddings)
    dataset_embeddings = F.normalize(dataset_embeddings, p=2, dim=1)
    return dataset_embeddings.numpy()


logger = logging.getLogger(__name__)

CONSTRAINT = Namespace("https://nrel.gov/BuildingMOTIF/constraints#")

def str_presenter(dumper, data):
    """configures yaml for dumping multiline strings
    Ref: https://stackoverflow.com/questions/8640959/how-can-i-control-what-scalar-form-pyyaml-uses-for-my-data"""
    if data.count('\n') > 0:  # check for multiline string
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)

yaml.add_representer(str, str_presenter)
yaml.representer.SafeRepresenter.add_representer(str, str_presenter) # to use with safe_dum


class Ontology:
    def __init__(self, ontology_location: str) -> None:
        self.ontology_location = ontology_location
        logging.info(f"Loading ontology from {ontology_location}")
        self.graph = rdflib.Graph()
        self.graph.parse(ontology_location)

        if os.path.exists('point-embeddings.parquet'):
            point_embeddings_df = pl.read_parquet('point-embeddings.parquet')
            self.point_embeddings = point_embeddings_df['point_embeddings'].to_numpy()
            self.point_embeddings_df = pd.DataFrame({'embeddings': [self.point_embeddings[i, :] for i in range(self.point_embeddings.shape[0])]}, index=point_embeddings_df['point_ids'].to_numpy(), dtype=object)
        if os.path.exists('equip-embeddings.parquet'):
            equip_embeddings_df = pl.read_parquet('equip-embeddings.parquet')
            self.equip_embeddings = equip_embeddings_df['equip_embeddings'].to_numpy()
            self.equip_embeddings_df = pd.DataFrame({'embeddings': [self.equip_embeddings[i, :] for i in range(self.equip_embeddings.shape[0])]}, index=equip_embeddings_df['equip_ids'].to_numpy(), dtype=object)
        if not hasattr(self, 'point_embeddings_df') or not hasattr(self, 'equip_embeddings_df'):
            self.populate_embeddings()

    def populate_embeddings(self):
        logging.info(f"Populating embeddings for {self.ontology_location}")

        # build two lists: one of all the embeddings and one of all the ids (uris)
        point_embeddings = []
        point_ids = []
        equip_embeddings = []
        equip_ids = []

        query = """
        SELECT DISTINCT ?class ?label ?unit WHERE {
            ?class rdfs:subClassOf/rdfs:subClassOf+ brick:Point .
            OPTIONAL { ?class brick:hasQuantity/qudt:applicableUnit ?unit }
            ?class a sh:NodeShape, owl:Class .
            ?class rdfs:label ?label .
            FILTER(STRSTARTS(STR(?class), 'https://brickschema.org/schema/Brick#'))
        }
        """
        qres = self.graph.query(query)
        docs = [
            {
                "iri": row["class"],
                "label": row["label"],
                "type": "point",
                "unit": row.get("unit"),
            }
            for row in tqdm(qres.bindings)
        ]
        print(f"Embedding {len(docs)} points")
        for i in tqdm(range(0, len(docs), BATCH_SIZE)):
            batch = docs[i:i+BATCH_SIZE]
            point_embeddings.extend(compute_embeddings([json.dumps(d) for d in batch]))
            point_ids.extend([d["iri"] for d in batch])

        # now do equipment
        query = """
        SELECT DISTINCT ?class ?label WHERE {
            { ?class rdfs:subClassOf brick:Equipment }
            UNION
            { ?class rdfs:subClassOf/rdfs:subClassOf brick:Equipment }
            UNION
            { ?class rdfs:subClassOf/rdfs:subClassOf/rdfs:subClassOf brick:Equipment }

            ?class rdfs:label ?label .
            FILTER NOT EXISTS { ?class brick:aliasOf ?x }
            FILTER(STRSTARTS(STR(?class), 'https://brickschema.org/schema/Brick#'))
        }
        """
        qres = self.graph.query(query)
        docs = [
            {"iri": row["class"], "label": row["label"], "type": "equipment"}
            for row in tqdm(qres.bindings)
        ]
        print(f"Embedding {len(docs)} equipment")
        for i in tqdm(range(0, len(docs), BATCH_SIZE)):
            batch = docs[i:i+BATCH_SIZE]
            equip_embeddings.extend(compute_embeddings([json.dumps(d) for d in batch]))
            equip_ids.extend([d["iri"] for d in batch])

        equip_embeddings = np.vstack(equip_embeddings)
        point_embeddings = np.vstack(point_embeddings)
        self.point_embeddings_df = pd.DataFrame({'embeddings': [point_embeddings[i, :] for i in range(point_embeddings.shape[0])]}, index=point_ids, dtype=object)
        self.equip_embeddings_df = pd.DataFrame({'embeddings': [equip_embeddings[i, :] for i in range(equip_embeddings.shape[0])]}, index=equip_ids, dtype=object)
        self.point_embeddings = point_embeddings
        self.equip_embeddings = equip_embeddings

        df = pl.DataFrame(data={"point_embeddings": point_embeddings, "point_ids": point_ids})
        df.write_parquet("point-embeddings.parquet")

        df = pl.DataFrame(data={"equip_embeddings": equip_embeddings, "equip_ids": equip_ids})
        df.write_parquet("equip-embeddings.parquet")

    def get_point_matches(self, point: str) -> list[tuple[str, float]]:
        point_embedding = compute_embeddings([point])[0]
        idxs, scores = fast_dot_product(point_embedding, self.point_embeddings)
        return [(self.point_embeddings_df.index[i], score) for i, score in zip(idxs, scores)]

    def get_equip_matches(self, equip: str) -> list[tuple[str, float]]:
        equip_embedding = compute_embeddings([equip])[0]
        idxs, scores = fast_dot_product(equip_embedding, self.equip_embeddings)
        return [(self.equip_embeddings_df.index[i], score) for i, score in zip(idxs, scores)]


    def try_align_record(self, record: dict) -> Optional[dict[str, str]]:
        label = record["description"]
        labels: list[tuple[str, str]] = [(label, label)]
        # make every pair of words in the label, split by ' -:.'
        parts = re.split(r"[ -:.]", label)
        # if there are N parts, there are N-1 ways of dividing the string into two parts
        for i in range(1, len(parts)):
            p1 = " ".join(parts[:i])
            p2 = " ".join(parts[i:])
            labels.append((p1, p2))
        # now, 'labels' is a list of pairs of strings. We want to classify each pair
        # as (point, equip) or (equip, point) or (point, point). The get_point_matches
        # and get_equip_matches functions will return the best (match, score) for each
        # string in the pair.
        # We choose the pair with the highest score
        best_score = 0
        best_match = None

        scores = []
        for p1, p2 in labels:
            # (point, point)
            p1_point_matches = self.get_point_matches(p1)
            print(f"Point matches for {p1}: {p1_point_matches}")
            p2_point_matches = self.get_point_matches(p2)
            print(f"Point matches for {p2}: {p2_point_matches}")
            # get the best match for each part of the label
            if p1_point_matches and p2_point_matches:
                score = p1_point_matches[0][1] + p2_point_matches[0][1]
                scores.append((p1_point_matches[0][0], p2_point_matches[0][0], score))
                if score > best_score:
                    best_score = score
                    best_match = {"point": p1_point_matches[0][0]}
            # (point, equip)
            p2_equip_matches = self.get_equip_matches(p2)
            if p1_point_matches and p2_equip_matches:
                score = p1_point_matches[0][1] + p2_equip_matches[0][1]
                scores.append((p1_point_matches[0][0], p2_equip_matches[0][0], score))
                if score > best_score:
                    best_score = score
                    best_match = {
                        "point": p1_point_matches[0][0],
                        "equip": p2_equip_matches[0][0],
                    }
            # (equip, point)
            p1_equip_matches = self.get_equip_matches(p1)
            if p1_equip_matches and p2_point_matches:
                score = p1_equip_matches[0][1] + p2_point_matches[0][1]
                scores.append((p1_equip_matches[0][0], p2_point_matches[0][0], score))
                if score > best_score:
                    best_score = score
                    best_match = {
                        "point": p2_point_matches[0][0],
                        "equip": p1_equip_matches[0][0],
                    }
        return best_match

    def try_align_record_equip_only(self, record: dict) -> Optional[dict[str, str]]:
        label = record["description"]
        matches = self.get_equip_matches(label)
        if matches:
            return {"equip": matches[0][0]}
        return None

    def align_records(self, records: list[dict[str, str]]):
        results = {}
        for record in records:
            match = self.try_align_record(record)
            results[record["point"]] = match
        return results

    def align_records_equip_only(self, records: list[dict[str, str]]):
        results = {}
        for record in records:
            match = self.try_align_record_equip_only(record)
            results[record["equip"]] = match
        return results

    def close(self):
        self.client.close()


class ParserBuilder:
    def __init__(self):
        self.equipment = {
            'AHU': BRICK.Air_Handling_Unit,
            'BLDG': BRICK.Building,
            'ECON': BRICK.Economizer,
            'EF': BRICK.Exhaust_Fan,
            'SF': BRICK.Supply_Fan,
            'RF': BRICK.Return_Fan,
            'CHW_Loop': BRICK.Chilled_Water_Loop,
            'CHW_LOOP': BRICK.Chilled_Water_Loop,
            'CHILLER': BRICK.Chiller,
            'CHWV': BRICK.Chilled_Water_Valve,
            'CHW': BRICK.Chilled_Water_Pump,
            'HWV': BRICK.Hot_Water_Valve,
            'VAV': BRICK.Variable_Air_Volume_Box,
            'ZN': BRICK.HVAC_Zone,
            'PUMP': BRICK.Pump,
            'CRAC': BRICK.Computer_Room_Air_Conditioner,
            'FCU': BRICK.Fan_Coil_Unit,
            'DMPR': BRICK.Damper,
            'FAN': BRICK.Fan,
            'ISSO_VLV': BRICK.Isolation_Valve,
            'VLV': BRICK.Valve,
            'VFD': BRICK.Variable_Frequency_Drive,
            'CHW_VLV': BRICK.Chilled_Water_Valve,
            'HW_VLV': BRICK.Hot_Water_Valve,
        }
        self.points = {
            'STAT': BRICK.Status,
            'FAN_STAT': BRICK.Fan_Status,
            'SA_PR': BRICK.Supply_Air_Pressure_Sensor,
            'SA_PR_STPT': BRICK.Supply_Air_Pressure_Setpoint,
            'CALC_STATE': BRICK.Status,
            'FLOW': BRICK.Air_Flow_Sensor,
            'PR': BRICK.Pressure_Sensor,
            'STPT': BRICK.Setpoint,
            'RunHours': BRICK.Run_Time_Sensor,
            'CHW_PR': BRICK.Water_Pressure_Sensor,
            'CHW_T_R': BRICK.Entering_Water_Temperature_Sensor,
            'CHW_T_S': BRICK.Leaving_Water_Temperature_Sensor,
            'PMP': BRICK.On_Off_Command,
            'SIG': BRICK.Status,
            'OCC_STAT': BRICK.Occupancy_Status,
            'SA_T_STPT': BRICK.Supply_Air_Temperature_Setpoint,
            'SA_T': BRICK.Supply_Air_Temperature_Sensor,
            'RA_T_STPT': BRICK.Return_Air_Temperature_Setpoint,
            'RA_T': BRICK.Return_Air_Temperature_Sensor,
            'DA_T': BRICK.Discharge_Air_Temperature_Sensor,
            'DA_T_STPT': BRICK.Discharge_Air_Temperature_Setpoint,
            'HW_T_S': BRICK.Leaving_Water_Temperature_Sensor,
            'T': BRICK.Air_Temperature_Sensor,
            'T_STPT': BRICK.Air_Temperature_Setpoint,
            'PR_STPT': BRICK.Pressure_Setpoint,
            'STPT_HT_EFF': BRICK.Effective_Heating_Zone_Air_Temperature_Setpoint,
            'STPT_CL_EFF': BRICK.Effective_Cooling_Zone_Air_Temperature_Setpoint,
            'OA_FLOW': BRICK.Outside_Air_Flow_Sensor,
            'PH_T': BRICK.Phase_Temperature_Sensor,
            'RA_T': BRICK.Return_Air_Temperature_Sensor,
            'RA_T_STPT': BRICK.Return_Air_Temperature_Setpoint,
            'ZN_STPT_CL_OCC': BRICK.Cooling_Zone_Air_Temperature_Setpoint,
            'ZN_STPT_HT_OCC': BRICK.Heating_Zone_Air_Temperature_Setpoint,
            'ZN_STPT_CL_UNOC': BRICK.Cooling_Zone_Air_Temperature_Setpoint,
            'ZN_STPT_HT_UNOC': BRICK.Heating_Zone_Air_Temperature_Setpoint,
            'ZN_T': BRICK.Zone_Air_Temperature_Sensor,
            'ZN_H': BRICK.Zone_Air_Humidity_Sensor,
            'H': BRICK.Humidity_Sensor,
            'H_STPT': BRICK.Humidity_Setpoint,
            'ZN_H_STPT': BRICK.Zone_Air_Humidity_Setpoint,
            'POS': BRICK.Position_Command,
            'CHLR_STAT': BRICK.Chiller_Status,
            'VFD_SIG': BRICK.Fan_Status,
        }

    def add_mappings(self, mappings: dict[str, dict[str, tuple]]):
        for point, mapping in mappings.items():
            e = mapping.get("equip")
            p = mapping.get("point")
            if e:
                logging.info(f"Adding {e} for {point}")
                #self.equipment[point] = URIRef(e)
            if p:
                logging.info(f"Adding {p} for {point}")
                #self.points[point] = URIRef(p)

    def make_parser3(self):
        equipment = self.equipment
        default_delimters = r'[\s_:\-.]'
        not_delimiters = r'[^' + default_delimters[1:-1] + ']+'
        points = self.points
        class myparser(Parser):
            def __init__(self, id=None):
                self.id = id

            def try_consume_abbreviation(self, target: str) -> tuple[str, URIRef]:
                # try to consume an abbreviation from the target string. Take
                # the longest abbreviation that matches an equipment or point abbreviation.
                # Return the abbreviation and the corresponding URIRef
                match = (None, None)
                for abbr, uri in equipment.items():
                    if target.startswith(abbr):
                        if not match[0] or len(abbr) > len(match[0]):
                            match = (abbr, uri)
                for abbr, uri in points.items():
                    if target.startswith(abbr):
                        if not match[0] or len(abbr) > len(match[0]):
                            match = (abbr, uri)
                return match

            def __call__(self, target: str) -> List[TokenResult]:
                consumed = []
                results = []
                og_target = target
                while target:
                    match = self.try_consume_abbreviation(target)
                    # if we found a match, emit all the consumed characters as a string
                    # and then emit the abbreviation as a Constant token
                    if match[0]:
                        if consumed:
                            label = ''.join(consumed)
                            results.append(TokenResult(label, Identifier(label), len(consumed)))
                            consumed.clear()
                        results.append(TokenResult(match[0], Constant(match[1]), len(match[0])))
                        target = target[len(match[0]) :]
                    else:
                        # otherwise, consume one character at a time
                        consumed.append(target[0])
                        target = target[1:]
                if consumed:
                    results.append(TokenResult("".join(consumed), Identifier("".join(consumed)), len(consumed)))
                # add the original target string to the end as an Identifier token
                # results.append(TokenResult(og_target, Identifier(og_target), 0))
                new_results = []

                # remoe all tokens which are empty strings or just delimiters
                results = [r for r in results if r.value and re.sub(default_delimters, '', r.value) != '']

                # loop through the results. Add an identifier token after each Constant token
                # unless there is already an Identifier token after the Constant token. If the last token is a constant,
                # leave it as is.
                for i, r in enumerate(results):
                    # if the token is a Constant and the next token is not an Identifier, add an Identifier token
                    current_token_is_constant = isinstance(r.token, Constant)
                    is_last_token = i == len(results) - 1
                    if current_token_is_constant and (not is_last_token and not isinstance(results[i + 1].token, Identifier)):
                        new_results.append(r)
                        new_results.append(TokenResult(r.value, Identifier(r.value), 0))
                    else:
                        new_results.append(r)
                for r in new_results:
                    logging.info(f"Token: {r}")

                # turn all strings into Identifier tokens
                #new_results = []
                #for r in results:
                #    if isinstance(r, str):
                #        new_results.append(TokenResult(r, Identifier(r), len(r)))
                #    else:
                #        new_results.append(r)

                #delim_parser = maybe(regex(default_delimters, Delimiter))
                ##ident_until_delim = regex(not_delimiters, Identifier)
                #ident_until_delim = rest(Identifier)
                #substring_parser = maybe(sequence(delim_parser, ident_until_delim))
                ## now, we need to clean up the 'results' list.
                ## First, remove any string-typed items which are empty
                #results = [r for r in results if r]
                ## For each string containing a delimiter, consume the delimiter (into a token), then consume non-delimiters (into a token)
                ## and repeat until the string is empty
                #new_results = []
                #for i, r in enumerate(results):
                #    if isinstance(r, str):
                #        tokens = substring_parser(r)
                #        logging.info("subsring!")
                #        for t in tokens:
                #            logging.info(f"Token: {t}")
                #        # remove empty (Null) tokens
                #        tokens = [t for t in tokens if not isinstance(t.token, Null)]
                #        new_results.extend(tokens)
                #    else:
                #        logging.info(f"Token: {r}")
                #        new_results.append(r)
                return new_results
        return myparser()

    def make_parser2(self):
        """
        STarting at the beginning of the target string, find the longest abbreviation that matches
        an equipment or point abbreviation. If it exists, emit a TokenResult with the corresponding URIRef
        and the length of the abbreviation. Then, search for the next abbreviation in the target string
        and emit a TokenResult with the corresponding URIRef and the length of the abbreviation.
        Continue until the end of the target string.

        This needs to generate an *even* number of tokens because the rest of the parsing infrastructure
        expects Constant, Identifier, .. or Identifier, Constant, ... etc.
        """
        default_delimters = r'[\s_:\-.]'
        equipment = self.equipment
        points = self.points
        class myparser(Parser):
            def __init__(self, id=None):
                self.id = id

            def __call__(self, target: str) -> List[TokenResult]:
                logging.info(f"--------------------------------------PARSE: {target}")
                og_target = target # save a copy of the original target string
                matched_so_far = 0
                results = []
                # create a TokenResult for an Identifier which is the target string
                full_ident_result = TokenResult(target, Identifier(target), 0)
                ident = []
                while target:
                    # find the *longest* abbreviation that matches the target string
                    match = None
                    for abbr, uri in equipment.items():
                        if target.startswith(abbr):
                            if not match or len(abbr) > len(match[0]):
                                match = (abbr, uri)
                                assert isinstance(uri, URIRef)
                    for abbr, uri in points.items():
                        if target.startswith(abbr):
                            if not match or len(abbr) > len(match[0]):
                                match = (abbr, uri)
                                assert isinstance(uri, URIRef)
                    # when we match, emit an Identifier token and a Constant token.
                    # The Constant token we get from the matched abbreviation.
                    # The Identifier token is everything up to the matched abbreviation OR
                    # everything since the last matched abbreviation
                    if match:
                        results.append(TokenResult(match[0], Constant(match[1]), len(match[0])))
                        target = target[len(match[0]) :]
                        matched_so_far += len(match[0])
                        # it can be the case that 'ident' is just a set of delimiters.
                        # if that is the case, we clear it so that we don't emit an empty Identifier token
                        if re.sub(default_delimters, '', ''.join(ident)) == '':
                            ident.clear()

                        # if the identifier is not empty, then we have an ident because
                        # we ate characters from the target string until we found an abbreviation.
                        # We need to mark these characters as consumed.
                        if ident:
                            matched_so_far += len(ident)
                        # if ident is *not* empty, we need to generate our own name
                        # because of the requirement of even number of tokens.
                        # First, we try to split the *rest* of the target string on the default delimiters
                        # and take the first part as the identifier. If that doesn't work,
                        # we use the prefix of og_target including the matched abbreviation
                        else:
                            # search for the next abbreviation in the unmatched part of the target string
                            parts = re.split(default_delimters, target)
                            # remove empty strings (this can happen if the target string starts with a delimiter)
                            parts = [p for p in parts if p]
                            if len(parts) > 1:
                                logging.info(f"parts: {parts}")
                                ident.append(parts[0])
                                consumed = target.index(parts[0]) + len(parts[0])
                                matched_so_far += consumed
                            else:
                                # if the identifier is empty, use the prefix of the target string, including the matched abbreviation
                                ident.append(og_target[: matched_so_far])
                                logging.info(f"from prefix: {ident}")
                        logging.info(f"using ident: {''.join(ident)}")
                        ident_result = TokenResult("".join(ident), Identifier("".join(ident)), len(ident))
                        results.append(ident_result)
                        ident.clear()
                    else:
                        # if no match, continue one character at a time
                        # add the first character of the target string to the identifier
                        ident.append(target[0])
                        target = target[1:]
                logging.info(f"Remaining: {ident}")
                logging.info(f"PARSE Results: {og_target} -> {sum([r.length for r in results])}, {len(og_target)}")
                for r in results:
                    logging.info(f"  {r.token}")
                if ident:
                    logging.warning(f"Did not parse: {ident}") # TODO: add to some report?
                results.append(full_ident_result) # add the identifier to the end
                return results
        return myparser()


    def make_parser(self):
        # test each abbreviation in the dictionary. If it exists in the target string,
        # return a TokenResult with the abbreviation and the corresponding URIRef
        def parse(target: str) -> List[TokenResult]:
            results = []
            for abbr, uri in self.equipment.items():
                if abbr in target:
                    results.append(TokenResult(None, Constant(uri), len(abbr)))
                    # find where the abbreviation is in the target string and read until the next underscore OR the end of the string OR another abbreviation
                    # this is the 'identifier' part of the token
                    ident = target[target.index(abbr) + len(abbr) :]
                    if "_" in ident:
                        ident = ident[: ident.index("_")]
                    for abbr2, uri2 in self.equipment.items():
                        if abbr2 in ident:
                            # identifier is everything up to the next abbreviation
                            ident = ident[: ident.index(abbr2)]
                    results.append(TokenResult(None, Identifier(ident), len(ident)))
                    # remove the abbr from the target string
                    target = target[target.index(abbr) + len(abbr) :]
                    # remove the identifier from the target string
                    target = target[target.index(ident) + len(ident) :]

            for abbr, uri in self.points.items():
                if abbr in target:
                    results.append(TokenResult(None, Constant(uri), len(abbr)))
                    ident = target[target.index(abbr) + len(abbr) :]
                    if "_" in ident:
                        ident = ident[: ident.index("_")]
                    for abbr2, uri2 in self.equipment.items():
                        if abbr2 in ident:
                            # identifier is everything up to the next abbreviation
                            ident = ident[: ident.index(abbr2)]
                    results.append(TokenResult(None, Identifier(ident), len(ident)))
                    # remove the abbr from the target string
                    target = target[target.index(abbr) + len(abbr) :]
                    # remove the identifier from the target string
                    target = target[target.index(ident) + len(ident) :]
            return results
        return parse


class TemplateBuilder:
    def __init__(self, class_: rdflib.URIRef):
        self.body = rdflib.Graph()
        self.body.add((PARAM["name"], RDF.type, class_))
        self._symbol_num = 0
        # maps the part class to the parameter. We assume only 1 part of each class,
        # so if the same part shows up multiple times, we want to use the same parameter
        self.parts = {}
        self.dependencies = []
        self._brick = rdflib.Graph().parse("https://brickschema.org/schema/1.4/Brick.ttl", format="turtle")

    def _gensym(self) -> str:
        self._symbol_num += 1
        return f"p{self._symbol_num}"

    def add_dependency(self, my_param: rdflib.URIRef, dependency: Union[rdflib.URIRef, str]):
        param = my_param[len(str(PARAM)) :]
        dep = {
            "template": str(dependency),
            "args": {"name": param},
        }
        if isinstance(dependency, rdflib.URIRef):
            dep["library"] = "https://brickschema.org/schema/1.4/Brick"
            if not self._brick.query(f"ASK {{ <{dependency}> ?p ?o }}").askAnswer:
                logging.warning(f"Could not find {dependency} in Brick")
                return
        self.dependencies.append(dep)

    def add_point(self, point: rdflib.URIRef, name: Optional[str] = None):
        param = PARAM[name] if name else PARAM[self._gensym()]
        self.body.add((PARAM["name"], BRICK.hasPoint, param))
        self.body.add((param, RDF.type, point))

        self.add_dependency(param, point)

    def add_part(self, part: rdflib.URIRef, name: Optional[str] = None):
        param = PARAM[name] if name else PARAM[self._gensym()]
        self.body.add((PARAM["name"], BRICK.hasPart, param))
        self.body.add((param, RDF.type, part))
        self.parts[part] = param

        self.add_dependency(param, part)

    def add_part_point(
        self,
        part: rdflib.URIRef,
        point: rdflib.URIRef,
        name: Optional[str] = None,
        part_name: Optional[str] = None,
    ):
        part_param = self.parts.get(part)
        if not part_param:
            part_param = PARAM[part_name] if part_name else PARAM[self._gensym()]
            self.body.add((PARAM["name"], BRICK.hasPart, part_param))
            self.body.add((part_param, RDF.type, part))
            self.parts[part] = part_param
        point_param = PARAM[name] if name else PARAM[self._gensym()]
        self.body.add((part_param, BRICK.hasPoint, point_param))
        self.body.add((point_param, RDF.type, point))

        self.add_dependency(part_param, part)
        self.add_dependency(point_param, point)

    def add_mappings(self, pointlist: list[dict], all_mappings: list[dict]):
        mappings_by_abbr = {m['abbreviation']: m for m in all_mappings}
        for p in pointlist:
            point_name = p['point']
            mapping = mappings_by_abbr.get(point_name)
            if not mapping:
                logging.warning(f"Could not find mapping for {point_name}")
                continue

            point_name = point_name.replace(" ", "_")
            e = mapping.get("brick_equip_class")
            p = mapping.get("brick_point_class")
            if e and p:
                self.add_part_point(URIRef(e), URIRef(p), name=point_name)
            elif e:
                self.add_part(URIRef(e), name=point_name)
            elif p:
                self.add_point(URIRef(p), name=point_name)
            else:
                logging.warning(f"Mapping for {point_name} has no point or equip class")

    def to_yaml_string(self, name: str = "template") -> str:
        def _hash_dict(d):
            # rewrite d['args'] as a frozenset to make it hashable
            d = d.copy()
            d["args"] = frozenset(d["args"].items())
            return hash(frozenset(d.items()))
        # remove all duplicates from dependencies; compare based on key-value pairs
        seen = set()
        self.dependencies = [d for d in self.dependencies if not (_hash_dict(d) in seen or seen.add(_hash_dict(d)))]

        serialized_body = self.body.serialize(format="turtle")
        # remove all spaces at the end of each line
        serialized_body = '\n'.join([line.rstrip() for line in serialized_body.strip().splitlines()])

        templ = {
            name: {
                "body": serialized_body,
                "dependencies": self.dependencies,
            }
        }
        return yaml.dump(templ)


class ShapeBuilder:
    def __init__(self, class_: rdflib.URIRef):
        self.ns = rdflib.Namespace("http://example.org/")
        self.body = rdflib.Graph()
        self.body.add((self.ns["template"], RDF.type, SH.NodeShape))
        self.body.add((self.ns["template"], SH.targetClass, class_))
        # maps the part class to the prop shape. We assume only 1 part of each class,
        # so if the same part shows up multiple times, we want to use the same prop shape
        self.parts = {}

    def add_point(self, point: rdflib.URIRef, name: Optional[str] = None):
        prop_shape = rdflib.BNode()
        self.body.add((self.ns["template"], SH.property, prop_shape))
        self.body.add((prop_shape, SH.path, BRICK.hasPoint))
        qual_shape = rdflib.BNode()
        self.body.add((prop_shape, SH.qualifiedValueShape, qual_shape))
        self.body.add((prop_shape, SH.qualifiedMinCount, rdflib.Literal(1)))
        self.body.add((qual_shape, SH["class"], point))

    def add_part(self, part: rdflib.URIRef, name: Optional[str] = None):
        prop_shape = rdflib.BNode()
        self.body.add((self.ns["template"], SH.property, prop_shape))
        self.body.add((prop_shape, SH.path, BRICK.hasPart))
        qual_shape = rdflib.BNode()
        self.body.add((prop_shape, SH.qualifiedValueShape, qual_shape))
        self.body.add((prop_shape, SH.qualifiedMinCount, rdflib.Literal(1)))
        self.body.add((qual_shape, SH["class"], part))
        self.parts[part] = qual_shape
        return qual_shape

    def add_part_point(
        self,
        part: rdflib.URIRef,
        point: rdflib.URIRef,
        name: Optional[str] = None,
        part_name: Optional[str] = None,
    ):
        # like add_part, but the part's qualifiedValueShape is a another node shape which looks like add_point
        qual_shape = self.parts.get(part)
        if not qual_shape:
            qual_shape = self.add_part(part, part_name)

        prop_shape2 = rdflib.BNode()
        self.body.add((qual_shape, SH.property, prop_shape2))
        self.body.add((prop_shape2, SH.path, BRICK.hasPoint))
        qual_shape2 = rdflib.BNode()
        self.body.add((prop_shape2, SH.qualifiedValueShape, qual_shape2))
        self.body.add((prop_shape2, SH.qualifiedMinCount, rdflib.Literal(1)))
        self.body.add((qual_shape2, SH["class"], point))

    def add_mappings(self, pointlist: list[dict], all_mappings: list[dict]):
        mappings_by_abbr = {m['abbreviation']: m for m in all_mappings}
        for p in pointlist:
            point_name = p['point']
            mapping = mappings_by_abbr.get(point_name)
            if not mapping:
                logging.warning(f"Could not find mapping for {point_name}")
                continue

            point_name = point_name.replace(" ", "_")
            e = mapping.get("brick_equip_class")
            p = mapping.get("brick_point_class")
            if e and p:
                self.add_part_point(URIRef(e), URIRef(p), name=point_name)
            elif e:
                self.add_part(URIRef(e), name=point_name)
            elif p:
                self.add_point(URIRef(p), name=point_name)
            else:
                logging.warning(f"Mapping for {point_name} has no point or equip class")


class ManifestBuilder:
    def __init__(self, ontology: Ontology, equip_schedule: DictReader):
        self.manifest = rdflib.Graph()
        self.ontology = ontology
        self.shape_stuff = []
        self.equip_schedule = equip_schedule

    def build(self, ns: rdflib.Namespace):

        self.manifest.add((rdflib.URIRef(ns), RDF.type, OWL.Ontology))
        self.manifest.add((rdflib.URIRef(ns), OWL.imports, rdflib.URIRef("https://brickschema.org/schema/1.4/Brick")))
        self.manifest.add((rdflib.URIRef(ns), OWL.imports, rdflib.URIRef("https://nrel.gov/BuildingMOTIF/constraints")))

        for row in self.equip_schedule:
            logging.info(f"Processing row: {row}")
            row = {"equip": row["Equipment"], "description": row["Equipment"], "Count": row["Count"]}
            mapping = self.ontology.try_align_record_equip_only(row)
            if not mapping:
                continue
            self.create_shape(ns, rdflib.URIRef(mapping["equip"]), int(row["Count"]))
        return self.manifest

    def create_shape(self, ns: rdflib.Namespace, class_: rdflib.URIRef, count: int):
        _, _, val = self.manifest.namespace_manager.compute_qname(class_)
        shape = ns[f"{val}_shape_count"]
        self.manifest.add((shape, RDF.type, SH.NodeShape))
        self.manifest.add((shape, SH.targetNode, rdflib.URIRef(ns)))
        self.manifest.add((shape, CONSTRAINT.exactCount, rdflib.Literal(count)))
        self.manifest.add((shape, CONSTRAINT["class"], class_))


if __name__ == '__main__':
    ontology_location = "https://brickschema.org/schema/1.4/Brick.ttl"
    ontology = Ontology(ontology_location)

    points = [ {"point": "HW-VLV", "description": "Heating Command"}, {"point": "DA-T", "description": "Discharge Air Temp Sensor"}, {"point": "OCC-CMD", "description": "Occupancy Command"}, {"point": "ZN-T", "description": "Zone Temperature Sensor"}, {"point": "ZN-H", "description": "Zone Humidity Sensor"}, {"point": "OCC-CLG-SP", "description": "Occupied Cooling Air Temp Setpoint"}, {"point": "OCC-HTG-SP", "description": "Occupied Heating Air Temp Setpoint"}, {"point": "UNOCC-CLG-SP", "description": "Unoccupied Cooling Air Temp Setpoint"}, {"point": "UNOCC-HTG-SP", "description": "Unoccupied Heating Air Temp Setpoint"}, {"point": "EFFCLG-SP", "description": "Effective Cooling Air Temp Setpoint"}, {"point": "EFFHTG-SP", "description": "Effective Heating Air Temp Setpoint"} ]
    point = 'heating command'
    point_embedding = compute_embeddings([point])[0]

