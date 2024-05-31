from composio.local_tools.greptile.codequery import CodeQuery, CodeQueryRequest


def test_execute():
    # Create a CodeQuery instance and a request
    code_query = CodeQuery()
    request = CodeQueryRequest(
        question="in which files are enum stored",
        genius=False,
        repository="https://github.com/samparkai/composio",
    )

    # Execute the method and get the response
    response = code_query.execute(request)
    print(response)
    # response is as expected
    assert response == {"response": "Mock response"}
