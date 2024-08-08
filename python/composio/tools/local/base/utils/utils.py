import os


def get_rel_fname(root, fname):
    """Get relative file name from the root directory."""
    return os.path.relpath(fname, root)


def split_path(root, path):
    """Split path into components relative to the root directory."""
    path = os.path.relpath(path, root)
    return [path + ":"]


def get_mtime(fname):
    """Get modification time of a file."""
    try:
        return os.path.getmtime(fname)
    except FileNotFoundError:
        print(f"File not found error: {fname}")
        return None


def find_src_files(directory):
    if not os.path.isdir(directory):
        return [directory]

    src_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            src_files.append(os.path.join(root, file))
    return src_files


def print_if_verbose(text, verbose=True):
    if verbose:
        print(text)


# Replace the existing token_count function with this:
def token_count(text):
    import tiktoken  # pylint: disable=C0415

    enc = tiktoken.encoding_for_model("gpt-4o")
    max_length = 1024
    # If the tokens exceed max_length, count them in chunks
    if len(text) > max_length:
        total_tokens = 0
        for i in range(0, len(text), max_length):
            chunk = enc.encode(text[i : i + max_length])  # noqa: E203
            total_tokens += len(chunk)
        return total_tokens
    return len(enc.encode(text))
