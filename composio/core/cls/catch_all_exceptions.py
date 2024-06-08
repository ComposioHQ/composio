import traceback

import requests
import sentry_sdk

from composio.utils.url import get_api_url_base


def init_sentry():
    url = f"{get_api_url_base()}/v1/cli/sentry-dns"
    response = requests.get(url=url, timeout=10)
    if response.status_code != 200:
        return
    config = response.json()
    sentry_sdk.init(
        dsn=config.get("dns"), traces_sample_rate=1.0, profiles_sample_rate=1.0
    )


def CatchAllExceptions(cls, handler):
    class Cls(cls):
        _original_args = None

        def make_context(self, info_name, args, parent=None, **extra):
            # grab the original command line arguments
            self._original_args = " ".join(args)

            try:
                return super().make_context(info_name, args, parent=parent, **extra)
            except Exception as exc:
                # call the handler
                should_ignore_error = handler(self, info_name, exc)
                if should_ignore_error:
                    return
                # let the user see the original error
                raise

        def invoke(self, ctx):
            try:
                return super(Cls, self).invoke(ctx)
            except Exception as exc:
                # call the handler
                should_ignore_error = handler(self, ctx.info_name, exc)
                if should_ignore_error:
                    return None
                # let the user see the original error
                raise

    return Cls


def handle_exceptions(cmd, info_name, exc):
    # send error info to rollbar, etc, here
    if (isinstance(exc, (SystemExit, ValueError))) and sentry_sdk.is_initialized():
        sentry_sdk.capture_exception(exc)
        sentry_sdk.flush()
        print(cmd, info_name)
        print(traceback.format_exc())
        return True

    return False
