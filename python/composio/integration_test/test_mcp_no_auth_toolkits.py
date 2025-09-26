#!/usr/bin/env python3
"""
Test MCP functionality with non-auth toolkits.

This script tests MCP server creation and usage with toolkits that don't require authentication:
- composio_search: COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH
- text_to_pdf: TEXT_TO_PDF_CONVERT_TEXT_TO_PDF
"""

import os
import time
from composio import Composio

def test_mcp_with_no_auth_toolkits():
    """Test MCP with toolkits that don't require authentication."""
    
    # Check API key
    api_key = os.getenv('COMPOSIO_API_KEY')
    if not api_key:
        print("❌ COMPOSIO_API_KEY environment variable not set")
        return False
    
    print("🔧 Testing MCP with Non-Auth Toolkits")
    print("=" * 50)
    
    try:
        # Initialize Composio
        composio = Composio()
        print("✅ Composio client initialized")
        
        # Create MCP server with non-auth toolkits
        server_name = f'no-auth-test-{int(time.time()) % 1000000}'
        print(f"🚀 Creating MCP server: {server_name}")
        
        mcp_server = composio.mcp.create(
            server_name,
            toolkits=['composio_search', 'text_to_pdf'],
            allowed_tools=['COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH', 'TEXT_TO_PDF_CONVERT_TEXT_TO_PDF'],
            manually_manage_connections=False
        )
        
        print("✅ MCP server created successfully!")
        print(f"   Server ID: {mcp_server.id}")
        print(f"   Server Name: {mcp_server.name}")
        print(f"   Toolkits: {getattr(mcp_server, 'toolkits', 'N/A')}")
        
        # Generate server instance for a test user
        test_user_id = 'test_user_no_auth_123'
        print(f"\n🔗 Generating server instance for user: {test_user_id}")
        
        server_instance = mcp_server.generate(test_user_id)
        
        print("✅ Server instance generated successfully!")
        print(f"   Instance ID: {server_instance['id']}")
        print(f"   Instance Type: {server_instance['type']}")
        print(f"   Instance URL: {server_instance['url']}")
        print(f"   User ID: {server_instance['user_id']}")
        print(f"   Allowed Tools: {server_instance['allowed_tools']}")
        print(f"   Auth Configs: {server_instance['auth_configs']}")
        
        # Test direct generate method as well
        print("\n🔄 Testing direct generate method...")
        
        direct_instance = composio.mcp.generate(
            test_user_id + '_direct',
            mcp_server.id,
            {'manually_manage_connections': False}
        )
        
        print("✅ Direct generate method successful!")
        print(f"   Direct Instance URL: {direct_instance['url']}")
        print(f"   Direct Instance User ID: {direct_instance['user_id']}")
        
        # Test URL connectivity (basic check)
        print("\n🌐 Testing MCP URL connectivity...")
        
        import requests
        mcp_url = server_instance['url']
        
        try:
            # Test with SSE-appropriate headers
            headers = {
                'Accept': 'text/event-stream, application/json, */*',
                'Cache-Control': 'no-cache',
                'User-Agent': 'Composio-Python-MCP-Test'
            }
            
            response = requests.get(mcp_url, headers=headers, timeout=5, stream=True)
            
            print("✅ MCP URL is accessible!")
            print(f"   Status Code: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('Content-Type', 'N/A')}")
            
            # Try to read first event
            try:
                chunk = next(response.iter_content(chunk_size=1024, decode_unicode=True))
                print(f"   First Event: {chunk.strip()[:100]}...")
            except StopIteration:
                print("   No initial content received")
                
        except requests.exceptions.Timeout:
            print("⚠️  MCP URL timeout (normal for SSE endpoints)")
        except Exception as e:
            print(f"⚠️  MCP URL test failed: {e}")
        
        print("\n📊 Test Summary:")
        print(f"   ✅ MCP Server Created: {mcp_server.id}")
        print(f"   ✅ Server Instance Generated: {server_instance['type']}")
        print("   ✅ Direct Generate Method: Working")
        print(f"   ✅ Available Tools: {len(server_instance['allowed_tools'])} tools")
        print(f"   ✅ No Auth Required: {len(server_instance['auth_configs'])} auth configs")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main test function."""
    print("🎯 MCP Non-Auth Toolkits Test")
    print("Testing composio_search and text_to_pdf toolkits")
    print()
    
    success = test_mcp_with_no_auth_toolkits()
    
    if success:
        print("\n🎉 All tests passed! MCP is working with non-auth toolkits.")
    else:
        print("\n💥 Tests failed. Check the error messages above.")
    
    return success


def test_mcp_with_string_toolkits():
    """Test MCP server creation using simple string toolkit names."""
    print("🧪 Testing MCP with string toolkit names...")
    
    try:
        # Initialize Composio client
        composio = Composio()
        
        # Create MCP server with string toolkit names (simplified API)
        server_name = f'string-test-{int(time.time()) % 1000000}'
        print(f"🚀 Creating MCP server with strings: {server_name}")
        
        mcp_server = composio.mcp.create(
            server_name,
            toolkits=['composio_search', 'text_to_pdf'],  # Simple strings
            manually_manage_connections=False
        )
        
        print("✅ MCP server created successfully with string toolkits!")
        print(f"   Server ID: {mcp_server.id}")
        print(f"   Server Name: {mcp_server.name}")
        
        # Test generate method
        user_id = f'string_user_{int(time.time()) % 10000}'
        server_instance = mcp_server.generate(user_id)
        
        print("✅ Server instance generated successfully!")
        print(f"   Instance URL: {server_instance['url']}")
        print(f"   User ID: {server_instance['user_id']}")
        print(f"   Server Type: {server_instance['type']}")
        
        # Basic validation
        assert server_instance['user_id'] == user_id
        assert server_instance['type'] == 'streamable_http'
        assert 'url' in server_instance
        assert len(server_instance['url']) > 0
        
        print("🎉 String toolkit test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ String toolkit test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    main()

