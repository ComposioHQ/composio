from composio import Composio
import pytest

def test_new_github_version():
    """Test a new GitHub toolkit version before production deployment"""
    
    # Initialize with new version to test
    test_composio = Composio(
        api_key="YOUR_TEST_KEY",
        toolkit_versions={"github": "20250116_00"}
    )
    
    # Test basic tool execution
    result = test_composio.tools.execute(
        "GITHUB_CREATE_ISSUE",
        {
            "user_id": "test-user",
            "arguments": {
                "repo": "test-repo",
                "owner": "test-org",
                "title": "Test issue",
                "body": "Testing new version"
            }
        }
    )
    
    assert result["successful"] == True
    assert "issue_number" in result["data"]
    
    # Test tool fetching
    tools = test_composio.tools.get(
        user_id="test-user",
        toolkits=["github"]
    )
    
    assert len(tools) > 0
    assert all(tool.toolkit == "github" for tool in tools)
    
    print("✓ New version tests passed")
    return True

def test_version_compatibility():
    """Ensure new version maintains backward compatibility"""
    
    old_version = "20250110_00"
    new_version = "20250116_00"
    
    # Initialize with old version
    old_composio = Composio(
        api_key="YOUR_TEST_KEY",
        toolkit_versions={"github": old_version}
    )
    
    # Initialize with new version
    new_composio = Composio(
        api_key="YOUR_TEST_KEY",
        toolkit_versions={"github": new_version}
    )
    
    # Get tools from both versions
    old_tools = old_composio.tools.get(
        user_id="test-user",
        toolkits=["github"]
    )
    
    new_tools = new_composio.tools.get(
        user_id="test-user",
        toolkits=["github"]
    )
    
    # Check that essential tools still exist
    old_tool_slugs = {tool.slug for tool in old_tools}
    new_tool_slugs = {tool.slug for tool in new_tools}
    
    essential_tools = [
        "GITHUB_CREATE_ISSUE",
        "GITHUB_CREATE_PULL_REQUEST",
        "GITHUB_LIST_ISSUES"
    ]
    
    for tool in essential_tools:
        assert tool in new_tool_slugs, f"Essential tool {tool} missing in new version"
    
    print("✓ Backward compatibility verified")