from setuptools import setup
import os 

def get_current_dir():
    return os.path.dirname(os.path.realpath(__file__))

def resolve_paths(*paths):
    return os.path.join(*paths)

readme_path = resolve_paths(get_current_dir(), 'README.md')

setup(
    name = 'composio-llamaindex',
    version = '0.0.4',
    author = 'Karan',
    author_email = 'karan@composio.dev',
    description = 'Provides integrations skill with 50+ services in LlamaIndex',
    long_description = open(readme_path).read(),
    long_description_content_type = 'text/markdown',
    url = 'https://github.com/SamparkAI/llama-composio',
    classifiers = [
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: Apache Software License',
        'Operating System :: OS Independent'
    ],
    python_requires = '>=3.7',
    include_package_data = True,
    scripts = ['composio-llamaindex'],
)
