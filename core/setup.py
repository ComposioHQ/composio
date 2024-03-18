from setuptools import setup
import os 

def get_current_dir():
    return os.path.dirname(os.path.realpath(__file__))

def resolve_paths(*paths):
    return os.path.join(*paths)

readme_path = resolve_paths(get_current_dir(), 'README.md')


from setuptools import setup
from setuptools.command.install import install
from .composio.sdk import ComposioSdk

class InstallCommandMiddleware(install):
    """Customized setuptools install command."""
    def run(self):
        install.run(self)
        sdk_client = ComposioSdk()
        apps = sdk_client.get_list_of_apps()
        with open('composio/sdk/enums.py', 'w') as f:
            f.write('from enum import Enum\n\n')
            f.write('class Apps(Enum):\n')
            for app in apps:
                app_name = app['name'].upper().replace(' ', '_')
                f.write(f'    {app_name} = "{app["name"]}"\n')

setup(
    name = 'composio_core',
    version = '0.0.3',
    author = 'Utkarsh',
    author_email = 'utkarsh@composio.dev',
    description = 'Core package to act as a bridge between composio platform and other services.',
    long_description = open(readme_path).read(),
    long_description_content_type = 'text/markdown',
    url = 'https://github.com/SamparkAI/composio_sdk',
    classifiers = [
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: Apache Software License',
        'Operating System :: OS Independent'
    ],
    python_requires = '>=3.7',
    include_package_data = True,
    scripts = ['composio-cli'],
    cmdclass={
        'install': InstallCommandMiddleware,
    },
)
