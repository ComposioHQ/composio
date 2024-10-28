import pytest
import responses
from composio.client.api_client import APIClient

@pytest.fixture
def api_client():
    return APIClient()

@responses.activate
def test_initial_request(api_client):
    url = "https://api.example.com/data"
    data = {"key": "value"}
    etag = "123abc"
    
    responses.add(
        responses.GET,
        url,
        json=data,
        status=200,
        headers={"ETag": etag}
    )
    
    response = api_client.get(url)
    assert response == data
    
    cached_etag, cached_data = api_client.cache.get_cached_response(url)
    assert cached_etag == etag
    assert cached_data == data

@responses.activate
def test_cached_response(api_client):
    url = "https://api.example.com/data"
    data = {"key": "value"}
    etag = "123abc"
    
    # Initial request
    responses.add(
        responses.GET,
        url,
        json=data,
        status=200,
        headers={"ETag": etag}
    )
    api_client.get(url)
    
    # Subsequent request with matching ETag
    responses.add(
        responses.GET,
        url,
        status=304
    )
    
    response = api_client.get(url)
    assert response == data

@responses.activate
def test_updated_response(api_client):
    url = "https://api.example.com/data"
    initial_data = {"key": "value1"}
    updated_data = {"key": "value2"}
    initial_etag = "123abc"
    updated_etag = "456def"
    
    # Initial request
    responses.add(
        responses.GET,
        url,
        json=initial_data,
        status=200,
        headers={"ETag": initial_etag}
    )
    api_client.get(url)
    
    # Updated content
    responses.replace(
        responses.GET,
        url,
        json=updated_data,
        status=200,
        headers={"ETag": updated_etag}
    )
    
    response = api_client.get(url)
    assert response == updated_data
    
    cached_etag, cached_data = api_client.cache.get_cached_response(url)
    assert cached_etag == updated_etag
    assert cached_data == updated_data