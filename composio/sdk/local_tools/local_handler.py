from .mathematical import Mathematical


class LocalToolHandler:
    def __init__(self):
        self.registered_tools = self.register_local_tools()
        self.tool_map = {tool.tool_name: tool for tool in self.registered_tools}

    def register_local_tools(self):
        return [
            Mathematical()
        ]

    def is_local(self, app_or_action) -> bool:

        val = app_or_action.value

        # App Enum instance is passed
        if isinstance(val, str):
            return val in self.tool_map
        # Action Enum instance is passed
        elif isinstance(val, tuple):
            return val[0] in self.tool_map
        else:
            raise ValueError("Either pass an App or Action object here.")

    def get_list_of_action_schemas(self, apps=[], actions=[], tags=[]):

        tag_values = [tag if isinstance(tag, str) else tag.value for tag in tags]

        all_action_objs = []

        for app in apps:
            tool_obj = self.tool_map[app.value]
            all_action_objs.extend(tool_obj.get_actions_dict().values())

        for action in actions:
            tool_obj = self.tool_map[action.value[0]]
            action_obj = tool_obj.get_actions_dict()[action.value[1]]
            all_action_objs.append(action_obj)

        # all_action_objs = list(set(all_action_objs))
        all_action_schemas = [action_obj.get_action_schema() for action_obj in all_action_objs]
        # all_action_schemas = list(set(all_action_schemas))

        all_action_schemas = list({action_schema["name"]: action_schema for action_schema in all_action_schemas}.values())

        if tag_values:
            all_action_schemas = [action_schema for action_schema in all_action_schemas if bool(set(tag_values) & set(action_schema["tags"]))]

        return all_action_schemas

    def execute_local_action(self, action, request_data: dict, metadata: dict = {}):
        tool_obj = self.tool_map[action.value[0]]
        action_obj = tool_obj.get_actions_dict()[action.value[1]]
        return action_obj.execute_action(request_data, metadata)
