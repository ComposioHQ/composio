from typing import Optional, Any, Dict
import requests
from ..cache.etag_cache import ETagCache

class APIClient:
    def __init__(self):
        self.cache = ETagCache()
        self.session = requests.Session()

    def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> Any:
        """
        Perform GET request with ETag caching support.
        
        Args:
            url: The URL to request
            headers: Optional headers to include in the request
            
        Returns:
            Response data (either from cache or fresh response)
        """
        headers = headers or {}
        etag, cached_data = self.cache.get_cached_response(url)
        
        if etag:
            headers['If-None-Match'] = etag
        
        response = self.session.get(url, headers=headers)
        
        if response.status_code == 304:
            return cached_data
        
        if response.status_code == 200:
            response_etag = response.headers.get('ETag')
            if not response_etag:
                # Generate ETag if server doesn't provide one
                response_etag = self.cache.generate_etag(response.json())
            
            self.cache.update_cache(url, response_etag, response.json())
            return response.json()
        
        response.raise_for_status()