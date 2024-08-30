from email.mime import base
from typing import Dict,Sequence



from pydantic import BaseModel,Field
from composio.tools.local.base import Action
import os

import pyairtable


from python.composio.tools.base.local import LocalAction



class AirthableCreateTableRequest(BaseModel):
    name: str = Field(...,description="Name of the new tabl")
    description: str = Field(...,description="Description of new table to be created")
    fields: Sequence[dict[str, object]] = Field(...,description="all the fields for new created table")

class AirthableCreateTableReponse(BaseModel):
    table: "pyairtable.api.table.Table" = Field(...,description="New table created")

class AirTableCreateTable(LocalAction[AirthableCreateTableRequest,AirthableCreateTableReponse]):
    """
        create Airtable table resource 
    """

    def execute(self, request: AirthableCreateTableRequest, metadata: dict) -> dict | AirthableCreateTableReponse:

        auth_token = metadata.get("AIRTABLE_AUTH_TOKEN",os.getenv("AIRTABLE_AUTH_TOKEN"))
        if auth_token is None:
            self.logger.error("AIRTABLE_AUTH_TOKEN is not set")
            raise ValueError("AIRTABLE_AUTH_TOKEN is not set")

        api = pyairtable.Api(auth_token)
        base = api.base(base_id='')
        new_table = base.create_table(description=request.description,fields=request.fields, name=request.name)
        
        return AirthableCreateTableReponse(table=new_table)
    
    