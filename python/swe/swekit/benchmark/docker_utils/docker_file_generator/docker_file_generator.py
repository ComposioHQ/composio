import logging
import os

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


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("build_docker")


class DockerfileGenerator:
    def __init__(
        self,
        swe_bench_tasks: str,
        namespace: str = "aorwall",
        docker_dir: str = "docker",
        predictions_path: str = None,
        is_testbed: bool = False,
    ):
        self.namespace = namespace
        self.docker_dir = docker_dir
        self.task_instances = list(get_eval_refs(swe_bench_tasks).values())

        self.image_prefix = "swe-bench"

        self.dockerfiles_to_build = [
            (
                "docker/Dockerfile.swe_agent",
                f"{self.namespace}/swe-agent",
            ),
        ]
        script_dir = os.path.join(os.path.dirname(__file__), "../templates")
        env = Environment(loader=FileSystemLoader(script_dir))
        self.base_swe_agent_tmpl = env.get_template("Dockerfile.base")
        self.swe_dockerfile_tmpl = env.get_template("Dockerfile.swe")
        self.instance_template = env.get_template("Dockerfile.pyenv_instance")
        self.getconda_path = os.path.relpath(
            script_dir, os.path.join(script_dir, "getconda.sh")
        )
        self.install_composio_path = os.path.join(
            os.path.relpath(script_dir, "install_composio.sh"), "install_composio.sh"
        )
        if predictions_path:
            predictions = get_instances(predictions_path)
            self.instance_ids = set([p["instance_id"] for p in predictions])
            logger.info(f"Found {len(self.instance_ids)} in predictions file")
        else:
            self.instance_ids = None

    def generate(self):
        testbeds = set()
        task_instances_grouped = self.group_task_instances(self.task_instances)

        self.generate_swe_agent_base()

        for repo, map_version_to_instances in task_instances_grouped.items():
            logger.info(f"Repo {repo}: {len(map_version_to_instances)} versions")

            # Determine instances to use for environment installation
            for version, instances in map_version_to_instances.items():
                if self.instance_ids:
                    instances = [
                        instance
                        for instance in instances
                        if instance["instance_id"] in self.instance_ids
                    ]
                    if not instances:
                        logger.info(f"No instances for {repo} {version}")
                        continue

                logger.info(f"\tVersion {version}: {len(instances)} instances")

                repo_name = _repo_name(repo)

                specifications = MAP_VERSION_TO_INSTALL[repo][version]

                # use_conda = repo not in PYENV_REPOS

                if repo_name not in testbeds:
                    # deb_packages = None
                    # if repo in MAP_REPO_TO_DEB_PACKAGES:
                    # deb_packages = MAP_REPO_TO_DEB_PACKAGES[repo]
                    # if use_conda:
                    #     self.generate_conda_repository_dockerfile(repo, deb_packages)
                    # else:
                    #     self.generate_pyenv_repository_dockerfile(repo, deb_packages)

                    testbeds.add(repo_name)

                self.generate_swe_dockerfile(
                    repo=repo,
                    version=version,
                    setup_ref_instance=instances[0],
                    specifications=specifications,
                )
                for each_instance in instances:
                    if (
                        "instance_image" in specifications
                        and specifications["instance_image"]
                    ):
                        for instance in instances:
                            install_cmd = specifications["install"]
                            self.generate_instance_dockerfile(
                                instance=instance,
                                install_cmd=install_cmd,
                            )

            self.create_makefile()
            self.generate_docker_compose()

        for dockerfile, image_name in self.dockerfiles_to_build:
            print(f"docker build -t {image_name} -f {dockerfile} .")

    def create_makefile(self):
        with open("Makefile", "w") as f:
            f.write("all:\n")
            for dockerfile, image_name in self.dockerfiles_to_build:
                f.write(f"\tdocker build -t {image_name} -f {dockerfile} .\n")

    def group_task_instances(self, task_instances):
        task_instances_grouped = {}
        for instance in task_instances:
            # Group task instances by repo, version
            repo = instance["repo"]
            version = instance["version"] if "version" in instance else None
            if repo not in task_instances_grouped:
                task_instances_grouped[repo] = {}
            if version not in task_instances_grouped[repo]:
                task_instances_grouped[repo][version] = []
            task_instances_grouped[repo][version].append(instance)

        return task_instances_grouped

    def generate_docker_compose(self):
        import yaml

        services = {}
        for dockerfile, image_name in self.dockerfiles_to_build:
            service_name = image_name.split("/")[
                -1
            ]  # Use the image name as the service name
            services[service_name] = {
                "build": {"context": ".", "dockerfile": dockerfile},
                "image": image_name,
            }

        docker_compose_dict = {"version": "3.8", "services": services}

        docker_compose_path = os.path.join(self.docker_dir, "docker-compose.yml")
        with open(docker_compose_path, "w") as f:
            yaml.dump(docker_compose_dict, f, default_flow_style=False)

        print(f"docker-compose.yml generated at: {docker_compose_path}")

    def generate_swe_dockerfile(
        self,
        repo: str,
        version: str,
        specifications: dict,
        setup_ref_instance: dict,
        use_conda: bool = True,
    ):
        repo_name = _repo_name(repo)
        repo_image_name = repo.replace("/", "_")

        env_name = f"{repo_name}__{version}"

        test_bed_dir = f"{self.docker_dir}/{repo_name}/{version}"

        environment_setup_commit = setup_ref_instance.get(
            "environment_setup_commit", setup_ref_instance["base_commit"]
        )

        path_to_reqs = None
        path_to_env_file = None
        install_cmds = []

        testbed_dir = f"{self.docker_dir}/{repo_name}/{version}"
        if not os.path.exists(testbed_dir):
            os.makedirs(testbed_dir)

        pre_install_cmds = specifications.get("pre_install", None)

        pip_packages = specifications.get("pip_packages", [])

        # Create conda environment according to install instructinos
        pkgs = specifications["packages"] if "packages" in specifications else ""
        if pkgs == "requirements.txt":
            # Create environment
            conda_create_cmd = (
                f"conda create -n {env_name} python={specifications['python']} -y"
            )
            path_to_reqs = get_requirements(setup_ref_instance, save_path=test_bed_dir)

            if specifications["python"] == "3.5":
                install_cmds.append(
                    "pip install --trusted-host pypi.python.org --trusted-host files.pythonhosted.org --trusted-host pypi.org -r requirements.txt"
                )
            else:
                install_cmds.append("pip install -r requirements.txt")
        elif pkgs == "environment.yml":
            # if not use_conda:
            #    raise ValueError(f"Can't create non conda docker image with environment.yml set")

            if "no_use_env" in specifications and specifications["no_use_env"]:
                # Create environment from yml
                path_to_env_file = get_environment_yml(
                    setup_ref_instance, env_name, save_path=test_bed_dir
                )
                conda_create_cmd = f"conda create -c conda-forge -n {env_name} python={specifications['python']} -y"

                # Install dependencies
                install_cmds.append("conda env update -f environment.yml")
            else:
                # Create environment from yml
                path_to_env_file = get_environment_yml(
                    setup_ref_instance,
                    env_name,
                    save_path=test_bed_dir,
                    python_version=specifications["python"],
                )

                conda_create_cmd = "conda env create -f environment.yml"
        elif use_conda:
            conda_create_cmd = f"conda create -n {env_name} python={specifications['python']} {pkgs} -y"
        else:
            conda_create_cmd = None
            pip_packages.extend(pkgs.split())

        # Install additional packages if specified
        if pip_packages:
            pip_packages = " ".join(pip_packages)
            install_cmds.append(f"pip install {pip_packages}")

        if "install" in specifications and (
            "instance_image" not in specifications
            or not specifications["instance_image"]
        ):
            install_cmds.append(specifications["install"])

        repo_name = _repo_name(repo)

        base_image = (
            f"{self.namespace}/{self.image_prefix}-{repo_image_name}:bookworm-slim"
        )
        pyenv_image = f"{self.namespace}/swe-bench-pyenvs:bookworm-slim"

        python_version = specifications["python"]
        if use_conda:
            template = self.swe_dockerfile_tmpl
        else:
            python_version = PYTHON_ENVIRONMENT_VERSIONS[python_version]
            template = self.swe_dockerfile_tmpl

        dockerfile_content = template.render(
            base_image=base_image,
            pyenv_image=pyenv_image,
            docker_dir=self.docker_dir,
            repo_name=repo_name,
            version=version,
            testbed=repo_name + "__" + version,
            python_version=python_version,
            conda_create_cmd=conda_create_cmd,
            pre_install_cmds=pre_install_cmds,
            install_cmds=install_cmds,
            path_to_reqs=path_to_reqs,
            environment_setup_commit=environment_setup_commit,
            path_to_env_file=path_to_env_file,
            getconda_script_path=self.getconda_path,
        )

        testbed_dir = f"{self.docker_dir}/{repo_name}/{version}"
        if not os.path.exists(testbed_dir):
            os.makedirs(testbed_dir)

        output_file = f"{testbed_dir}/Dockerfile"
        with open(output_file, "w") as f:
            f.write(dockerfile_content)

        print(f"Dockerfile generated: {output_file}")

        self.dockerfiles_to_build.append(
            (
                output_file,
                f"{self.namespace}/{self.image_prefix}-{repo_image_name}-testbed:{version}",
            )
        )

    def generate_swe_agent_base(self):
        template = self.base_swe_agent_tmpl
        base_dir = f"{self.docker_dir}"
        dockerfile_content = template.render(
            install_composio_path=self.install_composio_path
        )
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)

        output_file = f"{base_dir}/Dockerfile.swe_agent"
        with open(output_file, "w") as f:
            f.write(dockerfile_content)

        print(f"Dockerfile generated: {output_file}")

    def generate_testbed_dockerfile(
        self,
        repo: str,
        version: str,
        specifications: dict,
        setup_ref_instance: dict,
        use_conda: bool = False,
    ):
        repo_name = _repo_name(repo)
        repo_image_name = repo.replace("/", "_")

        env_name = f"{repo_name}__{version}"

        test_bed_dir = f"{self.docker_dir}/{repo_name}/{version}"

        environment_setup_commit = setup_ref_instance.get(
            "environment_setup_commit", setup_ref_instance["base_commit"]
        )

        path_to_reqs = None
        path_to_env_file = None
        install_cmds = []

        testbed_dir = f"{self.docker_dir}/{repo_name}/{version}"
        if not os.path.exists(testbed_dir):
            os.makedirs(testbed_dir)

        pre_install_cmds = specifications.get("pre_install", None)

        pip_packages = specifications.get("pip_packages", [])

        # Create conda environment according to install instructinos
        pkgs = specifications["packages"] if "packages" in specifications else ""
        if pkgs == "requirements.txt":
            # Create environment
            conda_create_cmd = (
                f"conda create -n {env_name} python={specifications['python']} -y"
            )
            path_to_reqs = get_requirements(setup_ref_instance, save_path=test_bed_dir)

            if specifications["python"] == "3.5":
                install_cmds.append(
                    "pip install --trusted-host pypi.python.org --trusted-host files.pythonhosted.org --trusted-host pypi.org -r requirements.txt"
                )
            else:
                install_cmds.append("pip install -r requirements.txt")
        elif pkgs == "environment.yml":
            # if not use_conda:
            #    raise ValueError(f"Can't create non conda docker image with environment.yml set")

            if "no_use_env" in specifications and specifications["no_use_env"]:
                # Create environment from yml
                path_to_env_file = get_environment_yml(
                    setup_ref_instance, env_name, save_path=test_bed_dir
                )
                conda_create_cmd = f"conda create -c conda-forge -n {env_name} python={specifications['python']} -y"

                # Install dependencies
                install_cmds.append("conda env update -f environment.yml")
            else:
                # Create environment from yml
                path_to_env_file = get_environment_yml(
                    setup_ref_instance,
                    env_name,
                    save_path=test_bed_dir,
                    python_version=specifications["python"],
                )

                conda_create_cmd = "conda env create -f environment.yml"
        elif use_conda:
            conda_create_cmd = f"conda create -n {env_name} python={specifications['python']} {pkgs} -y"
        else:
            conda_create_cmd = None
            pip_packages.extend(pkgs.split())

        # Install additional packages if specified
        if pip_packages:
            pip_packages = " ".join(pip_packages)
            install_cmds.append(f"pip install {pip_packages}")

        if "install" in specifications and (
            "instance_image" not in specifications
            or not specifications["instance_image"]
        ):
            install_cmds.append(specifications["install"])

        repo_name = _repo_name(repo)

        base_image = (
            f"{self.namespace}/{self.image_prefix}-{repo_image_name}:bookworm-slim"
        )
        pyenv_image = f"{self.namespace}/swe-bench-pyenvs:bookworm-slim"

        python_version = specifications["python"]
        if use_conda:
            template = self.swe_dockerfile_tmpl
        else:
            python_version = PYTHON_ENVIRONMENT_VERSIONS[python_version]
            template = self.swe_dockerfile_tmpl

        dockerfile_content = template.render(
            base_image=base_image,
            pyenv_image=pyenv_image,
            docker_dir=self.docker_dir,
            repo_name=repo_name,
            version=version,
            testbed=repo_name + "__" + version,
            python_version=python_version,
            conda_create_cmd=conda_create_cmd,
            pre_install_cmds=pre_install_cmds,
            install_cmds=install_cmds,
            path_to_reqs=path_to_reqs,
            environment_setup_commit=environment_setup_commit,
            path_to_env_file=path_to_env_file,
            getconda_script_path=self.getconda_path,
        )

        testbed_dir = f"{self.docker_dir}/{repo_name}/{version}"
        if not os.path.exists(testbed_dir):
            os.makedirs(testbed_dir)

        output_file = f"{testbed_dir}/Dockerfile"
        with open(output_file, "w") as f:
            f.write(dockerfile_content)

        print(f"Dockerfile generated: {output_file}")

        self.dockerfiles_to_build.append(
            (
                output_file,
                f"{self.namespace}/{self.image_prefix}-{repo_image_name}-testbed:{version}",
            )
        )

    def generate_instance_dockerfile(
        self,
        instance: dict,
        install_cmd: str,
    ):
        """
        Build one Docker image per benchmark instance to not have to build the environment each time before testing in
        repositories using Cython.
        """
        repo = instance["repo"]
        version = instance["version"]
        repo_name = _repo_name(repo)
        repo_image_name = repo.replace("/", "_")

        base_image = f"{self.namespace}/{self.image_prefix}-{repo_image_name}-testbed:{instance['version']}"

        dockerfile_content = self.instance_template.render(
            base_image=base_image,
            repo_name=repo_name,
            install_cmd=install_cmd,
            base_commit=instance["base_commit"],
        )

        instance_dir = (
            f"{self.docker_dir}/{repo_name}/{version}/{instance['instance_id']}"
        )
        if not os.path.exists(instance_dir):
            os.makedirs(instance_dir)

        output_file = f"{instance_dir}/Dockerfile"
        with open(output_file, "w") as f:
            f.write(dockerfile_content)

        print(f"Dockerfile generated: {output_file}")

        self.dockerfiles_to_build.append(
            (
                output_file,
                f"{self.namespace}/{self.image_prefix}-{repo_image_name}-instance:{instance['instance_id']}",
            )
        )


def _repo_name(repo: str) -> str:
    return repo.replace("/", "__")


class DockerGeneratorArgs(BaseModel):
    swe_bench_tasks_path: str = Field(
        ..., description="Path to candidate task instances file"
    )
    namespace: str = Field(..., description="Docker repository namespace")
    prediction_path: str = Field(..., description="Path to predictions file")
    docker_dir: str = Field(..., description="Path to docker directory")
    is_testbed: bool = Field(
        default=False, description="if dockerfile needs to be genrated for testbed"
    )


if __name__ == "__main__":
    args = DockerGeneratorArgs(
        swe_bench_tasks_path="princeton-nlp/SWE-bench_Lite",
        namespace="techcomposio",
        prediction_path="",
        docker_dir="./swe_bench_docker/docker",
    )
    generator = DockerfileGenerator(
        args.swe_bench_tasks_path,
        args.namespace,
        args.docker_dir,
        args.prediction_path,
        args.is_testbed,
    )
    generator.generate()
