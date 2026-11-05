// Counting must never delay or prevent the anchor's normal external navigation.
export function trackSalonRegistrationClick(eventId: number): void {
  try {
    void fetch(`/api/ai-salon/events/${eventId}/registration-click`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // The registration link still works if telemetry is unavailable.
  }
}
