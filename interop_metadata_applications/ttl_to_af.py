import sys, os, json, re, uuid, random, string

from interop_metadata_applications.transform import definition_to_shape, definition_to_sparql

from collections import defaultdict
from copy import deepcopy


from rdflib import RDFS, RDF, SH, BRICK, Namespace, Graph, Literal, BNode, URIRef
from functools import reduce

#sys.path.insert(1, '../../buildingmotif')
from buildingmotif import BuildingMOTIF
from buildingmotif.dataclasses import Model, Library, ShapeCollection
from buildingmotif.namespaces import SH, BRICK

import pandas as pd

from interop_metadata_applications.utils import xml_dump
import interop_metadata_applications.afxml as af

class Translator():
    
    def __init__(self) -> None:
        bm = BuildingMOTIF("sqlite://", shacl_engine="topquadrant")

        self.graph = Graph()
        self.af_root = af.AF()
        self.BRICK = Namespace('https://brickschema.org/schema/Brick#')
        self.EX = Namespace('http://example.org/building#')
        self.defaultserver = "1WV63PTTSAT01"
        self.defaultdatabase = "ESTCP_CERL_Development"
        self.defaulturi = f"\\{self.defaultserver}\{self.defaultdatabase}"
        self.datas = {}
        self.afddrules = None
        self.manifest = None
        self.bmmodel = None
        self.validation = True
        self.templates = {'Analysis': {}, 'Element': {}, 'Attribute': {}}
        self.piexportpath = 'C:\Program Files\PIPC\AF\AFExport.exe'
        self.piimportpath = 'C:\Program Files\PIPC\AF\AFImport.exe'


    def export_pi_database(self, database, outpath):
        args = [
            "/A", #export all references
            "/U" #export unique IDs
        ]
        command = [self.piexportpath, self.defaulturi, f'/File:"{outpath}"']
        command.extend(args)
        print(command)#subprocess.run(command)

    def import_pi_database(self, database, inpath):
        args = [
            "/A", #Auto check-in. Disable to avoid overriding data by accident.
            "/C", #Allow new elements
            "/U", #Allow updates
            "/CC", #create categories that are referenced but do not exist
            "/G", #Generate unique names
            #"/CE"
        ]
        command = [self.piimportpath, self.defaulturi, f'/File:"{inpath}"']
        command.extend(args)
        print(command)#subprocess.run(command)

    def load(self, ttlpath, merge=None):

        self.graph.parse(ttlpath)
        if merge is not None:
            if isinstance(merge, str):
                self.graph.parse(merge)
            else:
                for path in merge:
                    self.graph.parse(path)

    def add_rules(self, rulespath, validatedpath):
        with open(rulespath, 'r') as f:
            self.afddrules = json.load(f)
        with open(validatedpath, 'r') as f:
            self.validrules = json.load(f)

    def inspect(self, subject=None, predicate=None, object=None):
        results = []
        if predicate == 'type':
            predicate = RDF['type']
        else:
            predicate = self.BRICK[predicate]
        #print(f"Searching {subject}, {predicate}, {object}")
        for ns_prefix, namespace in self.graph.namespaces():
            if subject is not None and namespace not in subject:
                nsub = namespace + subject
            else:
                nsub = subject
            if object is not None and namespace not in object:
                nob = namespace + object
            else:
                nob = object
            for s, o, p in self.graph.triples((nsub, predicate, nob)):
                #print(f"Found: {s}, {o}, {p}")
                results.append((s, o, p))
        return results

    # Now THIS is where Gabe rules
    def definition_to_sparql(self, classname, defn, variable):
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
            {self.sparql_recurse(defn, variable, hook="root")} 
        }}"""
        return query

    def _gensym(self):
        """generates random sparql variable name"""
        return 'var' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

    def sparql_recurse(self, defn, varname, hook=None):
        relationships = ["hasPoint", "hasPart", "isPointOf", "isPartOf", "feeds"]
        # add '+' versions to relationships
        relationships += [f"{r}+" for r in relationships]
        # add '?' versions to relationships
        relationships += [f"{r}?" for r in relationships]
        # add '*' versions to relationships
        relationships += [f"{r}*" for r in relationships]
        query = ""
        if isinstance(defn, str):
            if hook is not None and hook != varname:
                # then varname is hasPoint from hook
                query += f"?{hook} brick:hasPoint ?{varname} .\n"
            query += f"?{varname} rdf:type {self.BRICK[defn].n3()} .\n"
            return query
        for key, value in defn.items():
            if key == "choice":
                # UNION of the list of descriptions in 'value'
                query += "{\n"
                query += " UNION ".join([f"{{ {self.sparql_recurse(v, varname, hook=hook)} }}\n" for v in value])
                query += "}\n"
            elif key in relationships:
                # start with a random var
                subject_var = hook or self._gensym()
                
                # get the relationship name
                suffix = key[-1] if key[-1] in ["+", "?", "*"] else ""
                relname = key.replace("+", "").replace("?", "").replace("*", "")
                # get the relationship type
                reltype = self.BRICK[relname]
                
                # the object of the relationship is one of two things:
                # - varname, if 'value' is a type
                # - a new variable, if 'value' is a dict
                if isinstance(value, str):
                    object_var = varname
                else:
                    object_var = self._gensym()

                # add the relationship to the query
                query += f"?{subject_var} {reltype.n3()}{suffix} ?{object_var} .\n"
                # add the object to the query
                query += self.sparql_recurse(value, varname, hook=object_var)
            else: # key represents a type
                subject_var = hook or self._gensym()
                query += f"?{subject_var} rdf:type {self.BRICK[key].n3()} .\n"
                # value should be a dictionary
                query += self.sparql_recurse(value, varname, hook=subject_var)

        return query


    def get_rule_bindings(self, firstttl):
        model = Graph()
        model.parse(firstttl)

        assert self.afddrules is not None, "No rules found. Please load rules before creating the AF tree."

        rules = {}

        # loop through all defns in self.afddrules
        for rule, defn in self.afddrules.items():
            # get the 'applicability' field (list of Brick classes) and find all instances of those classes in the model
            instances = defaultdict(dict)
            for classname in defn["applicability"]:
                class_ = self.BRICK[classname]
                for variable in defn["definitions"]:
                    query = self.definition_to_sparql(class_, defn["definitions"][variable], variable)
                    results = model.query(query)
                    for row in results.bindings:
                        row = {str(k): v for k, v in row.items()}
                        inst = row['root']
                        instances[inst].update(row)
            # find all instances which have less than len(defn["definitions"])+1 keys and remove them
            instances = {k: v for k, v in instances.items() if len(v) == len(defn["definitions"])+1}
            rules[rule] = dict(instances)
        return rules

    # you are exiting Gabe's kingdom at your own risk.

    def createAFTree(self, firstttl, outpath, merge=None):
        self.load(firstttl, merge)
        newaf = af.AF()
        afdict = {}
        ignored = []
        for subj, pred, obj in self.graph.triples((None, None, None)):
            if pred not in [RDF['type'], RDFS['label']]:
                subjtype = None
                objtype = None
                for _, _, bricktype in self.graph.triples((subj, RDF['type'], None)):
                        subjtype = bricktype.split('#')[-1]
                for _, _, bricktype in self.graph.triples((obj, RDF['type'], None)):
                        objtype = bricktype.split('#')[-1]
                if subj not in afdict.keys():
                    name = subj.split('#')[-1]
                    for _, _, label in self.graph.triples((subj, RDFS['label'], None)):
                        name = label
                    newel = af.AFElement(af.Name(name))
                    newel += af.id(uuid.uuid4().hex)
                    try:
                        newel += af.Description(subjtype)
                    except:
                        newel += af.Description("No description")
                    analyses = self.addAnalysis(subj)
                    if analyses != []:
                        for a in analyses:
                            newel += a
                    afdict[subj] = newel
                if obj not in afdict.keys():
                    name = obj.split('#')[-1]
                    for _, _, label in self.graph.triples((obj, RDFS['label'], None)):
                        name = label
                    newel = af.AFElement(af.Name(name))
                    newel += af.id(uuid.uuid4().hex)
                    try:
                        newel += af.Description(objtype)
                    except:
                        newel += af.Description("No description")
                    analyses = self.addAnalysis(obj)
                    if analyses != []:
                        for a in analyses:
                            newel += a
                    afdict[obj] = newel
                if pred in [self.BRICK['hasTag'], self.BRICK["Max_Limit"], self.BRICK["Min_limit"], self.BRICK['hasUnit'], self.BRICK['lastKnownValue']]:
                    ignored.append(afdict[obj])
                if pred == self.BRICK['isTagOf']:
                    ignored.append(afdict[subj])


                if pred in [self.BRICK['hasPoint'], self.BRICK['isPointOf']]:
                    afdict, ignored = self.addpoint(subj, pred, obj, subjtype, objtype, ignored, afdict)

                if pred == self.BRICK['hasPart'] or pred == self.BRICK['isLocationOf']:
                    afdict[obj]['ReferenceType'] = "Parent-Child"
                    afdict[subj] += afdict[obj]
                if pred == self.BRICK['isPartOf'] or pred == self.BRICK['hasLocation']:
                    afdict[subj]['ReferenceType'] = "Parent-Child"
                    afdict[obj] += afdict[subj]
                # if pred == self.BRICK["feeds"]:
                #     afdict[subj] += af.AFAttribute(
                #             af.Name("Feeds"),
                #             af.Description("Downstream element, as defined in the BRICK ontology. See https://brickschema.org/ontology/1.2/relationships/feeds"),
                #             af.Type("OSIsoft.AF.Asset.AFElement"),
                #             af.Value(self.findFullPath(obj), type="AFElement")
                #         )
                #     afdict[obj] += af.AFAttribute(
                #             af.Name("Is fed by"),
                #             af.Description("Upstream element, as defined in the BRICK ontology. See https://brickschema.org/ontology/1.2/relationships/isFedBy"),
                #             af.Type("OSIsoft.AF.Asset.AFElement"),
                #             af.Value(self.findFullPath(subj), type="AFElement")
                #         )
                # if pred == self.BRICK["isFedBy"]:
                #     #print(f"Element {subj} is fed by {obj}...")
                #     afdict[subj] += af.AFAttribute(
                #             af.Name("Is fed by"),
                #             af.Description("Upstream element, as defined in the BRICK ontology. See https://brickschema.org/ontology/1.2/relationships/isFedBy"),
                #             af.Type("OSIsoft.AF.Asset.AFElement"),
                #             af.Value(self.findFullPath(obj), type="AFElement")
                #         )
                #     afdict[obj] += af.AFAttribute(
                #             af.Name("Feeds"),
                #             af.Description("Downstream element, as defined in the BRICK ontology. See https://brickschema.org/ontology/1.2/relationships/feeds"),
                #             af.Type("OSIsoft.AF.Asset.AFElement"),
                #             af.Value(self.findFullPath(subj), type="AFElement")
                #         )
                
        db = af.AFDatabase(af.Name(self.defaultdatabase))
        for key in afdict.keys():
            if afdict[key] not in ignored:
                try:
                    if afdict[key]['ReferenceType'] != "Parent-Child":
                        db += afdict[key]
                except:
                    db += afdict[key]
        newaf += db
        newaf['PISystem'] = self.defaultserver
        newaf['ExportedType'] = "AFDatabase"
        newaf['Identity'] = "Database"
        newaf['Database'] = self.defaultdatabase
        if merge is not None:
            xml_dump(newaf, file=outpath.replace('.xml', '_updated.xml'))
            self.graph.serialize(outpath.replace('.xml', '_updated.ttl'), format='turtle')
        else:
            xml_dump(newaf, file=outpath)

        return newaf
    
    def addpoint(self, s, p, o, stype, otype, ign, afd):
        if p == self.BRICK['hasPoint']:
            otype = otype if otype is not None else ""
            attr = af.AFAttribute(
                af.Name(o.split('#')[-1]),
                af.Description(otype)
            )
            uom, aftype, val = self.getUOMs(o)
            if uom is not None:
                if uom != '':
                    attr += af.DefaultUOM(uom)
                attr += af.Type(aftype)
                vattr = af.Value(val, type=aftype)
            
            ign.append(afd[o])

            ### Adding an analysis starts here. 
            
            #We can add it to the parent directly #
            # By accessing afd[s] and using add

            # this should be deleted. Instead, the 
            # analyses should be added at the end of the process, when
            # all equipment and points are known
            # if otype in events:
            #     analysis, parent = self.addAnalysis(o)
            #     for a in analysis:
            #         afd[s] += a
            #     if uom is not None:
            #         attr += vattr
            #     attr += af.DataReference("Analysis")

            # ## Adding an analysis ends here
                
            # else:
            #     nattr, ispt = self.addTag(s, o, attr)
            #     if not ispt and uom is not None:
            #         nattr += vattr
            #     attr = nattr
            nattr, ispt = self.addTag(s, o, attr)
            if not ispt and uom is not None:
                nattr += vattr
            afd[o]['ReferenceType'] = "Parent-Child"
            afd[s] += nattr
            afd[s] += afd[o]

        elif p == self.BRICK['isPointOf']:
            stype = stype if stype is not None else ""
            attr = af.AFAttribute(
                af.Name(s.split('#')[-1]),
                af.Description(stype)
            )
            uom, aftype, val = self.getUOMs(s)
            if uom is not None:
                if uom != '':
                    attr += af.DefaultUOM(uom)
                attr += af.Type(aftype)
                vattr = af.Value(val, type=aftype)
            ign.append(afd[s])
            #analysis  = self.addAnalysis(s)
            # if analysis != []:
            #     for a in analysis:
            #         afd[o] += a
            #     if uom is not None:
            #         attr += vattr
                
            #     attr += af.DataReference("Analysis")
            # else:
            nattr, ispt = self.addTag(o, s, attr)
            if not ispt and uom is not None:
                nattr += vattr
            afd[s]['ReferenceType'] = "Parent-Child"
            afd[o] += nattr
            afd[o] += afd[s]

        return afd, ign
    
    def addTag(self, parent, point, attr):
        ispt = False
        for tagname in self.graph.objects(subject=point, predicate=self.BRICK['hasTag']):
            if not ispt:
                attr += af.DataReference("PI Point")
                attr += af.ConfigString(f"{self.findFullPath(tagname)};RelativeTime=-2y")
                ispt = True
        return attr, ispt

    def getUOMs(self, obj):
        uom = None
        aftype = None
        value = None
        for __, __, unit in self.graph.triples((obj, self.BRICK['hasUnit'], None)):
            unit = unit.split('#')[-1]
            if unit == 'DEG_F':
                uom = '°F'
                aftype = 'Int32'
                value = ""
            elif unit == 'OnOff':
                uom = ''
                aftype = 'Boolean'
                value = "False"
            elif unit == 'Percent' or unit == 'HR':
                uom = '%'
                aftype = 'Int32'
                value = ""
            elif unit == 'PPM':
                uom = 'ppm'
                aftype = 'Int32'
                value = ""
            elif unit == 'GAL_UK-PER-MIN':
                uom = 'US gal/min'
                aftype = 'Int32'
                value = ""
        return uom, aftype, value
    
    def addAnalysis(self, candidate):
        all_analyses = []
        for res in self.validrules:
            if res['success'] and res['focus_node'] == str(candidate):
                rulename = res['rule'].split('#')[-1]
                aname = f"{candidate.split('#')[-1]} {rulename}"
                newanalysis = af.AFAnalysis(af.Name(aname))
                newanalysis += af.Status("Enabled")
                newanalysis += af.Target(af.AFElementRef(self.findFullPath(self.getParent(candidate))))
                newanalysis += af.AFAnalysisCategoryRef('Analytics')
                analysisrule = af.AFAnalysisRule()
                analysisrule += af.AFPlugIn("PerformanceEquation")
                perfstr = self.match_equation(res['details'], self.afddrules[rulename]['output'])
                analysisrule += af.ConfigString(perfstr)
                analysisrule += af.VariableMapping(f"Output||{aname};")
                newanalysis += analysisrule
                newanalysis += af.AFTimeRule(
                    af.AFPlugIn(self.afddrules[rulename]["aftimerule"]),
                    af.ConfigString(f"Frequency={self.afddrules[rulename]['frequency']}")
                    )
                all_analyses.append(newanalysis)
        if all_analyses != []:
            print(all_analyses)
        return all_analyses
    
    def check_for_template(self, name, args, ttype):
        return self.templates[ttype][name] if name in self.templates[ttype].keys() else self.create_template(args, ttype)
        
    def create_template(self, args, ttype):
        
        if ttype == 'Analysis':
            return self.create_analysis_template()
        elif ttype == 'Element':
            return self.create_element_template()
        elif ttype == 'Attribute':
            return self.create_attribute_template()
        else:
            raise ValueError(f"Cannot create template with type: {ttype}. Please ensure the template type is one of [Analysis, Element, Attribute]")

    def create_attribute_template(self, attrs):
        pass

    def create_element_template(self, attrs):
        pass

    def create_analysis_template(self, name, rule):
        nt = af.AFAnalysisTemplate(af.Name(rule[name]), id=name)
        # may need to create new element template AFElementTemplate and link to it in CaseTemplate and use AFElelement in Target
        #net = af.AFElementTemplate(af.Name(rule[name]+'_ElementTemplate'))
        # may need to create new attribute templates for each element template?
        #net += af.AFAttributeTemplate(af.Name(f"{rule[name]}_{attr}_AttributeTemplate"))
        # 
    


    def match_equation(self, details, output):
        for metapoint in details.keys():
            output = output.replace(metapoint, details[metapoint].split('#')[-1])
        return output

    def getParent(self, obj):
        for s, p, o in self.graph.triples((None, None, None)):
            if p in [self.BRICK["hasPart"], self.BRICK['hasPoint'], self.BRICK['isLocationOf']] and o == obj:
                return s
            if p in [self.BRICK["isPartOf"], self.BRICK['isPointOf'], self.BRICK['hasLocation']] and s == obj:
                return o

    def findFullPath(self, obj):

        objpath = obj.split('#')[-1]
        for _, _, label in self.graph.triples((obj, RDFS['label'], None)):
            objpath = label
        while True:
            parent = ''
            for s, p, o in self.graph.triples((obj, None, None)):
                if p in [self.BRICK['isPartOf'], self.BRICK['hasLocation'], self.BRICK['isPointOf']]:
                    if obj != o:
                        obj = o
                        name = o.split('#')[-1]
                        for _, _, label in self.graph.triples((o, RDFS['label'], None)):
                            name = label
                        parent = name
            for s, p, o in self.graph.triples((None, None, obj)):
                if p in [self.BRICK['hasPart'], self.BRICK['isLocationOf'], self.BRICK['hasPoint']]:
                    if obj != s:
                        obj = s
                        name = s.split('#')[-1]
                        for _, _, label in self.graph.triples((s, RDFS['label'], None)):
                            name = label
                        parent = name
            
            if parent == '':
                break
            else:
                objpath = parent + "\\" + objpath
        return objpath
    
    def add_template(self):
        template = af.AFtemplate