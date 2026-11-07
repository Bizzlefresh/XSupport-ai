import threading
import time
from collections import deque


class SlidingWindowLimiter:
    """Allows at most `calls` requests in any `period` seconds; blocks (via `sleep`) until a slot is free.
    The clock and sleep are injectable so tests run instantly."""

    def __init__(self, calls: int, period: float, clock=time.monotonic, sleep=time.sleep):
        if calls < 1 or period <= 0:
            raise ValueError("calls must be >= 1 and period > 0")
        self.calls, self.period, self._clock, self._sleep = calls, period, clock, sleep
        self._stamps: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> float:
        """Returns how long it had to wait."""
        waited = 0.0
        while True:
            with self._lock:
                now = self._clock()
                while self._stamps and now - self._stamps[0] >= self.period:
                    self._stamps.popleft()
                if len(self._stamps) < self.calls:
                    self._stamps.append(now)
                    return waited
                wait = self.period - (now - self._stamps[0])
            self._sleep(max(wait, 0.0))
            waited += max(wait, 0.0)
