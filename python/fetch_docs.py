import requests
from bs4 import BeautifulSoup
from whoosh.fields import Schema, TEXT
from whoosh.index import create_in
from whoosh.qparser import QueryParser
import os

# Step 1: Fetch the documentation
def fetch_documentation(url):
    response = requests.get(url)
    if response.status_code == 200:
        return response.text
    else:
        raise Exception(f"Failed to fetch the URL: {url}")

# Step 2: Parse the HTML content
def parse_html(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    for script in soup(["script", "style"]):
        script.extract()
    text = soup.get_text()
    return text

# Step 3: Create a schema for indexing
def create_schema():
    return Schema(content=TEXT(stored=True))

# Step 4: Create the index
def create_index(schema):
    if not os.path.exists("indexdir"):
        os.mkdir("indexdir")
    return create_in("indexdir", schema)

# Step 5: Add documentation to the index
def add_to_index(index, document):
    writer = index.writer()
    writer.add_document(content=document)
    writer.commit()

# Step 6: Search the index
def search_index(index, query_str):
    with index.searcher() as searcher:
        query = QueryParser("content", index.schema).parse(query_str)
        results = searcher.search(query)
        for result in results:
            print(result['content'])

# Main logic
if __name__ == "__main__":
    url = "https://docs.composio.dev/"
    html_content = fetch_documentation(url)
    parsed_text = parse_html(html_content)
    
    # Create schema and index
    schema = create_schema()
    index = create_index(schema)
    
    # Add parsed text to the index
    add_to_index(index, parsed_text)
    
    # Search the indexed content
    search_query = input("Enter search term: ")
    search_index(index, search_query)

