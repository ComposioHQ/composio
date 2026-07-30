#!/usr/bin/env bash

set -euo pipefail

worktree=${1:?usage: build-artifacts.sh WORKTREE VERSIONS_JSON OUTPUT_DIR OUTPUT_JSON}
versions_json=${2:?usage: build-artifacts.sh WORKTREE VERSIONS_JSON OUTPUT_DIR OUTPUT_JSON}
output_dir=${3:?usage: build-artifacts.sh WORKTREE VERSIONS_JSON OUTPUT_DIR OUTPUT_JSON}
output_json=${4:?usage: build-artifacts.sh WORKTREE VERSIONS_JSON OUTPUT_DIR OUTPUT_JSON}

worktree=$(cd "$worktree" && pwd)
versions_json=$(cd "$(dirname "$versions_json")" && pwd)/$(basename "$versions_json")
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
output_json=$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")
descriptors=$(mktemp)
trap 'rm -f "$descriptors"' EXIT

if [[ $(jq '.typescript_packages | length' "$versions_json") -gt 0 ]]; then
  (
    cd "$worktree"
    pnpm build:packages
  )
  while IFS= read -r package_name; do
    package_dir=$(
      cd "$worktree"
      pnpm --filter "$package_name" exec pwd
    )
    packed=$(
      cd "$package_dir"
      npm pack --json --pack-destination "$output_dir" | jq -r '.[0].filename'
    )
    filename=$(basename "$packed")
    sha256=$(shasum -a 256 "$output_dir/$filename" | awk '{print $1}')
    integrity="sha512-$(openssl dgst -sha512 -binary "$output_dir/$filename" | openssl base64 -A)"
    jq -nc \
      --arg package_name "$package_name" \
      --arg filename "$filename" \
      --arg sha256 "$sha256" \
      --arg integrity "$integrity" \
      '{ecosystem:"typescript",package_name:$package_name,registry:"npm",filename:$filename,sha256:$sha256,integrity:$integrity}' \
      >> "$descriptors"
  done < <(jq -r '.typescript_packages[].name' "$versions_json")
fi

if [[ $(jq '.python_packages | length' "$versions_json") -gt 0 ]]; then
  (
    cd "$worktree/python"
    make env
    make build
  )
  expected_python_packages=$(jq -r '.python_packages[].name' "$versions_json")
  while IFS= read -r package_name; do
    dist_dir=
    if [[ "$package_name" == "composio" ]]; then
      dist_dir="$worktree/python/dist"
    else
      for provider in "$worktree"/python/providers/*; do
        [[ -f "$provider/pyproject.toml" && -d "$provider/dist" ]] || continue
        provider_name=$(python -c 'import pathlib,tomllib,sys; print(tomllib.loads(pathlib.Path(sys.argv[1]).read_text())["project"]["name"])' "$provider/pyproject.toml")
        if [[ "$provider_name" == "$package_name" ]]; then
          dist_dir="$provider/dist"
          break
        fi
      done
    fi
    if [[ -z "$dist_dir" ]]; then
      echo "No built provider directory found for $package_name" >&2
      exit 1
    fi

    artifact_count=0
    while IFS= read -r artifact; do
      artifact_count=$((artifact_count + 1))
      filename=$(basename "$artifact")
      cp "$artifact" "$output_dir/$filename"
      sha256=$(shasum -a 256 "$output_dir/$filename" | awk '{print $1}')
      jq -nc \
        --arg package_name "$package_name" \
        --arg filename "$filename" \
        --arg sha256 "$sha256" \
        '{ecosystem:"python",package_name:$package_name,registry:"pypi",filename:$filename,sha256:$sha256}' \
        >> "$descriptors"
    done < <(find "$dist_dir" -maxdepth 1 -type f \( -name '*.whl' -o -name '*.tar.gz' \) | sort)
    if [[ $artifact_count -eq 0 ]]; then
      echo "No built distributions found for $package_name in $dist_dir" >&2
      exit 1
    fi
  done <<< "$expected_python_packages"
fi

jq -s 'sort_by(.filename, .package_name)' "$descriptors" > "$output_json"
