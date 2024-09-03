import json
import shutil
import subprocess
import typing as t
from pathlib import Path

import click
from swebench import get_eval_refs

from composio import Action, ComposioToolSet
from composio.utils.logging import WithLogger


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


def _repo_name(repo: str) -> str:
    return repo.replace("/", "__")


class IndexGenerator(WithLogger):
    def __init__(
        self,
        dataset: str,
        author: str = "aorwall",
        outdir: str = "docker",
    ):
        super().__init__()
        self.author = author
        self.dataset = dataset
        self.outdir = Path(outdir)
        if not self.outdir.exists():
            self.outdir.mkdir()

    def generate(self):
        task_instances = get_eval_refs(data_path_or_name=self.dataset)
        task_instance_groups = group_task_instances(task_instances.values())
        for repo, versions in task_instance_groups.items():
            self.logger.info(f"Repo {repo} with {set(versions.keys())} versions")
            for version, instances in versions.items():
                self.logger.info(f"\tGenerating for version - {version}")
                self.create_index(
                    repository=repo, version=version, setup_ref_instance=instances[0]
                )

    def create_index(
        self, repository: str, version: str, setup_ref_instance: t.Dict[str, t.Any]
    ):
        outname = _repo_name(repository)
        outdir = self.outdir / outname / version
        if outdir.exists():
            return
        repo_url = f"https://github.com/{repository}.git"
        base_commit = setup_ref_instance["base_commit"]
        if not (outdir / outname).exists():
            subprocess.run(
                ["git", "clone", "--depth", "1", repo_url, str(outdir / outname)],
                check=True,
            )
            subprocess.run(
                ["git", "fetch", "--depth", "1", "origin", base_commit],
                cwd=outdir / outname,
                check=True,
            )
            subprocess.run(
                ["git", "checkout", base_commit], cwd=outdir / outname, check=True
            )

        composio_toolset = ComposioToolSet()
        composio_toolset.execute_action(
            action=Action.CODE_ANALYSIS_TOOL_CREATE_CODE_MAP,
            params={"dir_to_index_path": str(outdir / outname)},
        )
        with open(f"{Path.home()}/.composio/tmp/{outname}/fqdn_cache.json") as f:
            fqdn_index = json.load(f)
            for k, v in fqdn_index.items():
                if len(v) >= 1:
                    for x in v:
                        x[
                            "global_module"
                        ] = f"/home/user/{repository.split('/')[-1]}/{k}"
                    fqdn_index[k] = v

        docker_outdir = Path("generated") / outname / version
        # docker_outdir.mkdir(exist_ok=True, parents=True)
        with open(
            docker_outdir / "fqdn_cache.json",
            "w",
        ) as f:
            json.dump(fqdn_index, f, indent=4)

        DEEPLAKE_PATH = docker_outdir / "deeplake"
        # DEEPLAKE_PATH.mkdir(exist_ok=True, parents=True)
        if not DEEPLAKE_PATH.exists():
            shutil.copytree(
                f"{Path.home()}/.composio/tmp/{outname}/deeplake",
                DEEPLAKE_PATH,
            )


@click.command(name="create_index")
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
    default="./indexed",
)
def create_index(dataset: str, author: str, outdir: str) -> None:
    """Create index for SWE-Bench."""
    IndexGenerator(
        dataset=dataset,
        author=author,
        outdir=outdir,
    ).generate()


if __name__ == "__main__":
    create_index()
