import hashlib

def get_file_hash(file_path: str) -> str:
    hasher = hashlib.md5()
    with open(file_path, 'rb') as f:
        chunk = f.read()
        hasher.update(chunk)
    return hasher.hexdigest()