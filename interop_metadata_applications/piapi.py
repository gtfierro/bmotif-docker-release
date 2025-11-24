import requests
import json
from requests.auth import HTTPBasicAuth
from getpass import getpass

class PIAPI():

    def __init__(self, url="localhost", host="BSPARN-33903S", database="BRICK_to_XML") -> None:

        self.url = url
        self.host = host
        self.header = {
            "Host": self.url, 
            "Accept": "application/json"
        }
        self.database = database
        self.assetserver = None
        self.dataserver = None
        self.user = input("Please input user ID ")
        self.pw = getpass(f"Please input password for user {self.user} ")
        self.auth = HTTPBasicAuth(self.user, self.pw)
        if self.getHome():
            print("Client initialization successful")
        else:
            print(f"Could not connect to client using url: {self.url}")

    def getHome(self):
        response = self.restGet(f"https://{self.url}/piwebapi")
        try:
            self.assetserver = response["Links"]["AssetServers"]
        except:
            pass
        try:
            self.dataserver = response["Links"]["DataServers"]
        except:
            pass

        return True

    def restGet(self, url, data={}):
        return requests.get(url, headers = self.header, data=json.dumps(data), auth = self.auth, verify=False)
    
    def restPut(self, url, data={}):
        return requests.put(url, headers = self.header, data=json.dumps(data), auth = self.auth, verify=False)
    
    def restPost(self, url, data={}):
        return requests.post(url, headers = self.header, data=json.dumps(data), auth = self.auth, verify=False)

    def getAssetServers(self):
        return self.restGet(self.assetserver)["Items"]

    def getDataServers(self):
        return self.restGet(self.dataserver)["Items"]

    def getAvailableDatabases(self, serverind=0):
        self.dburl = self.getAssetServers()[serverind]["Links"]["Databases"]
        return self.restGet(self.dburl)["Items"]

    def getTables(self, serverind=0, dbind=0):
        self.tblurl = self.getAvailableDatabases(serverind=serverind)[dbind]["Links"]["Tables"]
        return self.restGet(self.tblurl)

    def newTable(self, tableurl, tableparams):
        return self.restPost(tableurl, data=tableparams)


# sampledata = {
#   "Columns": {
#     "Timestamp": "Double",
#     "SamplePoint1": "Double",
#     "SamplePoint2": "Double"
#   },
#   "Rows": [
#     {
#       "Timestamp": "0.2",
#     "SamplePoint1": "0.5",
#     "SamplePoint2": "0.8"
#     }
#   ]
# }

# response = piclient.restPut('https://localhost/piwebapi/tables/F1BlYrtVEj7NTECA5r-pvnkoegM17RE9Sf9kmpBxAjkyXXMAQlNQQVJOLTMzOTAzU1xCQUNORVRfVEVTVFxUQUJMRVNbVEVTVFRBQkxFQVBJXQ/data', data=sampledata)
