const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface CreateEventOptions {
  accessToken: string;
  calendarId: string;
  summary: string;
  start: Date;
  end: Date;
  description?: string;
}

export interface CalendarEvent {
  id: string;
  htmlLink: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

export async function createCalendarEvent(opts: CreateEventOptions): Promise<CalendarEvent> {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(opts.calendarId)}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: opts.summary,
      description: opts.description,
      start: { dateTime: opts.start.toISOString() },
      end: { dateTime: opts.end.toISOString() },
    }),
  });

  if (!res.ok) {
    throw new Error(`Calendar API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
