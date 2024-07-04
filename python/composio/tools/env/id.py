import random
import string
import typing as t


_shell_ids: t.Set[str] = set()


def random_string(n: int = 6) -> str:
    """Random string."""
    return "".join(
        random.choices(
            string.ascii_letters + string.digits,
            k=n,
        )
    )


def generate_id() -> str:
    """Generate unique ID."""
    _id = random_string()
    while _id in _shell_ids:
        _id = random_string()
    _shell_ids.add(_id)
    return _id
