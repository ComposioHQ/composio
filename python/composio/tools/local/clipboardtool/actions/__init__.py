"""Clipboard actions."""

from .files import CopyFilePaths, PasteFilePaths
from .image import CopyImage, PasteImage
from .text import CopyText, PasteText


__all__ = [
    "CopyText",
    "PasteText",
    "CopyImage",
    "PasteImage",
    "CopyFilePaths",
    "PasteFilePaths",
]
