#!/bin/bash
set -e

# Check for minimum arguments
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <root_directory> <docker_namespace> [repo_directory]"
    exit 1
fi

docker_namespace=$2
root_directory=$1
repo=${3:-""}

base_image="${docker_namespace}/swe-bench"

echo "Building base Docker images..."

build_docker_images() {
    if [ -z "$repo" ]; then
        # Build testbed base images in the root level directories first
        for dir in $root_directory/*/; do
            dockerfile_path="$dir/Dockerfile"
            if [ -f "$dockerfile_path" ]; then
                tag="${dir#$root_directory/}"
                tag="${tag%/}"
                image_name="$base_image-$(echo $tag | sed 's/__*/_/g')"
                echo "Building Docker image: $image_name"
                docker build -t "$image_name:bookworm-slim" -f "$dockerfile_path" .
            fi
        done
    else
        # Build specific repo directory
        dir="$root_directory/$repo/"
        if [ -d "$dir" ] && [ -f "$dir/Dockerfile" ]; then
            tag="${repo%/}"
            image_name="$base_image-$(echo $tag | sed 's/__*/_/g')"
            echo "Building Docker image: $image_name"
            docker build -t "$image_name:bookworm-slim" -f "$dir/Dockerfile" .
        fi
    fi

    if [ ! -z "$repo" ]; then
        # Specific repo's versioned directories
        for dir in $root_directory/$repo/*; do
            build_versioned_images "$dir"
        done
    else
        # All repos' versioned directories
        for base_dir in $root_directory/*/; do
            for dir in $base_dir/*; do
                build_versioned_images "$dir"
            done
        done
    fi
}

build_versioned_images() {
    dir=$1
    if [ -d "$dir" ] && [[ "$dir" =~ .*/[0-9]+\.[0-9]+$ ]]; then
        dockerfile_path="$dir/Dockerfile"
        if [ -f "$dockerfile_path" ]; then
            base_dir=$(dirname "$dir")
            version=$(basename "$dir")
            tag_base="${base_dir#$root_directory/}"
            tag_base="${tag_base%/*}"
            tag_base="$(echo $tag_base | sed 's/__*/_/g')"
            image_name="$base_image-${tag_base}-swe"
            echo "Building Docker image: $image_name:$version for $dir/Dockerfile"
            docker build -t "$image_name:$version" -f "$dockerfile_path" .

            for instance_dir in $dir/*/; do
                build_instance_image "$instance_dir" "$tag_base"
            done
        fi

    fi
}

build_instance_image() {
    dir=$1
    tag_base=$2

    dockerfile_path="$dir/Dockerfile"
    if [ -f "$dockerfile_path" ]; then
        base_dir=$(dirname "$dir")
        instance_id=$(basename "$dir")
        tag_base="${base_dir#$root_directory/}"
        tag_base="${tag_base%/*}"
        tag_base="$(echo $tag_base | sed 's/__*/_/g')"
        image_name="$base_image-${tag_base}-instance"
        echo "Building Docker image: $image_name:$instance_id for $dir/Dockerfile"
        docker build -t "$image_name:$instance_id" -f "$dockerfile_path" .
    fi
}

build_docker_images
