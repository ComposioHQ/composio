from setuptools import setup, find_packages

setup(
    name='ragdoctool',  
    version='0.1.0',
    packages=find_packages(),
    install_requires=[
        'composio-core',
        'PyPDF2',
        'pdfminer.six',
        'python-docx',
        'sentence-transformers',
        'chromadb',
        'tqdm',
        'nltk',  # If needed
    ],
    entry_points={
        'composio.tools': [
            'ragdoctool = composio.tools.local.ragdoctool:RagTool',  
        ],
    },
)
