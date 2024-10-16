import typing as t
from pathlib import Path

import click
from jinja2 import Environment, FileSystemLoader
from swebench import MAP_REPO_VERSION_TO_SPECS
from swebench.harness.utils import load_swebench_dataset

from composio.utils.logging import WithLogger

from swekit.benchmark.docker_utils.docker_file_generator.utils import get_requirements


SCRIPTS_DIR = Path(__file__).parent / "scripts"
TEMPLATES_DIR = Path(__file__).parent / "templates"


def group_task_instances(task_instances):
    groups = {}
    for instance in task_instances:
        repo = instance["repo"]
        version = instance.get("version")
        if repo not in groups:
            groups[repo] = {}
        if version not in groups[repo]:
            groups[repo][version] = []
        groups[repo][version].append(instance)
    return groups


class DockerfileGenerator(WithLogger):
    def __init__(
        self,
        dataset: str,
        author: str = "aorwall",
        outdir: str = "docker",
        predictions_path: t.Optional[str] = None,
    ):
        super().__init__()
        self.author = author
        self.dataset = dataset
        self.outdir = Path(outdir)
        if not self.outdir.exists():
            self.outdir.mkdir()

        self.jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
        self.tmpl_swe = self.jinja_env.get_template("Dockerfile.swe")
        self.tmpl_base = self.jinja_env.get_template("Dockerfile.pyenv")
        self.tmpl_base = self.jinja_env.get_template("Dockerfile.base")

        self.getconda_path = TEMPLATES_DIR / "getconda.sh"
        self.install_composio_path = TEMPLATES_DIR / "install_composio.sh"

        self.instance_ids = None
        self.image_prefix = "swe-bench"

    def generate(self):
        task_instances = load_swebench_dataset(name=self.dataset)
        task_instance_groups = group_task_instances(task_instances)
        for repo, versions in task_instance_groups.items():
            self.logger.info(f"Repo {repo} with {set(versions.keys())} versions")
            for version, instances in versions.items():
                if self.instance_ids:
                    instances = [
                        instance
                        for instance in instances
                        if instance["instance_id"] in self.instance_ids
                    ]
                    if not instances:
                        self.logger.info(f"No instances for {repo} {version}")
                        continue

                self.logger.info(f"\tGenerating for version - {version}")
                self.generate_swe_dockerfile(
                    repository=repo,
                    version=version,
                    setup_ref_instance=instances[0],
                    specifications=MAP_REPO_VERSION_TO_SPECS[repo][version],
                )

    def generate_base(self, version: str) -> str:
        """Generate python bases."""
        basedir = self.outdir / "base"
        if not basedir.exists():
            basedir.mkdir()

        outfile = basedir / f"Dockerfile.py{version}"
        outfile.write_text(self.tmpl_base.render(python=version))
        return f"composio/swe:py{version}"

    def _get_dependency_name(self, dependency: str) -> str:
        if "==" in dependency:
            return dependency.split("==")[0]

        if "," in dependency:
            dependency = dependency.split(",")[0].strip()

        if ";" in dependency:
            dependency = dependency.split(";")[0].strip()

        if ">" in dependency:
            return dependency.split(">")[0]

        if "<" in dependency:
            return dependency.split("<")[0]

        return dependency

    def _cleanup_dependencies(self, dependencies: t.List[str]) -> t.List[str]:
        _dependencies = []

        def _check(dependency: str) -> bool:
            for _dependency in _dependencies:
                if (
                    self._get_dependency_name(dependency=dependency).lower()
                    == self._get_dependency_name(dependency=_dependency).lower()
                ):
                    return False
            return True

        for dependency in dependencies:
            if _check(dependency=dependency):
                _dependencies.append(dependency.replace('"', "'"))
        return _dependencies

    def generate_swe_dockerfile(
        self,
        repository: str,
        version: str,
        specifications: dict,
        setup_ref_instance: dict,
    ):
        outname = _repo_name(repository)
        outdir = self.outdir / outname / version
        outdir.mkdir(exist_ok=True, parents=True)

        requirements = None
        dependencies = specifications.get("pip_packages", [])
        packages = specifications["packages"] if "packages" in specifications else ""
        if packages == "requirements.txt":
            requirements = get_requirements(
                instance=setup_ref_instance,
                save_path=str(outdir),
            )
        elif packages == "environment.yml":
            pass
        else:
            dependencies.extend(packages.split())

        dependencies = [
            f'"{d}"' for d in self._cleanup_dependencies(dependencies=dependencies) if d
        ]
        if dependencies and specifications["python"] in ("3.5", "3.6"):
            dependencies += [
                "--trusted-host pypi.org",
                "--trusted-host pypi.python.org",
                "--trusted-host files.pythonhosted.org",
            ]

        _, reponame = repository.split("/")
        output_file = outdir / "Dockerfile"
        with open(output_file, "w") as f:
            f.write(
                self.tmpl_swe.render(
                    baseimage=self.generate_base(version=specifications["python"]),
                    install=specifications["install"].replace("python -m ", ""),
                    repository=repository,
                    preinstall=specifications.get("pre_install", None),
                    reponame=reponame,
                    dependencies=" ".join(dependencies),
                    basecommit=setup_ref_instance["base_commit"],
                    requirements=requirements,
                )
            )


def _repo_name(repo: str) -> str:
    return repo.replace("/", "__")


@click.command(name="generate")
@click.option(
    "-d",
    "--dataset",
    type=str,
    help="Name of the dataset.",
    default="princeton-nlp/SWE-bench_Verified",
)
@click.option(
    "-a",
    "--author",
    type=str,
    help="Author name for the images.",
    default="composio",
)
@click.option(
    "-o",
    "--output",
    "outdir",
    type=str,
    help="Output directory for the generated images",
    default="./generated",
)
def generate(dataset: str, author: str, outdir: str) -> None:
    """Generate Dockerfiles for SWE-Bench."""
    DockerfileGenerator(
        dataset=dataset,
        author=author,
        outdir=outdir,
    ).generate()


if __name__ == "__main__":
    generate()
