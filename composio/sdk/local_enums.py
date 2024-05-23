from enum import Enum


class LocalApp(Enum):
    MATHEMATICAL = "mathematical"


class LocalAction(Enum):
    def __init__(self, service, action, no_auth):
        self.service = service
        self.action = action
        self.no_auth = no_auth

    MATHEMATICAL_CLACULATOR = (
        "mathematical",
        "mathematical_calculator",
        False,
    )
