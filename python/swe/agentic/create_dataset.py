import json
import os
from pathlib import Path

from swebench.harness.utils import load_swebench_dataset


dataset = "princeton-nlp/SWE-bench_Verified"
task_instances = load_swebench_dataset(name=dataset, split="test", instance_ids=None)

dataset_save_dir = f"../../temp/{dataset.split('/')[-1]}"



def load_json(path: Path):
    with open(path, "r") as f:
        return json.load(f)

def save_json(data, path: Path):
    with open(path, "w") as f:
        json.dump(data, f, indent=4)


for instance_key in task_instances:
    Path(dataset_save_dir, instance_key).mkdir(parents=True, exist_ok=True)
    instance = task_instances[instance_key]
    metadata = {
        "repo": instance['repo'],
        'instance_id': instance['instance_id'],
        'base_commit': instance['base_commit'],
        'created_at': instance['created_at'],
        'version': instance['version'],
    }
    with open(Path(dataset_save_dir, instance_key, "patch.txt"), 'w') as handle:
        handle.write(instance['patch'])
    with open(Path(dataset_save_dir, instance_key, "test_patch.txt"), 'w') as handle:
        handle.write(instance['test_patch'])
    with open(Path(dataset_save_dir, instance_key, "problem_statement.txt"), 'w') as handle:
        handle.write(instance['problem_statement'])
    with open(Path(dataset_save_dir, instance_key, "hints_text.txt"), 'w') as handle:
        handle.write(instance['hints_text'])
    
    save_json(metadata, Path(dataset_save_dir, instance_key, "metadata.json"))
    