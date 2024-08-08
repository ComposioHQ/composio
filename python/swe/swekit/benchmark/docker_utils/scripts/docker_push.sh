#!/bin/bash

# Usage check
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    echo "Usage: $0 <root_directory> <docker_namespace> [sub_folder]"
    exit 1
fi

root_directory=$1
docker_namespace=$2
sub_folder=${3:-}  # Optional third argument for subfolder
base_image="${docker_namespace}/swe-bench"

push_docker_images() {
    target_directory="$root_directory"
    if [ -n "$sub_folder" ]; then
        target_directory="$root_directory/$sub_folder"
    fi

    for dir in $target_directory/*/*; do
        echo "Checking directory: $dir"
        if [ -d "$dir" ] && [[ "$dir" =~ .*/[0-9]+\.[0-9]+$ ]]; then
            dockerfile_path="$dir/Dockerfile"
            echo "Checking Dockerfile: $dockerfile_path"
            if [ -f "$dockerfile_path" ]; then
                base_dir=$(dirname "$dir")
                version=$(basename "$dir")
                tag_base="${base_dir#$root_directory/}"
                tag_base="$(echo $tag_base | sed 's/__*/_/g')"
                image_name="$base_image-${tag_base}-swe:$version"
                echo "Pushing Docker image: $image_name"
                docker push "$image_name"
            fi
        fi
    done
}

push_docker_images
