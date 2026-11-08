from pymongo import MongoClient
from dotenv import load_dotenv
from urllib.parse import quote_plus
from datetime import datetime,timezone
from typing import Optional
from bson import Binary
import os,uuid

load_dotenv()

username=os.getenv("MONGO_USERNAME")
password=os.getenv("MONGO_PASSWORD")
cluster=os.getenv("MONGO_CLUSTER")
MONGO_URI=f"mongodb+srv://{quote_plus(username)}:{quote_plus(password)}@{cluster}/"

client=MongoClient(MONGO_URI)
db=client["qbot_x"]
users_collection=db["users"]
files_collection=db["files"]
MAX_FILES=int(os.getenv("MONGO_MAX_FILE"))

files_collection.create_index("created",name="created_ttl",expireAfterSeconds=60*60*24*7)
files_collection.create_index("owner")

def save_file(name:str,data:bytes,owner:str="")->Optional[str]:
    if not owner: raise ValueError("save_file requires an owner")
    if files_collection.count_documents({"owner":owner})>=MAX_FILES:return None
    file_id=uuid.uuid4().hex
    files_collection.insert_one({"_id":file_id,"name":name,"owner":owner,"data":Binary(data),"created":datetime.now(timezone.utc)})
    return file_id

def load_file(file_id:str,owner:str="")->Optional[bytes]:
    doc=files_collection.find_one({"_id":file_id,"owner":owner})
    return bytes(doc["data"]) if doc else None

def show_files(owner:str):
    return list(files_collection.aggregate([{"$match":{"owner":owner}},{"$sort":{"created":-1}},{"$project":{"name":1,"created":1,"size":{"$binarySize":"$data"}}},]))

def file_name(file_id:str,owner:str)->Optional[str]:
    doc=files_collection.find_one({"_id":file_id,"owner":owner},{"name":1})
    return doc["name"] if doc else None

def delete_file(file_id:str,owner:str)->bool:
    return files_collection.delete_one({"_id":file_id,"owner":owner}).deleted_count>0