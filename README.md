# Python SDKs of Composio 
1. Core - To access base APIs
2. Autogen - Use Composio tools with Autogen
3. CrewAI - Use Composio tools with CrewAI
4. Langchain - Use Composio tools with Langchain

## Development Environement Setup

- Ensure your machine has `Python>=3.8,<4` and `pipenv` installed
- Clone the repository:
    ```
    git clone git@github.com:SamparkAI/composio_sdk
    ```
- Create and launch a virtual environment. Also, run this during development, every time you need to re-create and launch the virtual environment and update the dependencies:
    ```
      make env && pipenv shell
    ```
