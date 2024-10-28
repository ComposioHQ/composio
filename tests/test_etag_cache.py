import pytest
from datetime import datetime
from composio.cache.etag_cache import ETagCache

def test_cache_initialization():
    cache = ETagCache()
    assert len(cache._cache) == 0

def test_cache_update_and_retrieve():
    cache = ETagCache()
    url = "https://api.example.com/data"
    etag = "123abc"
    data = {"key": "value"}
    
    cache.update_cache(url, etag, data)
    cached_etag, cached_data = cache.get_cached_response(url)
    
    assert cached_etag == etag
    assert cached_data == data

def test_cache_missing_url():
    cache = ETagCache()
    url = "https://api.example.com/nonexistent"
    
    etag, data = cache.get_cached_response(url)
    assert etag is None
    assert data is None

def test_generate_etag():
    cache = ETagCache()
    data = {"key": "value"}
    data2 = {"key": "value"}
    data3 = {"key": "different"}
    
    etag1 = cache.generate_etag(data)
    etag2 = cache.generate_etag(data2)
    etag3 = cache.generate_etag(data3)
    
    assert etag1 == etag2  # Same data should generate same ETag
    assert etag1 != etag3  # Different data should generate different ETag

def test_cache_clear():
    cache = ETagCache()
    url = "https://api.example.com/data"
    cache.update_cache(url, "etag1", {"data": 1})
    
    cache.clear()
    assert len(cache._cache) == 0

def test_cache_remove():
    cache = ETagCache()
    url1 = "https://api.example.com/data1"
    url2 = "https://api.example.com/data2"
    
    cache.update_cache(url1, "etag1", {"data": 1})
    cache.update_cache(url2, "etag2", {"data": 2})
    
    cache.remove(url1)
    assert url1 not in cache._cache
    assert url2 in cache._cache