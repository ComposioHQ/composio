from .enums import Action, App


class LocalApp(App):
    """Local app."""
    @property
    def is_local(self) -> bool:
        """Check if app is local."""
        return True
    
    MATHEMATICAL = "mathematical"


class LocalAction(Action):
    """Local action."""
    @property
    def is_local(self) -> bool:
        """Check if action is local."""
        return True
    
    MATHEMATICAL_CLACULATOR = (
        "mathematical",
        "mathematical_calculator",
        True,
    )