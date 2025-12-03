# Changelog

All notable changes to the Composio Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.11] - 2025-09-10

### Added
- **Composio Connect Link Support**: New link() method for creating external authentication links
  - Added `link()` method to ConnectedAccounts class for generating user authentication links
  - Support for callback URL redirection after authentication
  - Enhanced user experience with external link-based authentication flow
  - Includes comprehensive documentation and usage examples

### Fixed
- **Documentation**: Fixed typo in connected account creation function docstring
  - Corrected "coneected" to "connected" in function documentation

## [0.8.10] - 2024-12-19

### Added
- **LlamaIndex Provider**: New LlamaIndex provider for enhanced AI framework integration
  - Complete provider implementation with demo and documentation (`python/providers/llamaindex/`)
  - Support for LlamaIndex-specific tool execution patterns
  - Includes provider.py, demo script, and proper packaging setup

### Changed
- **Schema Parsing**: Improved OpenAPI schema parsing with default fallback to 'any' type for invalid schemas
  - Enhanced `python/composio/utils/openapi.py` to handle malformed schemas gracefully
  - More robust type inference for edge cases where schema type is missing or invalid

### Fixed
- **Type Checking**: Fixed type checking issues in core validation logic
  - Updated `python/composio/core/models/toolkits.py` for better type safety
  - Added proper type annotations and validation
- **Sentinel Value Checks**: Fixed sentinel value validation in core models
  - Enhanced validation in `python/composio/core/models/toolkits.py`
  - Improved handling in `python/composio/core/models/tools.py` and `python/composio/core/models/triggers.py`
  - Added proper sentinel value checks in `python/composio/types.py`
- **Build System**: Updated noxfile.py for improved development workflow

## [0.8.9] - 2024-11-XX

### Added
- Initial stable release with core functionality
- Support for multiple AI frameworks (OpenAI, Anthropic, Google, etc.)
- Comprehensive tool execution capabilities
- Authentication and connected account management
- File upload and download support
- Webhook and trigger system
- Multi-provider support architecture

### Features
- Tool discovery and execution
- Connected account management
- Authentication configuration
- File handling and processing
- Webhook integration
- Trigger system for automated workflows
- Support for custom tools and integrations

---

## Version History

For detailed commit history and technical changes, see the [Git commit log](https://github.com/composio/composio/commits/main).

## Support

For questions, issues, or contributions, please visit:
- [GitHub Repository](https://github.com/composio/composio)
- [Documentation](https://docs.composio.dev)
- [Community Discord](https://discord.gg/composio)