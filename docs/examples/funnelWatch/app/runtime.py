"""Process-wide singletons. Import `manager` to reach the current session/volume.

Always access `manager.volume` freshly (don't cache it) so code keeps working
across a session rollover, which swaps the volume in place.
"""
from __future__ import annotations

from app.config import settings
from app.session import SessionManager

manager = SessionManager(settings.data_root)
