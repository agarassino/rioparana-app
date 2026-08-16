#!/usr/bin/env python3
"""Turn a saved PNA index page into the batch payload for POST /river.

Kept separate from the shell script because the network calls have to go
through curl: Python's TLS stack fails against these hosts on machines with a
self-signed certificate in the chain, while curl uses the system keychain.
"""
import json
import re
import sys
from datetime import datetime, timezone

HTML, CONFIG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

MONTHS = {m: f"{i + 1:02d}" for i, m in enumerate(
    "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}


def field(row, label):
    match = re.search(rf'data-label="{label}"[^>]*>\s*(?:<b>)?([^<]*)', row, re.I)
    return match.group(1).strip() if match else None


def timestamp(value):
    """PNA publishes '14/AUG/26 - 1200' in Argentine local time."""
    match = re.match(r"^(\d{2})/([A-Z]{3})/(\d{2})\s*-\s*(\d{2})(\d{2})$", value.strip(), re.I)
    if not match:
        return None
    day, month_name, year, hour, minute = match.groups()
    month = MONTHS.get(month_name.upper())
    if not month:
        return None
    # The API validates strict UTC ISO-8601; zod rejects a -03:00 offset.
    local = datetime.fromisoformat(f"20{year}-{month}-{day}T{hour}:{minute}:00-03:00")
    return local.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def number(value):
    """PNA publishes '-' when a station has no reading for a column."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def trend(state):
    normalized = (state or "").upper()
    if normalized.startswith("CRECE"):
        return "rising"
    if normalized.startswith("BAJA"):
        return "falling"
    return "stable"


source = open(CONFIG, encoding="utf-8").read()
known = dict(
    (code, station_id)
    for station_id, code in re.findall(r"id: '([^']+)'.*?code: '([^']+)'", source)
)

html = open(HTML, encoding="utf-8", errors="replace").read()
readings, missing = [], []

for row in re.findall(r'<tr class="[^"]*"\s*>(.*?)</tr>', html, re.S):
    code = re.search(r"[?&]id=(\d+)", row)
    if not code or code.group(1) not in known:
        continue

    station_id = known[code.group(1)]
    level = number(field(row, "Ultimo Registro:"))
    published_at = timestamp(field(row, "Fecha Hora:") or "")
    if level is None or not published_at:
        missing.append(station_id)
        continue

    variation = number(field(row, "Variacion"))
    reading = {
        "stationId": station_id,
        "level": level,
        "trend": trend(field(row, "Estado:")),
        # Stored in centimetres, matching the app.
        "changeRate": round(variation * 100, 2) if variation is not None else 0.0,
        "timestamp": published_at,
    }

    # Reference heights, published in the same row. Omitted when absent so the
    # API keeps whatever it already holds instead of clearing it.
    alert = number(field(row, "Alerta:"))
    evacuation = number(field(row, "Evacuación:"))
    if alert is not None:
        reading["alertLevel"] = alert
    if evacuation is not None:
        reading["evacuationLevel"] = evacuation

    readings.append(reading)

json.dump({"readings": readings}, open(OUT, "w"))
print(f"{len(readings)} of {len(known)} configured stations")
if missing:
    print(f"no reading published for: {', '.join(missing)}")
