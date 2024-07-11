import base64
import json
import logging
import os
import sys

from swekit.benchmark.docker_utils.docker_file_generator.const import (
    KEY_PREDICTION,
    PatchType,
)
from swekit.benchmark.docker_utils.docker_file_generator.context_manager import (
    TaskEnvContextManager,
)
from swekit.benchmark.docker_utils.docker_file_generator.utils import (
    extract_minimal_patch,
)


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logging.getLogger().setLevel(logging.INFO)
logger = logging.getLogger("evaluate_instance")


def main(
    task_instance: dict,
    testbed_name: str,
    repo_dir: str,
    log_dir: str,
    timeout: int,
    log_suffix: str = None,
    image_type: str = "conda",
):
    logger.info(
        "Instance ID: "
        + task_instance["instance_id"]
        + "\nTestbed: "
        + testbed_name
        + "\nLog dir: "
        + log_dir
    )

    with TaskEnvContextManager(
        task_instance,
        testbed_name,
        repo_dir,
        log_dir,
        timeout=timeout,
        log_suffix=log_suffix,
        image_type=image_type,
    ) as tcm:
        # Attempt to apply prediction
        patch_type = PatchType.PATCH_PRED_TRY.value

        # If prediction patch doesn't apply, try to do some minor patch refactoring and try again
        if (
            not tcm.apply_patch(task_instance[KEY_PREDICTION], patch_type=patch_type)
            and task_instance[KEY_PREDICTION] is not None
            and task_instance[KEY_PREDICTION] != ""
        ):
            task_instance[KEY_PREDICTION] = extract_minimal_patch(
                task_instance[KEY_PREDICTION]
            )
            patch_type = PatchType.PATCH_PRED_MINIMAL_TRY.value
            if not tcm.apply_patch(
                task_instance[KEY_PREDICTION], patch_type=patch_type
            ):
                logger.warning("Failed to apply prediction patch")
                sys.exit(1)

        tcm.apply_patch(
            task_instance[KEY_PREDICTION], patch_type=patch_type, revert=True
        )

        # Set prediction patch label based on whether patch was edited
        if patch_type == PatchType.PATCH_PRED_MINIMAL_TRY.value:
            patch_type = PatchType.PATCH_PRED_MINIMAL.value
        else:
            patch_type = PatchType.PATCH_PRED.value

        # Run testing script
        prediction_patch = task_instance[KEY_PREDICTION]
        test_patch = task_instance["test_patch"]
        if (
            (
                prediction_patch
                and not tcm.apply_patch(prediction_patch, patch_type=patch_type)
            )
            or (
                test_patch
                and not tcm.apply_patch(
                    test_patch, patch_type=PatchType.PATCH_TEST.value
                )
            )
            or not tcm.run_tests_task(task_instance)
        ):
            logger.warning("Evaluation failed")
            sys.exit(1)

        logger.info("Evaluation succeeded")


if __name__ == "__main__":
    TASK_INSTANCE_JSON = "/home/swe-bench/task_instance.json"
    if os.path.exists(TASK_INSTANCE_JSON):
        with open(TASK_INSTANCE_JSON, "r") as f:
            task_instance = json.load(f)
    else:
        assert (
            os.getenv("INSTANCE") is not None
        ), "INSTANCE environment variable is not set"
        task_instance = json.loads(
            base64.b64decode(os.getenv("INSTANCE")).decode("utf-8")
        )
    assert os.getenv("LOG_DIR") is not None, "LOG_DIR environment variable is not set"
    assert (
        os.getenv("TESTBED_NAME") is not None
    ), "TESTBED_NAME environment variable is not set"

    repo_dir = os.getenv("REPO_DIR")
    if not repo_dir:
        repo_dir = os.getenv("TESTBED")

    assert repo_dir, "REPO_DIR environment variable is not set"
    main(
        task_instance=task_instance,
        testbed_name=os.getenv("TESTBED_NAME"),
        repo_dir=repo_dir,
        log_dir=os.getenv("LOG_DIR"),
        timeout=int(os.getenv("TIMEOUT")) if os.getenv("TIMEOUT") is not None else None,
        log_suffix=os.getenv("LOG_SUFFIX"),
        image_type=os.getenv("IMAGE_TYPE", "conda"),
    )
