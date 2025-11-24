from buildingmotif.namespaces import BRICK
from buildingmotif.label_parsing.combinators import abbreviations, sequence, string, regex, wrap, constant
from buildingmotif.label_parsing.tokens import Delimiter, Identifier, Constant

equip_tag = abbreviations({
    'AHU': BRICK.Air_Handling_Unit,
    'ECON': BRICK.Economizer,
    'EF': BRICK.Exhaust_Fan,
    'SF': BRICK.Supply_Fan,
    'VAV': BRICK.Variable_Air_Volume_Box,
})

equip_id = wrap(sequence(
    regex(r"\d+", Identifier),
    string("_", Delimiter),
    regex(r"\d+", Identifier),
), Identifier)
short_equip_id = regex(r"\d+", Identifier)

building_id = sequence(
        constant(Constant(BRICK.Building)),
    regex(r"\d+", Identifier),
)

point_tag = abbreviations({
    "DA-T":                 BRICK.Discharge_Air_Temperature_Sensor,
    "FLOW_STPT":            BRICK.Air_Flow_Setpoint,
    "AirSourceSA_T":        BRICK.Supply_Air_Temperature_Sensor,
    "RunHours":             BRICK.Runtime_Setpoint,
    "FLOW_CALC_STATE":      BRICK.Point,
    "HWV_SIG":              BRICK.Valve_Position_Command,
    "FLOW":                 BRICK.Air_Flow_Sensor,
    "DMPR_POS":             BRICK.Damper_Position_Command,
    "DPR-O":                BRICK.Damper_Position_Command,
    "FAN":                  BRICK.Fan_Command,
    "OCC_STAT":             BRICK.Occupancy_Status,
    "RUN":                  BRICK.Run_Enable_Command,
    "ZN_STPT_HT_UNOC":      BRICK.Unoccupied_Heating_Zone_Air_Temperature_Setpoint,
    "ZN_STPT_CL_UNOC":      BRICK.Unoccupied_Cooling_Zone_Air_Temperature_Setpoint,
    "ZN_STPT_CL_OCC":       BRICK.Occupied_Cooling_Zone_Air_Temperature_Setpoint,
    "ZN_STPT_HT_OCC":       BRICK.Occupied_Heating_Zone_Air_Temperature_Setpoint,
    "ZN_STPT_HT_EFF":       BRICK.Effective_Heating_Zone_Air_Temperature_Setpoint,
    "EFFHTG-SP":            BRICK.Effective_Heating_Zone_Air_Temperature_Setpoint,
    "ZN_STPT_CL_EFF":       BRICK.Effective_Cooling_Zone_Air_Temperature_Setpoint,
    "EFFCLG-SP":            BRICK.Effective_Cooling_Zone_Air_Temperature_Setpoint,
    "HTG-O":                BRICK.Heating_Command,
    "SAFLOW-SP":            BRICK.Supply_Air_Flow_Setpoint,
    "ZN-H":                 BRICK.Zone_Air_Humidity_Sensor,
})

O27_label_parser = sequence(
    equip_tag,
    string("_", Delimiter),
    equip_id,
    point_tag,
)

b315_label_parser = sequence(
    building_id,
    string("_", Delimiter),
    equip_tag,
    string("_", Delimiter),
    short_equip_id,
    string("/", Delimiter),
    point_tag
)
