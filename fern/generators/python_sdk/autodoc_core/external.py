# coding=utf-8
# Copyright 2022 The HuggingFace Team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import re
import tempfile
import zlib

import git
import requests


HF_DOC_PREFIX = "https://huggingface.co/docs/"
EXTERNAL_DOC_OBJECTS_CACHE = {}
HUGGINFACE_LIBS = [
    "accelerate",
    "datasets",
    "evaluate",
    "huggingface_hub",
    "optimum",
    "tokenizers",
    "transformers",
    "trl",
]


def post_process_objects_inv(object_data, doc_url):
    """
    Post-processes the data in sphinx-like format to get a dictionary object_name: link in doc.

    Args:
        object_data (`str`): The data in the `objects.inv` object (except the first 4 lines).
        doc_url (`str`): The documentation url of the package.
    """
    links = {}
    for line in object_data:
        if len(line) == 0:
            continue
        name, typ, _, link = line.split(" ")[:4]
        if typ in ["py:class", "py:function", "py:method"]:
            link = link.replace("$", name)
            links[name] = f"{doc_url}/{link}"
    return links


def get_stable_version(package_name, repo_owner="huggingface", repo_name=None):
    """
    Gets the version of the last release of a package.

    Args:
        package_name (`str`): The name of the package.
        repo_owner (`str`): The owner of the GitHub repo.
        repo_name (`str`, *optional*, defaults to `package_name`):
            The name of the GitHub repo. If not provided, will be the same as the package name.
    """
    repo_name = repo_name if repo_name is not None else package_name
    github_url = f"https://github.com/{repo_owner}/{repo_name}"
    try:
        # Get the version tags from the GitHub repo in decreasing order (that's what '-v:refname' means)
        result = git.cmd.Git().ls_remote(github_url, sort="-v:refname", tags=True)
    except git.GitCommandError:
        return "main"

    # One line per tag
    for line in result.split("\n"):
        # Lines returned are {sha}\trefs/tags/{tag}^{}, we grab the tag
        candidate = line.split("/")[-1].replace("^", "").replace("{}", "")
        # Some tags are not versions (looking at your VERSION and delete tags Datasets)
        if re.search(r"v?\d+\.\d+\.\d+", candidate):
            # Add the v is missing (looking at you Datasets :-p)
            return candidate if candidate.startswith("v") else f"v{candidate}"

    return "main"


def get_objects_map(package_name, version="main", language="en", repo_owner="huggingface", repo_name=None):
    """
    Downloads the `objects.inv` for a package and post-processes it to get a nice dictionary.

    Args:
        package_name (`str`): The name of the external package.
        version (`str`, *optional*, defaults to `"main"`): The version of the package for which documentation is built.
        language (`str`, *optional*, defaults to `"en"`): The language of the documentation being built.
        repo_owner (`str`, *optional*, defaults to `"huggingface"`): The owner of the GitHub repo.
        repo_name (`str`, *optional*, defaults to `package_name`):
            The name of the GitHub repo. If not provided, it will be the same as the package name.
    """
    repo_name = repo_name if repo_name is not None else package_name
    # We link to main in `package_name` from the main doc (or PR docs) but to the last stable release otherwise.
    if version in ["main", "master"] or version.startswith("pr_"):
        package_version = "main"
    else:
        package_version = get_stable_version(package_name, repo_owner, repo_name)

    doc_url = f"{HF_DOC_PREFIX}{package_name}/{package_version}/{language}"
    url = f"{doc_url}/objects.inv"
    try:
        request = requests.get(url, stream=True)
        request.raise_for_status()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_file = os.path.join(tmp_dir, "objects.inv")
            with open(tmp_file, "ab") as writer:
                for chunk in request.iter_content(chunk_size=1024):
                    if chunk:  # filter out keep-alive new chunks
                        writer.write(chunk)

            with open(tmp_file, "rb") as reader:
                object_lines = reader.readlines()[4:]
                object_data = zlib.decompress(b"".join(object_lines)).decode().split("\n")
            return post_process_objects_inv(object_data, doc_url)
    except Exception:
        return {}


def get_external_object_link(object_name, page_info):
    if object_name.startswith("~"):
        object_name = object_name[1:]
        link_name = object_name.split(".")[-1]
    else:
        link_name = object_name

    version = page_info.get("version", "main")
    language = page_info.get("language", "en")
    if language != "en":
        # No resolving for other languages then English as we don't translate API doc pages/docstrings for now.
        return f"`{link_name}`"

    package_name = object_name.split(".")[0]
    if package_name not in HUGGINFACE_LIBS:
        # No resolving for non-HF libs for now.
        return f"`{link_name}`"

    if package_name not in EXTERNAL_DOC_OBJECTS_CACHE:
        EXTERNAL_DOC_OBJECTS_CACHE[package_name] = get_objects_map(package_name, version=version, language=language)
    object_url = EXTERNAL_DOC_OBJECTS_CACHE[package_name].get(object_name, None)

    if object_url is None:
        # Object not found in the lib
        return f"`{link_name}`"
    else:
        return f"[{link_name}]({object_url})"
