import tarfile
import io
import os
from pydantic import BaseModel

from tools.services.swelib.local_workspace.utils import get_container_by_container_name


class DockerFileManagerRequest(BaseModel):
    host_path: str = "./repo"
    container_path: str = "./root/"
    workspace_id: str = None
    container_name: str = None
    image_name: str = None


class DockerFileManager:
    def __init__(self, args: DockerFileManagerRequest):
        self.args = args
        self.container = get_container_by_container_name(self.args.container_name, self.args.image_name)

    def copy_to_container(self):
        host_path = self.args.host_path
        container_path = self.args.container_path
        # Create a tarfile with the file to copy
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as tar:
            tar.add(host_path, arcname=os.path.basename(host_path))
        stream.seek(0)

        # Copy tarfile to container
        self.container.put_archive(os.path.dirname(container_path), stream.read())


def execute_file_manager_copy(container_name, workspace_id, image_name):
    args: DockerFileManagerRequest = DockerFileManagerRequest(host_path="",
                                                              container_path="",
                                                              workspace_id=workspace_id,
                                                              container_name=container_name,
                                                              image_name=image_name)
    f = DockerFileManager(args)
    return {"resp": f"path copied from {f.args.host_path} to path: {f.args.container_path}"}


if __name__ == "__main":
    # Example usage
    docker_file_manager = DockerFileManager()
    docker_file_manager.copy_to_container()
