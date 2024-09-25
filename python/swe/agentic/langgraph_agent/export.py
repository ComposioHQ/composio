import os
os.environ['LANGCHAIN_API_KEY']="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"
import json
from langsmith import Client
from uuid import UUID
import pandas as pd
client = Client()
from datetime import datetime, timedelta

save_dir = "./logs/runs/"
os.makedirs(save_dir, exist_ok=True)

project_name = "sphinx-doc__sphinx-9591"
runs = list(
    client.list_runs(
        project_name=project_name,
        run_type="llm",
    )
)

df = pd.DataFrame(
    [
        {
            "trace_id": run.trace_id,
            "name": run.name,
            "model": run.extra["invocation_params"][
                "model_id"
            ],  # The parameters used when invoking the model are nested in the extra info
            **run.inputs,
            **(run.outputs or {}),
            "start_time": run.start_time,
            "error": run.error,
            "latency": (run.end_time - run.start_time).total_seconds()
            if run.end_time
            else None,  # Pending runs have no end time
            "prompt_tokens": run.prompt_tokens,
            "completion_tokens": run.completion_tokens,
            "total_tokens": run.total_tokens,
            "metadata": run.metadata,
        }
        for run in runs
    ],
    index=[run.id for run in runs],
)


