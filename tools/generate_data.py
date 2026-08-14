#!/usr/bin/env python3
"""contents/code/ の Areas.js・Telops.js・Geo.js・WarnCodes.js を気象庁のサイトから生成し直す。

いずれも気象庁が配信しているものをそのまま写しただけの表なので、
区域の再編や天気コードの追加があったときはこのスクリプトを流す。

    python3 tools/generate_data.py

生成物:
    contents/code/Areas.js      予報区と一次細分区域の一覧（common/const/area.json より）
    contents/code/Telops.js     天気コード表（予報ページ内の TELOPS より）
    contents/code/Geo.js        市区町村の代表点（common/const/class20relm.json より）
    contents/code/WarnCodes.js  警報・注意報コード表（警報ページ内の定義より）
"""

import json
import math
import os
import re
import sys
import urllib.request

AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json"
# 気象庁の警報図が市区町村の位置合わせに使っている外接矩形の表。
# 区域の境界そのものは配信されていないので、緯度経度からの逆引きはこれを代表点にする。
RELM_URL = "https://www.jma.go.jp/bosai/common/const/class20relm.json"
FORECAST_PAGE = "https://www.jma.go.jp/bosai/forecast/"
# 一次細分区域 -> 気温の観測所（アメダス）の対応表。短期予報の気温は観測所単位で
# 配信され、天気の区域とは数が合わないので、引くにはこの表が要る。
FORECAST_AREA_URL = "https://www.jma.go.jp/bosai/forecast/const/forecast_area.json"
# 警報・注意報コードの表は const 配下に配信されていない。警報ページのインライン
# スクリプトが唯一の出どころなので、そこから写す。
WARNING_PAGE = "https://www.jma.go.jp/bosai/warning/"
UA = {"User-Agent": "plasma-jmaweather-datagen/1.0"}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "contents", "code")

# area.json の予報区コードでは短期予報が 404 になる 2 件。
# 気象庁は別コードで配信しているので読み替える。
REMAP = {"014030": "014100", "460040": "460100"}

# 外接矩形の中心を代表点にできない市区町村。遠くの無人島まで市域に含むため、
# 中心が海の上に落ちて有人島から数百km離れる。有人島の位置を名指しで置き換える。
# 小笠原村と久米島町は補正しないと、その地域に住む人を判定できない（100km の蓋に掛かる）。
ISLAND_POINTS = {
    # 南鳥島・沖ノ鳥島まで含むので矩形の対角は 2000km 近い
    "1342100": [(27.09, 142.19), (26.63, 142.16), (24.78, 141.32)],  # 父島・母島・硫黄島
    "4736100": [(26.34, 126.80)],  # 久米島（硫黄鳥島を含む）
    "4720700": [(24.34, 124.16)],  # 石垣島（尖閣諸島を含む）
    "3252800": [(36.21, 133.32)],  # 島後（竹島を含む）
    "4735800": [(25.95, 131.30)],  # 北大東島（沖大東島を含む）
    "4630400": [(29.84, 129.85), (29.14, 129.21)],  # 中之島・宝島（トカラ列島）
}

# これより大きい矩形は中心が実態とかけ離れている可能性が高い。区域が再編されて
# 新しい飛び地が出てきたら、黙って精度が落ちる前にここで気付けるようにしておく。
WIDE_BOX_KM = 150

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


# 警報ページの表は `"03":{shortNameParts:s.rain[3],nameParts:e.rain[3],elem:"rain",level:30}`
# のような並びで、名前そのものは別の表に要素別・レベル別で入っている。
WARN_ENTRY_RE = re.compile(
    r'"?(\d{2})"?:\{shortNameParts:\w+\.\w+\[\d\],'
    r"nameParts:\w+\.(\w+)\[(\d)\],"
    r'elem:"\w+",level:(\d+)\}'
)

# 表に無いコードをどう扱うかは Warning.js 側の判断だが、生成時に気付けるよう
# 気象庁が現に配信しているコードはここで数えておく。
WARN_MIN_CODES = 30

# 警報ページの表に無いが、防災情報XMLの警報・注意報コード表にはあるもの。
# 警報ページは洪水を「氾濫」と呼び替えて別の配信（bosai/flood/）から描いているため、
# ページ内の表からは洪水が丸ごと抜けている。warning.json 側にこれらが出てくるか
# どうかは実データで確かめられていない（取得時は全国どこにも出ていなかった）ので、
# 出てきたときにコード番号が生で表示されないよう名前だけ用意しておく。
# ページ側に同じコードが載ったらこちらは消す（生成時に衝突で止まる）。
WARN_EXTRA = {
    "04": ("洪水警報", 30),
    "18": ("洪水注意報", 20),
    "27": ("その他の注意報", 20),
}


def brace_span(text, open_index):
    """text[open_index] の `{` に対応する `}` の次の位置を返す。"""
    depth = 0
    for i in range(open_index, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    raise RuntimeError("対応する } が見つからない")


def extract_warn_names(page):
    """要素別・レベル別の名称表（nameParts）を切り出す。

    同じ形の表が短縮版（「注」「警」）と正式版（「大雨注意報」）の 2 つあるので、
    レベル3の大雨が「大雨」を含む方＝正式版を選ぶ。
    """
    for m in re.finditer(re.escape("rain:[[]"), page):
        start = page.rindex("{", 0, m.start())
        raw = page[start:brace_span(page, start)]
        if "\\u" in raw:
            raw = raw.encode().decode("unicode_escape")
        raw = re.sub(r"([{,])(\w+):", r'\1"\2":', raw)  # 裸のキーを引用符で囲む
        try:
            table = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if "大雨" in "".join(table.get("rain", [[]] * 4)[3]):
            return table
    raise RuntimeError("警報・注意報の名称表が見つからない")


def extract_warn_codes(page):
    """警報ページのインラインスクリプトから警報・注意報コードの表を切り出す。

    同じ形の表が指定河川洪水予報にもあり、そちらは 20・21・22 のように
    警報コードと同じ数値を別の意味で使っている。要素が 1 種類（flood）しか
    出てこないのが河川側なので、要素が複数ある方を警報・注意報の表とみなす。
    """
    names = extract_warn_names(page)

    runs, current = [], []
    prev_end = -2
    for m in WARN_ENTRY_RE.finditer(page):
        if m.start() != prev_end + 1:  # 直前の項目と `,` 一つで繋がっていなければ別の表
            current = []
            runs.append(current)
        current.append(m)
        prev_end = m.end()

    tables = [r for r in runs if len({m.group(2) for m in r}) > 1]
    if len(tables) != 1:
        raise RuntimeError(f"警報・注意報コードの表を一つに絞れない（候補 {len(tables)} 件）")

    codes = {}
    for m in tables[0]:
        code, elem, index, level = m.group(1), m.group(2), int(m.group(3)), int(m.group(4))
        parts = names.get(elem, [])
        if index >= len(parts) or not parts[index]:
            raise RuntimeError(f"コード {code} の名称が名称表に無い（{elem}[{index}]）")
        # 「レベル３」は危険度レベルの見出しで、警報の名前ではないので落とす
        name = "".join(p for p in parts[index] if not p.startswith("レベル"))
        if not name:
            raise RuntimeError(f"コード {code} の名称が空（{elem}[{index}]）")
        codes[code] = (name, level)

    overlap = set(codes) & set(WARN_EXTRA)
    if overlap:
        raise RuntimeError(
            f"WARN_EXTRA のコードがページ側にも載りました。手当てを消してください: {sorted(overlap)}"
        )
    codes.update(WARN_EXTRA)

    if len(codes) < WARN_MIN_CODES:
        raise RuntimeError(f"警報・注意報コードが {len(codes)} 件しか取れない")
    return codes


def write_warn_codes(codes):
    lines = [
        ".pragma library",
        "",
        "// 気象庁 警報・注意報コード表（www.jma.go.jp/bosai/warning/ のページ内定義より生成）",
        "// tools/generate_data.py が書き出すので手で編集しない",
        "// code -> [名称, レベル]",
        "var CODES = {",
    ]
    for code in sorted(codes):
        name, level = codes[code]
        lines.append(f'    "{code}": ["{name}", {level}],')
    lines[-1] = lines[-1].rstrip(",")
    lines += [
        "};",
        "",
        "// 気象庁のページが使っている重み。数値の大小がそのまま深刻さの順になる。",
        "var ADVISORY = 20;   // 注意報",
        "var WARNING = 30;    // 警報",
        "var CRITICAL = 40;   // 危険警報",
        "var EMERGENCY = 50;  // 特別警報",
        "",
        "// 表に無いコードは新設された警報とみなして警報扱いにする。",
        "// 名前が分からないものを黙って捨てると、コードが増えた日に特別警報を",
        "// 出し損ねる。出しすぎる方に倒しておき、コード番号をそのまま見せる。",
        "function name(code) {",
        "    var e = CODES[String(code)];",
        '    return e ? e[0] : "警報・注意報（コード " + code + "）";',
        "}",
        "",
        "function level(code) {",
        "    var e = CODES[String(code)];",
        "    return e ? e[1] : WARNING;",
        "}",
        "",
        "function known(code) {",
        "    return !!CODES[String(code)];",
        "}",
    ]
    path = os.path.join(OUT_DIR, "WarnCodes.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path, len(codes)


def area_stations(area, farea):
    """一次細分区域 -> 気温の観測所コードの一覧。

    forecast_area.json は 1 区域に複数の観測所を割り当てていることがある（21 区域）。
    気象庁のページはその全部を行として並べるが、パネルには 1 つしか出せないので
    並び順のまま持っておき、実際に配信に居るものを Forecast.js が選ぶ。
    """
    out = {}
    missing = []
    for office_code, office in area["offices"].items():
        entries = {e["class10"]: e.get("amedas") or [] for e in farea.get(office_code, [])}
        for code in office["children"]:
            stations = entries.get(code) or []
            if not stations:
                missing.append(code)
            out[code] = stations
    if missing:
        raise RuntimeError(
            f"forecast_area.json に気温の観測所が無い区域: {sorted(missing)[:5]}"
        )
    return out


def write_areas(area, farea):
    offices, class10s = area["offices"], area["class10s"]
    remap = ", ".join(f'"{k}": "{v}"' for k, v in sorted(REMAP.items()))
    stations = area_stations(area, farea)

    lines = [
        ".pragma library",
        "",
        "// 気象庁 予報区一覧（common/const/area.json より生成）",
        "// 気温の観測所は forecast/const/forecast_area.json より",
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
            '{{"code": "{}", "name": "{}", "stations": [{}]}}'.format(
                c,
                class10s[c]["name"],
                ", ".join(f'"{s}"' for s in stations[c]),
            )
            for c in office["children"]
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
        "// 地域コードは全国で一意なので、そこから予報区を引き直せる（Geo.js の逆引き用）",
        "function officeOf(areaCode) {",
        "    for (var i = 0; i < OFFICES.length; i++) {",
        "        var as = OFFICES[i].areas;",
        "        for (var j = 0; j < as.length; j++) {",
        "            if (as[j].code === areaCode) return OFFICES[i].code;",
        "        }",
        "    }",
        '    return "";',
        "}",
        "",
        "// 気温の観測所の候補。1 区域に複数割り当てられていることがあるので、",
        "// 実際に配信に載っているものを呼ぶ側が選ぶ。",
        "function stationsOf(areaCode) {",
        "    for (var i = 0; i < OFFICES.length; i++) {",
        "        var as = OFFICES[i].areas;",
        "        for (var j = 0; j < as.length; j++) {",
        "            if (as[j].code === areaCode) return as[j].stations;",
        "        }",
        "    }",
        "    return [];",
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


def box_diagonal_km(box):
    ne, sw = box["ne"], box["sw"]
    dy = (ne[0] - sw[0]) * 111.0
    dx = (ne[1] - sw[1]) * 111.0 * math.cos(math.radians((ne[0] + sw[0]) / 2))
    return math.hypot(dx, dy)


def write_geo(area, relm):
    """市区町村の代表点を一次細分区域ごとにまとめて書き出す。

    class20relm.json のキーは area.json の class20s と 1 対 1 で対応するので、
    class20 -> class15 -> class10 と親をたどれば一次細分区域まで上がれる。
    """
    class10s, class15s, class20s = area["class10s"], area["class15s"], area["class20s"]

    missing = set(relm) - set(class20s)
    if missing:
        raise RuntimeError(f"class20relm.json に area.json 側で未知の市区町村: {sorted(missing)[:5]}")

    unknown = set(ISLAND_POINTS) - set(relm)
    if unknown:
        raise RuntimeError(f"ISLAND_POINTS に実在しない市区町村: {sorted(unknown)}")

    points = {code: [] for code in class10s}
    wide = []
    for code, box in sorted(relm.items()):
        area10 = class15s[class20s[code]["parent"]]["parent"]
        if code in ISLAND_POINTS:
            points[area10].extend(ISLAND_POINTS[code])
            continue
        if box_diagonal_km(box) > WIDE_BOX_KM:
            wide.append(f'{code} {relm[code]["name"]} ({box_diagonal_km(box):.0f}km)')
        # 矩形の中心を代表点にする。市区町村の面積では 1km 前後の誤差で、
        # IP から得られる座標の粗さのほうがはるかに大きいので足りる。
        lat = round((box["ne"][0] + box["sw"][0]) / 2, 3)
        lon = round((box["ne"][1] + box["sw"][1]) / 2, 3)
        points[area10].append((lat, lon))

    if wide:
        raise RuntimeError(
            "矩形が大きすぎて中心を代表点にできない市区町村があります。"
            f"有人島の位置を ISLAND_POINTS に足してください: {wide}"
        )

    empty = [c for c in points if not points[c]]
    if empty:
        raise RuntimeError(f"代表点が 1 つも無い一次細分区域: {[class10s[c]['name'] for c in empty]}")

    lines = [
        ".pragma library",
        "",
        "// 市区町村の代表点（common/const/class20relm.json より生成）",
        "// tools/generate_data.py が書き出すので手で編集しない",
        "//",
        "// 気象庁は一次細分区域の境界を配信していないので、区域に属する市区町村の",
        "// 外接矩形の中心を並べ、一番近いものが属する区域を現在地とみなしている。",
        "// 引く側は Locate.js。",
        "//",
        "// 一次細分区域コード -> [[緯度, 経度], ...]",
        "var POINTS = {",
    ]
    for code in sorted(points):
        pts = ", ".join(f"[{lat}, {lon}]" for lat, lon in points[code])
        lines.append(f'    "{code}": [{pts}],')
    lines[-1] = lines[-1].rstrip(",")
    lines.append("};")

    path = os.path.join(OUT_DIR, "Geo.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path, len(relm), len(points)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        telops = extract_telops(get(FORECAST_PAGE, as_json=False))
        warn_codes = extract_warn_codes(get(WARNING_PAGE, as_json=False))
        area = get(AREA_URL)
        farea = get(FORECAST_AREA_URL)
        relm = get(RELM_URL)
    except Exception as e:
        print(f"取得に失敗しました: {e}", file=sys.stderr)
        return 1

    path, n = write_telops(telops)
    print(f"{os.path.relpath(path, ROOT)}: 天気コード {n} 件")
    path, n = write_warn_codes(warn_codes)
    print(f"{os.path.relpath(path, ROOT)}: 警報・注意報コード {n} 件")
    path, offices, areas = write_areas(area, farea)
    print(f"{os.path.relpath(path, ROOT)}: 予報区 {offices} / 地域 {areas}")
    path, towns, covered = write_geo(area, relm)
    print(f"{os.path.relpath(path, ROOT)}: 市区町村 {towns} 件 / {covered} 地域")
    return 0


if __name__ == "__main__":
    sys.exit(main())
