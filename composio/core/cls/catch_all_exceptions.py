import sentry_sdk
import traceback

def init_sentry():
    sentry_sdk.init(
        dsn="https://11fa6caf2e5c80f6d3580e2d50b9feb5@o4506274564079616.ingest.us.sentry.io/4507267098345472",
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0
    )

def CatchAllExceptions(cls, handler):

    class Cls(cls):

        _original_args = None

        def make_context(self, info_name, args, parent=None, **extra):

            # grab the original command line arguments
            self._original_args = ' '.join(args)

            try:
                return super(Cls, self).make_context(
                    info_name, args, parent=parent, **extra)
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
                    return
                # let the user see the original error
                raise

    return Cls


def handle_exceptions(cmd, info_name, exc):
    # send error info to rollbar, etc, here
    if isinstance(exc, ValueError) or isinstance(exc, SystemExit):
        sentry_sdk.capture_exception(exc)
        sentry_sdk.flush()
        print(traceback.format_exc())
        return True
    
    return False
