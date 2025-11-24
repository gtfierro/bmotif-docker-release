import { Injectable } from '@angular/core';

const defaultParser = String.raw`
from buildingmotif.namespaces import BRICK
from buildingmotif.label_parsing.combinators import abbreviations, sequence, string, regex, wrap, constant
from buildingmotif.label_parsing.tokens import Delimiter, Identifier, Constant

# YOU HAVE ACCESS TO 'point_mappings' AND 'equipment_mappings' VARIABLES
# from the /mappings endpoint

short_equip_id = regex(r"\d+", Identifier)
building_id = sequence(
    constant(Constant(BRICK.Building)),
    regex(r"\d+", Identifier),
)

my_parser = sequence(
    building_id,
    string("_", Delimiter),
    equipment_mappings,
    string("_", Delimiter),
    short_equip_id,
    string("/", Delimiter),
    point_mappings
)
`;

export interface ParseResults {
  // key is the error, value is the list of points that have that error
  errors: Map<string, string[]>;
  // key is the unmatched suffix, value is the list of points that have that suffix
  unmatched_suffixes: Map<string, string[]>;
}

@Injectable({
  providedIn: 'root'
})
export class DemoStateService {
  private state: { pointlistCSV: File | null;
                   pointscheduleCSV: File | null;
                   equipmentScheduleCSV: File | null;
                   parserSourcePy: string;
                   parseResults: ParseResults | null; };

  constructor() {
    const savedState = localStorage.getItem('demoState');
    this.state = savedState ? JSON.parse(savedState) : { pointlistCSV: null, pointscheduleCSV: null, equipmentScheduleCSV: null, parserSourcePy: defaultParser };
    if (!this.state.parserSourcePy) {
      this.state.parserSourcePy = defaultParser;
    }
    this.saveState();
    console.log('DemoStateService', this.state);
  }

  private saveState() {
    localStorage.setItem('demoState', JSON.stringify(this.state));
  }

  setParseResults(parseResults: ParseResults | null) {
    console.log('setParseResults', parseResults);
    this.state.parseResults = parseResults;
    this.saveState();
  }

  getParseResults(): ParseResults | null {
    return this.state.parseResults;
  }

  setParserSourcePy(parserSourcePy: string) {
    console.log('setParserSourcePy', parserSourcePy);
    this.state.parserSourcePy = parserSourcePy;
    this.saveState();
  }

  getParserSourcePy(): string {
    return this.state.parserSourcePy;
  }

  setPointlistCSV(file: File | null) {
    console.log('setPointlistCSV', file);
    this.state.pointlistCSV = file;
    this.saveState();
  }

  getPointlistCSV(): File | null {
    return this.state.pointlistCSV;
  }

  setPointscheduleCSV(file: File | null) {
    console.log('setPointscheduleCSV', file);
    this.state.pointscheduleCSV = file;
    this.saveState();
  }

  getPointscheduleCSV(): File | null {
    return this.state.pointscheduleCSV;
  }
  setEquipmentScheduleCSV(file: File | null) {
    console.log('setEquipmentScheduleCSV', file);
    this.state.equipmentScheduleCSV = file;
    this.saveState();
  }

  getEquipmentScheduleCSV(): File | null {
    return this.state.equipmentScheduleCSV;
  }

  clearState() {
    this.state = { pointlistCSV: null, pointscheduleCSV: null, equipmentScheduleCSV: null, parserSourcePy: defaultParser, parseResults: null };
    this.saveState();
  }
}
