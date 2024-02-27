import unittest
from .composio_tool_spec import ComposioToolSpec
from inspect import signature
from llama_index.agent.openai import OpenAIAgent
from llama_index.llms.openai import OpenAI


class TestComposioToolSpec(unittest.TestCase):
    def setUp(self):
        with open("lib/data/composio_tool.json", "r") as file:
            self.tool_spec_json = file.read()
        self.composio_tool_spec = ComposioToolSpec(self.tool_spec_json, "composio_token", "user_id")

    def test_spec_functions_generation(self):
        """Test if spec functions are generated correctly based on the tool schema."""
        expected_functions = [
            "Clickup_CreateFolderView",
            "Slack_SendMessage",
            "Slack_UpdateMessage",
            "Slack_DeleteMessage",
            "Github_CreateIssue"
        ]
        self.assertEqual(sorted(self.composio_tool_spec.spec_functions), sorted(expected_functions))

    def test_function_signature(self):
        """Test if a specific function has the correct signature based on the tool schema."""
        send_message_func = getattr(self.composio_tool_spec, "Slack_SendMessage", None)
        self.assertIsNotNone(send_message_func)
        sign = send_message_func.__signature__
        expected_params = ['channel', 'text']
        actual_params = list(sign.parameters.keys())
        self.assertEqual(expected_params, actual_params)
        sig = signature(send_message_func)
        expected_sig = "(channel: str, text: str) -> Dict[str, Any]"
        self.assertEqual(str(sig), expected_sig)
        description = send_message_func.__doc__
        expected_desc = "Send a message to a channel or user"
        self.assertEqual(description, expected_desc)

    def test_missing_required_params(self):
        """Test if the function correctly handles missing required parameters."""
        send_message_func = getattr(self.composio_tool_spec, "Slack_SendMessage", None)
        self.assertIsNotNone(send_message_func)
        response = send_message_func(text="Hello, World!")
        self.assertIn("error", response)
        self.assertIn("Missing required params", response["error"])
    
    def test_nested_request_signature(self):
        """Test if the function correctly handles nested request body parameters."""
        create_issue_func = getattr(self.composio_tool_spec, "Clickup_CreateFolderView", None)
        self.assertIsNotNone(create_issue_func)
        sig = signature(create_issue_func)
        print("sig:", sig)

    def test_agent(self):
        """Test the agent vy spec."""
        llm = OpenAI(model="gpt-4-turbo-preview")
        agent = OpenAIAgent.from_tools(self.composio_tool_spec.to_tool_list(), llm=llm, verbose=True)
        agent.chat("Hello, World!")



if __name__ == '__main__':
    unittest.main()
