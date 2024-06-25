### SWE-bench-docker

clone the git repo for swe-docker bench

```bash
git clone https://github.com/aorwall/SWE-bench-docker.git
```

### generate related files

```bash
python ./setup_test_bed.py --prediction_path_dir /path/to/logs/generated/by/llm
```

This repository contains the Docker-based solution for the SWE-bench evaluation framework. It allows for isolated and reproducible benchmarking of software engineering tools.

### Run the evaluation

```bash
python run_evaluation.py --predictions_path /home/shubhra/Downloads/Users/karanvaidya/relevant_logs_2/patches.json --log_dir <logs_dir_generated_by_run_evaluation> --swe_bench_tasks /home/shubhra/work/swe-eval/dataset --namespace aorwall
```
