.PHONY: all generate_dockerfiles build_images push_images

REPO_NAME ?= "django__django"

all: generate_dockerfiles build_images push_images

build_and_push: build_images push_images

generate_dockerfiles:
	python ./swe_bench_docker/docker_file_generator/docker_file_generator.py

build_images:
	./swe_bench_docker/scripts/build_docker_images.sh ./swe_bench_docker/docker techcomposio $(REPO_NAME)

push_images:
	./swe_bench_docker/scripts/docker_push.sh ./swe_bench_docker/docker namespace