from email.mime import base
import json
import logging
import os
from pathlib import Path
import typing as t

from composio.tools.env.factory import WorkspaceType
from composio.utils.logging import WithLogger
from gymnasium import spec
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel, Field
from swebench import MAP_VERSION_TO_INSTALL, get_eval_refs, get_instances

from swekit.benchmark.docker_utils.docker_file_generator.const import (
    PYTHON_ENVIRONMENT_VERSIONS,
)
from swekit.benchmark.docker_utils.docker_file_generator.utils import (
    get_environment_yml,
    get_requirements,
)

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
        tasks: str,
        author: str = "aorwall",
        outdir: str = "docker",
        predictions_path: t.Optional[str] = None,
    ):
        super().__init__()
        self.author = author
        self.tasks = tasks
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
        if predictions_path:
            self.instance_ids = {
                p["instance_id"] for p in get_instances(instance_path=predictions_path)
            }
            self.logger.info(f"Found {len(self.instance_ids)} in predictions file")

        self.image_prefix = "swe-bench"

    def generate(self):
        task_instances = get_eval_refs(data_path_or_name=self.tasks)
        task_instance_groups = group_task_instances(task_instances.values())
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
                    specifications=MAP_VERSION_TO_INSTALL[repo][version],
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


class DockerGeneratorArgs(BaseModel):
    swe_bench_tasks_path: str = Field(
        ...,
        description="Path to candidate task instances file",
    )
    author: str = Field(
        ...,
        description="Docker repository namespace",
    )
    prediction_path: str = Field(
        ...,
        description="Path to predictions file",
    )
    outdir: str = Field(
        ...,
        description="Path to docker directory",
    )
    is_testbed: bool = Field(
        default=False,
        description="if dockerfile needs to be genrated for testbed",
    )


if __name__ == "__main__":
    args = DockerGeneratorArgs(
        swe_bench_tasks_path="princeton-nlp/SWE-bench_Lite",
        author="composio",
        prediction_path="",
        outdir="./dockerfiles/generated/",
    )
    generator = DockerfileGenerator(
        tasks=args.swe_bench_tasks_path,
        author=args.author,
        outdir=args.outdir,
    )
    generator.generate()
