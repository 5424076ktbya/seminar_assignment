import json
from datetime import datetime
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


def firebase_match_id(match_id):
    text = str(match_id)

    for char in [".", "#", "$", "[", "]", "/"]:
        text = text.replace(char, "_")

    return text


def parse_jleague_datetime(value):
    dt = datetime.strptime(
        value,
        "%Y-%m-%d %H:%M"
    )

    dt = dt.replace(tzinfo=JST)

    return int(dt.timestamp() * 1000)


def parse_europe_datetime(value):
    # 例:
    # 2026年 08/23（日） 22:00

    date_part, time_part = value.split("）")

    date_part = date_part.split("（")[0]

    year_text, month_day = date_part.split("年")

    year = int(year_text.strip())

    month, day = map(
        int,
        month_day.strip().split("/")
    )

    hour, minute = map(
        int,
        time_part.strip().split(":")
    )

    dt = datetime(
        year,
        month,
        day,
        hour,
        minute,
        tzinfo=JST
    )

    return int(dt.timestamp() * 1000)


with open(
    "src/jleague_matches.json",
    encoding="utf-8"
) as f:
    jleague_matches = json.load(f)


with open(
    "src/upcoming_matches.json",
    encoding="utf-8"
) as f:
    europe_matches = json.load(f)


match_status = {}


for match in jleague_matches:
    match_id = firebase_match_id(match["id"])

    match_status[match_id] = {
        "lockAt": parse_jleague_datetime(
            match["datetime"]
        )
    }


for match in europe_matches:
    match_id = firebase_match_id(match["id"])

    match_status[match_id] = {
        "lockAt": parse_europe_datetime(
            match["datetime"]
        )
    }


with open(
    "match_status.json",
    "w",
    encoding="utf-8"
) as f:
    json.dump(
        match_status,
        f,
        ensure_ascii=False,
        indent=2
    )


print(
    f"{len(match_status)}試合の"
    "match_status.jsonを生成しました。"
)