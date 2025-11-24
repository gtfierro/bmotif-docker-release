from lxml import etree
from xmldiff import main, formatting

def pretty_print(element):
    """Simple printing of an xml element from the bsync library"""
    print(etree.tostring(element.toxml(), pretty_print=True).decode('utf-8'))
    
def xml_dump(root_element, file="example1.xml"):
    """Write the element to the specified file"""
    doctype = '<?xml version="1.0" encoding="UTF-8"?>'
    as_etree = root_element.toxml()
    #as_etree.set("xmlns", "http://buildingsync.net/schemas/bedes-auc/2019")
    output = etree.tostring(as_etree, doctype=doctype, pretty_print=True)
    with open(file, 'wb+') as f:
        f.write(output)
        return True
    
def xml_compare(left, right):
    file_diff = main.diff_files(left, right, diff_options={'ratio_mode':'faster'},
                       formatter=formatting.XMLFormatter())
    return file_diff