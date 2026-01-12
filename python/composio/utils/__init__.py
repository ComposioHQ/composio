from .uuid import generate_short_id, generate_uuid


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
            raise DeprecationError(f"{func.__name__} is deprecated: `{reason}`")

        return wrapper

    return decorator


__all__ = [
    "DeprecationError",
    "deprecate",
    "generate_short_id",
    "generate_uuid",
]
