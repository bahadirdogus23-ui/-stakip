"""Structured errors: a Turkish message for the user plus technical detail for the log."""

from __future__ import annotations


class AutoMoldError(Exception):
    """Base error. `user_message` is shown in the UI, `detail` goes to the log."""

    def __init__(self, user_message: str, detail: str = "") -> None:
        super().__init__(user_message if not detail else f"{user_message} ({detail})")
        self.user_message = user_message
        self.detail = detail


class ModelImportError(AutoMoldError):
    """The model file could not be read."""


class GeometryError(AutoMoldError):
    """A geometric operation failed or produced invalid output."""
