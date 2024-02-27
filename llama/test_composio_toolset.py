import unittest
from llama_composio import ComposioToolset
from inspect import signature

class TestComposioToolset(unittest.TestCase):
    def setUp(self):
        self.composio_toolset = ComposioToolset()

    def test_authenticated_tools(self):
        """Test if authenticated tools are fetched correctly."""
        self.assertTrue(self.composio_toolset.authenticated_tools)
        print("Authenticated tools:", self.composio_toolset.authenticated_tools)