from buildingmotif.namespaces import BRICK
from buildingmotif.label_parsing.combinators import abbreviations, sequence, string, regex, wrap, constant
from buildingmotif.label_parsing.tokens import Delimiter, Identifier, Constant

# YOU HAVE ACCESS TO 'point_mappings' AND 'equipment_mappings' VARIABLES
# from the /mappings endpoint

short_equip_id = regex(r"\d+", Identifier)
building_id = sequence(
    constant(Constant(BRICK.Building)),
    regex(r"\w+", Identifier),
)

my_parser = sequence(
    building_id,
    string(":", Delimiter),
    equipment_mappings,
    string("-", Delimiter),
    short_equip_id,
    string(":", Delimiter),
    point_mappings
)
