
class UnauthorizedAccessException(Exception):
    pass

class NotFoundException(Exception):
    pass

class InternalServerErrorException(Exception):
    pass

class BadErrorException(Exception):
    pass

class NotLoggedInException(Exception):
    pass

class TimeoutException(Exception):
    pass

class UserNotAuthenticatedException(Exception):
    pass