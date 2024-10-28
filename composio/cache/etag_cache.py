from typing import Dict, Optional, Tuple, Any
import json
from datetime import datetime
import hashlib

class ETagCache:
    def __init__(self):
        self._cache: Dict[str, Tuple[str, Any, datetime]] = {}  # {url: (etag, data, timestamp)}

    def get_cached_response(self, url: str) -> Tuple[Optional[str], Optional[Any]]:
        """
        Retrieve cached data and ETag for a given URL.
        
        Args:
            url: The URL of the API endpoint
            
        Returns:
            Tuple of (ETag, cached_data) if exists, else (None, None)
        """
        if url in self._cache:
            etag, data, _ = self._cache[url]
            return etag, data
        return None, None

    def update_cache(self, url: str, etag: str, data: Any) -> None:
        """
        Update the cache with new response data and ETag.
        
        Args:
            url: The URL of the API endpoint
            etag: ETag value from the response
            data: Response data to cache
        """
        self._cache[url] = (etag, data, datetime.now())

    def generate_etag(self, data: Any) -> str:
        """
        Generate an ETag for the given data if server doesn't provide one.
        
        Args:
            data: Response data to generate ETag for
            
        Returns:
            Generated ETag string
        """
        data_str = json.dumps(data, sort_keys=True)
        return hashlib.md5(data_str.encode()).hexdigest()

    def clear(self) -> None:
        """Clear all cached data."""
        self._cache.clear()

    def remove(self, url: str) -> None:
        """
        Remove cached data for a specific URL.
        
        Args:
            url: The URL to remove from cache
        """
        self._cache.pop(url, None)