class DeprecationError(Exception):
    """Raised when deprecating some older functions. This is strictly for use
    while developing and will be removed from the codebase later."""

    pass


def deprecate(reason: str = "This function is deprecated"):
    """Deprecation decorator. Provide `reason` to show why you're deprecating something.
    NOTE: Decorating something with this will ensure that the function _will not run._
    """
    import functools

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            raise DeprecationError(f"{func.__name__} is deprecatiod: `{reason}`")

        return wrapper

    return decorator
