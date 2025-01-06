"""Test script for arxiv research reporter example."""
import os
from dotenv import load_dotenv
from arxiv_research_reporter import main

# Set up environment variables
os.environ["OPENAI_API_KEY"] = "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"
os.environ["COMPOSIO_API_KEY"] = "6g3tsp0dz536olua9guxnh"

def test_arxiv_research():
    """Test the main functionality of arxiv research reporter."""
    try:
        main()
        print("Test completed successfully!")
        return True
    except Exception as e:
        print(f"Test failed with error: {str(e)}")
        return False

if __name__ == "__main__":
    test_arxiv_research()
