from composio.tools.local.browsertool.actions.media_analysis import MediaAnalysis, MediaAnalysisRequest, ModelChoice

def main():
    media_analysis = MediaAnalysis()

    # Test with GPT-4 Vision
    gpt4_request = MediaAnalysisRequest(
        media_paths=[
            "https://i.pinimg.com/originals/ea/fd/16/eafd1603d0937a7fe51208013cc84eb2.jpg"
        ],  # Keep image paths blank as instructed
        model=ModelChoice.GPT4_VISION,
        prompt="Describe what you see in the image.",
    )

    gpt4_response = media_analysis.execute(gpt4_request, {})
    print(f"Analysis: {gpt4_response.analysis}\n, Error: {gpt4_response.error_message}")

    # Test with Claude
    claude_request = MediaAnalysisRequest(
        media_paths=[
            "https://i.pinimg.com/originals/ea/fd/16/eafd1603d0937a7fe51208013cc84eb2.jpg"
        ],  # Keep image paths blank as instructed
        model=ModelChoice.CLAUDE_3_SONNET,
        prompt="Analyze the contents of the image in detail.",
    )

    print("Testing Claude:")
    claude_response = media_analysis.execute(claude_request, {})
    print(f"Analysis: {claude_response.analysis}\n, Error: {claude_response.error_message}")

if __name__ == '__main__':
    main()
