#!/usr/bin/env python3
"""contents/code/ の Areas.js と Telops.js を気象庁のサイトから生成し直す。

どちらも気象庁が配信しているものをそのまま写しただけの表なので、
区域の再編や天気コードの追加があったときはこのスクリプトを流す。

    python3 tools/generate_data.py

生成物:
    contents/code/Areas.js   予報区と一次細分区域の一覧（common/const/area.json より）
    contents/code/Telops.js  天気コード表（予報ページ内の TELOPS より）
"""

import json
import os
import re
import sys
import urllib.request

AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json"
FORECAST_PAGE = "https://www.jma.go.jp/bosai/forecast/"
UA = {"User-Agent": "plasma-jmaweather-datagen/1.0"}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "contents", "code")

# area.json の予報区コードでは短期予報が 404 になる 2 件。
# 気象庁は別コードで配信しているので読み替える。
REMAP = {"014030": "014100", "460040": "460100"}

# 気象庁の天気アイコン（svg 名）を Breeze のアイコン名へ対応させる。
# svg 名は 30 種類しかないので、コード 118 個をそのまま並べるより短く済む。
DAY_ICON = {
    "100.svg": "weather-clear",
    "101.svg": "weather-few-clouds",
    "102.svg": "weather-showers-scattered-day",
    "104.svg": "weather-snow-scattered-day",
    "110.svg": "weather-few-clouds",
    "112.svg": "weather-showers-scattered-day",
    "115.svg": "weather-snow-scattered-day",
    "200.svg": "weather-many-clouds",
    "201.svg": "weather-clouds",
    "202.svg": "weather-showers-scattered",
    "204.svg": "weather-snow-scattered",
    "210.svg": "weather-clouds",
    "212.svg": "weather-showers-scattered",
    "215.svg": "weather-snow-scattered",
    "300.svg": "weather-showers",
    "301.svg": "weather-showers-day",
    "302.svg": "weather-showers-scattered",
    "303.svg": "weather-snow-rain",
    "308.svg": "weather-storm",
    "311.svg": "weather-showers-day",
    "313.svg": "weather-showers",
    "314.svg": "weather-snow-rain",
    "400.svg": "weather-snow",
    "401.svg": "weather-snow-scattered-day",
    "402.svg": "weather-snow-scattered",
    "403.svg": "weather-snow-rain",
    "406.svg": "weather-snow-storm",
    "411.svg": "weather-snow-scattered-day",
    "413.svg": "weather-snow-scattered",
    "414.svg": "weather-snow-rain",
}


def get(url, as_json=True):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        raw = r.read().decode("utf-8")
    return json.loads(raw) if as_json else raw


def extract_telops(page):
    """予報ページのインラインスクリプトから R.TELOPS の定義を切り出す。"""
    start = page.index("R.TELOPS=") + len("R.TELOPS=")
    depth = 0
    for i in range(start, len(page)):
        if page[i] == "{":
            depth += 1
        elif page[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    else:
        raise RuntimeError("TELOPS の終端が見つからない")
    raw = page[start:end]
    raw = re.sub(r"([{,])(\d+):", r'\1"\2":', raw)  # 裸の数値キーを引用符で囲む
    if "\\u" in raw:
        raw = raw.encode().decode("unicode_escape")
    return json.loads(raw)


def write_telops(telops):
    unknown = {v[0] for v in telops.values()} - set(DAY_ICON)
    if unknown:
        raise RuntimeError(f"DAY_ICON に未登録の svg があります: {sorted(unknown)}")

    lines = [
        ".pragma library",
        "",
        "// 気象庁 天気コード表（www.jma.go.jp の TELOPS より生成）",
        "// tools/generate_data.py が書き出すので手で編集しない",
        "// code -> [Breezeアイコン名, 日本語ラベル]",
        "var TELOPS = {",
    ]
    for code in sorted(telops, key=int):
        entry = telops[code]
        lines.append(f'    "{code}": ["{DAY_ICON[entry[0]]}", "{entry[3]}"],')
    lines[-1] = lines[-1].rstrip(",")
    lines += [
        "};",
        "",
        "var NIGHT = {",
        '    "weather-clear": "weather-clear-night",',
        '    "weather-few-clouds": "weather-few-clouds-night",',
        '    "weather-clouds": "weather-clouds-night",',
        '    "weather-showers-day": "weather-showers-night",',
        '    "weather-showers-scattered-day": "weather-showers-scattered-night",',
        '    "weather-snow-scattered-day": "weather-snow-scattered-night"',
        "};",
        "",
        "function icon(code, night) {",
        "    var e = TELOPS[String(code)];",
        '    if (!e) return "weather-none-available";',
        "    return night && NIGHT[e[0]] ? NIGHT[e[0]] : e[0];",
        "}",
        "",
        "function label(code) {",
        "    var e = TELOPS[String(code)];",
        '    return e ? e[1] : "--";',
        "}",
    ]
    path = os.path.join(OUT_DIR, "Telops.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path, len(telops)


def write_areas(area):
    offices, class10s = area["offices"], area["class10s"]
    remap = ", ".join(f'"{k}": "{v}"' for k, v in sorted(REMAP.items()))

    lines = [
        ".pragma library",
        "",
        "// 気象庁 予報区一覧（common/const/area.json より生成）",
        "// tools/generate_data.py が書き出すので手で編集しない",
        "",
        "// 短期予報の配信コードが area.json と食い違う2件を補正する",
        f"var REMAP = {{ {remap} }};",
        "",
        "function endpoint(officeCode) {",
        "    return REMAP[officeCode] || officeCode;",
        "}",
        "",
        "var OFFICES = [",
    ]
    for code in sorted(offices):
        office = offices[code]
        kids = ", ".join(
            f'{{"code": "{c}", "name": "{class10s[c]["name"]}"}}' for c in office["children"]
        )
        lines.append(f'    {{"code": "{code}", "name": "{office["name"]}", "areas": [{kids}]}},')
    lines[-1] = lines[-1].rstrip(",")
    lines += [
        "];",
        "",
        "function officeIndex(code) {",
        "    for (var i = 0; i < OFFICES.length; i++) {",
        "        if (OFFICES[i].code === code) return i;",
        "    }",
        "    return -1;",
        "}",
        "",
        "function areaIndex(officeCode, areaCode) {",
        "    var i = officeIndex(officeCode);",
        "    if (i < 0) return -1;",
        "    var as = OFFICES[i].areas;",
        "    for (var j = 0; j < as.length; j++) {",
        "        if (as[j].code === areaCode) return j;",
        "    }",
        "    return -1;",
        "}",
        "",
        "// 「北西部」「南部」だけではどこの話か分からないので予報区名を冠して返す。",
        "// 予報区名と地域名が同じものが 7 件あるので、その場合は重ねない。",
        "function displayName(officeCode, areaCode) {",
        "    var i = officeIndex(officeCode);",
        '    if (i < 0) return "";',
        "    var office = OFFICES[i];",
        "    // 「鹿児島県（奄美地方除く）」のような但し書きは長くなるだけなので落とす",
        '    var prefix = office.name.replace(/（[^）]*）/g, "");',
        "    var j = areaIndex(officeCode, areaCode);",
        "    if (j < 0) return prefix;",
        "    var area = office.areas[j].name;",
        '    return area === prefix ? area : prefix + " - " + area;',
        "}",
    ]
    path = os.path.join(OUT_DIR, "Areas.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path, len(offices), sum(len(o["children"]) for o in offices.values())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        telops = extract_telops(get(FORECAST_PAGE, as_json=False))
        area = get(AREA_URL)
    except Exception as e:
        print(f"取得に失敗しました: {e}", file=sys.stderr)
        return 1

    path, n = write_telops(telops)
    print(f"{os.path.relpath(path, ROOT)}: 天気コード {n} 件")
    path, offices, areas = write_areas(area)
    print(f"{os.path.relpath(path, ROOT)}: 予報区 {offices} / 地域 {areas}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
