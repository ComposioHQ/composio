"""
Integration tests for ToolRouter functionality.

This module tests the experimental ToolRouter feature with clean Python API design.
"""

import os
import time

import pytest

from composio import Composio
from composio.exceptions import ValidationError


# Test configuration
API_KEY = os.getenv('COMPOSIO_API_KEY')

if not API_KEY:
    pytest.skip("COMPOSIO_API_KEY environment variable not set", allow_module_level=True)


@pytest.fixture
def composio_client():
    """Fixture providing Composio client instance."""
    return Composio(api_key=API_KEY)


class TestToolRouterStructure:
    """Test the basic structure and availability of ToolRouter features."""
    
    def test_experimental_tool_router_exists(self, composio_client):
        """Test that experimental.tool_router exists."""
        assert hasattr(composio_client.experimental, 'tool_router'), "Missing experimental.tool_router"
    
    def test_tool_router_methods_available(self, composio_client):
        """Test that required ToolRouter methods are available."""
        assert hasattr(composio_client.experimental.tool_router, 'create_session'), "Missing create_session method"


class TestToolRouterOperations:
    """Test ToolRouter operations."""
    
    def test_create_session_with_string_toolkits(self, composio_client):
        """Test creating tool router session with simple string toolkit names."""
        user_id = f'pytest-user-{int(time.time()) % 1000000}'
        
        session = composio_client.experimental.tool_router.create_session(
            user_id,
            toolkits=['composio_search', 'text_to_pdf']
        )
        
        # Basic validation
        assert session['session_id']
        assert session['url']
        assert isinstance(session['session_id'], str)
        assert isinstance(session['url'], str)
        assert len(session['url']) > 0
    
    def test_create_session_with_mixed_toolkits(self, composio_client):
        """Test creating session with mixed string and object formats."""
        user_id = f'pytest-mixed-{int(time.time()) % 1000000}'
        
        session = composio_client.experimental.tool_router.create_session(
            user_id,
            toolkits=[
                'composio_search',  # String format
                {
                    'toolkit': 'text_to_pdf',
                    # No auth_config_id needed for non-auth toolkit
                }  # Object format
            ],
            manually_manage_connections=False
        )
        
        # Basic validation
        assert session['session_id']
        assert session['url']
    
    def test_create_session_minimal(self, composio_client):
        """Test creating session with minimal parameters."""
        user_id = f'pytest-minimal-{int(time.time()) % 1000000}'
        
        session = composio_client.experimental.tool_router.create_session(user_id)
        
        # Should work even without toolkits specified
        assert session['session_id']
        assert session['url']


class TestToolRouterErrorHandling:
    """Test error handling and edge cases."""
    
    def test_create_session_with_empty_user_id(self, composio_client):
        """Test creating session with empty user ID."""
        with pytest.raises(ValidationError):
            composio_client.experimental.tool_router.create_session("")


class TestToolRouterRealWorldScenarios:
    """Test real-world usage scenarios."""
    
    def test_complete_session_workflow(self, composio_client):
        """Test complete workflow: create session -> use session details."""
        user_id = f'pytest-workflow-{int(time.time()) % 1000000}'
        
        print(f"🏗️  Creating tool router session for user: {user_id}")
        
        # Create session with non-auth toolkits
        session = composio_client.experimental.tool_router.create_session(
            user_id,
            toolkits=['composio_search', 'text_to_pdf'],
            manually_manage_connections=False
        )
        
        print("✅ Session created successfully!")
        print(f"   Session ID: {session['session_id']}")
        print(f"   Session URL: {session['url']}")
        
        # Validate session structure
        assert session['session_id']
        assert session['url']
        assert 'composio' in session['url']  # Should be a Composio URL
        
        print("🎉 ToolRouter workflow completed successfully!")
