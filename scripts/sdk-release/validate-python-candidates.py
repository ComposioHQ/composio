"""Check the built stable train against the frozen project metadata."""
import email.parser
import pathlib
import tarfile
import tomllib
import zipfile

from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name

root = pathlib.Path(__file__).resolve().parents[2]
projects = [root / 'python', *sorted((root / 'python/providers').glob('*/pyproject.toml'))]
projects = [path.parent if path.is_file() else path for path in projects]
distributions = root / 'python/dist'
expected = set()


def requirement(value):
    parsed = Requirement(value)
    return (canonicalize_name(parsed.name), tuple(sorted(parsed.extras)), str(parsed.specifier), str(parsed.marker or ''))


for directory in projects:
    project = tomllib.loads((directory / 'pyproject.toml').read_text())['project']
    name = canonicalize_name(project['name'])
    version = project['version']
    wheels = list(distributions.glob(f'{name.replace("-", "_")}-{version}-*.whl'))
    sdists = list(distributions.glob(f'{name.replace("-", "_")}-{version}.tar.gz'))
    assert len(wheels) == len(sdists) == 1, f'Expected one wheel and sdist for {name}'
    expected.update([wheels[0].name, sdists[0].name])
    with zipfile.ZipFile(wheels[0]) as wheel:
        metadata_paths = [path for path in wheel.namelist() if path.endswith('.dist-info/METADATA')]
        assert len(metadata_paths) == 1
        metadata = email.parser.BytesParser().parsebytes(wheel.read(metadata_paths[0]))
        assert any(path.endswith('/py.typed') for path in wheel.namelist()), f'Missing typed marker: {name}'
    with tarfile.open(sdists[0]) as sdist:
        package_info = [entry for entry in sdist.getmembers() if entry.name.count('/') == 1 and entry.name.endswith('/PKG-INFO')]
        assert len(package_info) == 1
        stream = sdist.extractfile(package_info[0])
        assert stream is not None
        sdist_metadata = email.parser.BytesParser().parsebytes(stream.read())
    for built in [metadata, sdist_metadata]:
        assert canonicalize_name(built['Name']) == name and built['Version'] == version
        assert SpecifierSet(built['Requires-Python'] or '') == SpecifierSet(project.get('requires-python', '')), f'Python requirement changed: {name}'
        actual = [requirement(value) for value in built.get_all('Requires-Dist', []) if 'extra ==' not in value]
        wanted = [requirement(value) for value in project.get('dependencies', [])]
        assert sorted(actual) == sorted(wanted), f'Dependency metadata changed: {name}'

actual = {path.name for path in distributions.iterdir() if path.name.endswith(('.whl', '.tar.gz'))}
assert actual == expected, f'Distribution inventory mismatch: {actual ^ expected}'
print(f'Validated {len(projects)} projects and {len(expected)} distributions')
