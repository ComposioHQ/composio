from composio_crewai import ComposioToolSet, App

def composio_slack_tool():
    composio_toolset = ComposioToolSet()
    return composio_toolset.get_tools(apps=[App.SLACK])