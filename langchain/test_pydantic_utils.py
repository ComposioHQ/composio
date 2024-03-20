import unittest
from langchain.pydantic_utils import json_schema_to_model

class TestJsonSchemaToModel(unittest.TestCase):
    def test_json_schema_to_model_and_back(self):
        json_schema = {
            'parameters': {
                'properties': {
                    'owner': {
                        'description': 'Owner of the repository',
                        'examples': ['openai', 'facebook'],
                        'title': 'Owner',
                        'type': 'string'
                    },
                    'repo': {
                        'description': 'Name of the repository',
                        'examples': ['gpt-3', 'react'],
                        'title': 'Repo',
                        'type': 'string'
                    },
                    'title': {
                        'description': 'Title of the issue',
                        'examples': ['Bug in the code', 'Feature request'],
                        'title': 'Title',
                        'type': 'string'
                    },
                    'body': {
                        'default': '',
                        'description': 'Body of the issue',
                        'examples': ['The code is not working', 'I would like to request a new feature'],
                        'title': 'Body',
                        'type': 'string'
                    }
                },
                'required': ['owner', 'repo', 'title'],
                'title': 'CreateIssueRequest',
                'type': 'object'
            }
        }

        # Convert JSON schema to Pydantic model
        model = json_schema_to_model(json_schema['parameters'])

        # Convert Pydantic model back to schema
        generated_schema = model.schema()

        # Extract the properties and required fields from the original schema for comparison
        original_properties = json_schema['parameters']['properties']
        original_required = json_schema['parameters']['required']

        # Assert that the generated schema matches the original schema
        self.assertEqual(generated_schema['properties'], original_properties)
        self.assertEqual(generated_schema['required'], original_required)

if __name__ == '__main__':
    unittest.main()

