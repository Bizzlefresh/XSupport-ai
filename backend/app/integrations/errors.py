"""Integration errors. Messages never contain tokens, response bodies or ticket text."""


class IntegrationError(Exception):
    kind = "error"


class IntegrationDisabled(IntegrationError):
    kind = "disabled"


class IntegrationMisconfigured(IntegrationError):
    kind = "misconfigured"


class IntegrationAuthError(IntegrationError):
    kind = "auth"


class IntegrationUnavailable(IntegrationError):
    kind = "unavailable"


class ReadOnlyViolation(IntegrationError):
    kind = "read_only"
