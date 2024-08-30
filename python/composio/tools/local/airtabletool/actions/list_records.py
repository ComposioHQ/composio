import os
import pyairtable

from pyairtable.api.types import RecordDict,Fields

from pydantic import BaseModel, Field

from python.composio.tools.base.local import LocalAction

class ListRecordRequest(BaseModel):
    record_name: str = Field(..., description="name of the record")
    base_id: str = Field(...,description='Base id ')



class AirTableRecordResponse(BaseModel):
    createdTime: str = Field(...,description='Created Time of the record')
    fields: Fields = Field(...,description='Created Time of the record')

class AirTableListRecordResponse(BaseModel):
    records: list[RecordDict] = Field(..., description="List of extracted image paths ")


class AirTableListRecord(LocalAction[ListRecordRequest,AirTableListRecordResponse]):
    """
        Retrive list of Records from airtable.
    """

    def execute(self, request_data: ListRecordRequest, metadata: dict) -> dict | AirTableListRecordResponse:

        auth_token = metadata.get("AIRTABLE_AUTH_TOKEN",os.getenv("AIRTABLE_AUTH_TOKEN"))

        if auth_token is None:
            self.logger.error("AIRTABLE_AUTH_TOKEN is not set")
            raise ValueError("AIRTABLE_AUTH_TOKEN is not set")

        api = pyairtable.Api(auth_token)
        table = api.table(request_data.base_id,request_data.record_name)
        records = table.all()

        return AirTableListRecordResponse(records=records)

        
