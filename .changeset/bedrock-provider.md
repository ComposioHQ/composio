---
"@composio/bedrock": minor
---

Add AWS Bedrock provider with support for Anthropic Claude models

This changeset introduces a new provider package for AWS Bedrock integration:

- **New Package**: `@composio/bedrock` - Non-agentic provider for AWS Bedrock
- **Converse API Support**: Full support for AWS Bedrock's Converse API
- **Anthropic Claude Models**: Support for all Claude 3.x models on Bedrock
- **Inference Profiles**: Documentation and support for cross-region inference profiles
- **IAM Role Authentication**: Seamless integration with Lambda execution roles
- **Tool Execution**: Complete tool wrapping and execution handlers
- **Comprehensive Documentation**: README, examples, and API reference
- **TypeScript Support**: Full type definitions and type safety
- **Examples**: Basic usage, Lambda handler, and agentic loop examples

**Features:**
- Lambda-friendly with automatic IAM role credentials
- Cross-region inference profile support
- Error handling and logging
- Comprehensive test suite
