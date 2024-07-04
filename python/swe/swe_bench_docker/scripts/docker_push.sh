#!/bin/bash

# Usage check
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <root_directory> <docker_namespace>"
    exit 1
fi

root_directory=$1
docker_namespace=$2
base_image="${docker_namespace}/swe-bench"

push_docker_images() {
    for dir in $root_directory/*/*; do
        if [ -d "$dir" ] && [[ "$dir" =~ .*/[0-9]+\.[0-9]+$ ]]; then
            dockerfile_path="$dir/Dockerfile"
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
