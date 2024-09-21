import traceback

import sentry_sdk


def CatchAllExceptions(cls, handler):
    class Cls(cls):
        _original_args = None

        # pylint: disable=unused-argument
        def make_context(self, info_name, args, parent=None, **extra):
            # grab the original command line arguments
            self._original_args = " ".join(args)

            try:
                # pylint: disable=super-with-arguments
                return super(Cls, self).make_context(
                    info_name, args, parent=parent, **extra
                )
                # pylint: enable=super-with-arguments
            except Exception as exc:
                # call the handler
                should_ignore_error = handler(self, info_name, exc)
                if should_ignore_error:
                    return None
                # let the user see the original error
                raise

        # pylint: enable=unused-argument

        # pylint: disable=unused-argument
        def invoke(self, ctx):
            try:
                # pylint: disable=super-with-arguments
                return super(Cls, self).invoke(ctx)
                # pylint: enable=super-with-arguments
            except Exception as exc:
                # call the handler
                should_ignore_error = handler(self, ctx.info_name, exc)
                if should_ignore_error:
                    return None
                # let the user see the original error
                raise

        # pylint: enable=unused-argument

    return Cls


# pylint: disable=unused-argument
def handle_exceptions(cmd, info_name, exc):
    # send error info to rollbar, etc, here
    if (isinstance(exc, (SystemExit, ValueError))) and sentry_sdk.is_initialized():
        sentry_sdk.capture_exception(exc)
        sentry_sdk.flush()
        print(traceback.format_exc())
        return True

    return False


# pylint: enable=unused-argument
