#!/usr/bin/env python3
"""テスト用に気象庁の予報 JSON と警報 JSON を tests/fixtures/ へ保存する。

既定では厄介な予報区だけを取る（tests/fixtures/*.json と
tests/fixtures/warning/*.json、いずれもコミット対象）。

    python3 tools/fetch_fixtures.py

--all を付けると全 58 予報区を tests/fixtures/all/ へ取る。こちらはコミットせず、
「受け皿が全国で一意に定まる」ことを確かめたいときだけ流す（tests/run.js --all）。

    python3 tools/fetch_fixtures.py --all

配信内容は 1 日 3 回変わるので、取り直すとテストの期待値とズレることがある。
ズレたら実データの方が正しいので、期待値側を直す（CLAUDE.md 参照）。
"""

import json
import os
import re
import sys
import time
import urllib.request

FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/{}.json"
# data/warning/ にも同名の JSON があるが更新が止まっている。現行は data/r8/。
WARNING_URL = "https://www.jma.go.jp/bosai/warning/data/r8/{}.json"
UA = {"User-Agent": "plasma-jmaweather-fixtures/1.0"}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AREAS_JS = os.path.join(ROOT, "contents", "code", "Areas.js")
FIXTURE_DIR = os.path.join(ROOT, "tests", "fixtures")

# 実装メモに挙がっている引っかかりどころを踏む予報区だけを固定で持つ。
# 値は Areas.endpoint() を通したあとの配信コード。
PINNED = {
    "014100": "釧路・根室・十勝（根室が受け皿を踏む / 014030・460040 の読み替え先）",
    "070000": "福島県（浜通りが受け皿を踏む / 3 区域に対し観測所 7 件）",
    "130000": "東京都（伊豆諸島南部が受け皿を踏む）",
    "270000": "大阪府（予報区と地域が同一コードの最小ケース）",
    "460100": "鹿児島県（大隅・種子島屋久島が受け皿を踏む）",
}

# 警報は予報と違って読み替えが要らない（十勝・奄美とも自分のコードで配信されている）。
# 読み替えると十勝・奄美の地域がどこにも出てこなくなるので、その 2 件を固定で持つ。
WARNING_PINNED = {
    "014030": "十勝地方（予報では 014100 へ読み替える予報区。警報は読み替えない）",
    "014100": "釧路・根室地方（014030 を含まないことの控え）",
    "120000": "千葉県（大雨・土砂災害・雷が別々の電文で同じ地域に散る）",
    "130000": "東京都（発表中と解除が混ざる）",
    "460040": "奄美地方（予報では 460100 へ読み替える予報区）",
}


def load_office_codes(remapped):
    """Areas.js から予報区コードを読む。remapped=True で配信コードへ読み替える。"""
    src = open(AREAS_JS, encoding="utf-8").read()
    remap = dict(re.findall(r'"(\d{6})":\s*"(\d{6})"', src.split("var OFFICES")[0]))
    # 予報区の行だけを拾う（"areas" を持つのが予報区、その中の地域は拾わない）
    codes = re.findall(r'^\s*\{"code": "(\d{6})", "name": "[^"]*", "areas":', src, re.M)
    if not codes:
        raise RuntimeError("Areas.js から予報区コードを読めない")
    if not remapped:
        return sorted(codes)
    # 十勝と奄美は隣の予報区と同じ JSON へ寄るので重複を落とす
    return sorted({remap.get(c, c) for c in codes})


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8")
    json.loads(raw)  # 壊れたものを置かない
    with open(dest, "w", encoding="utf-8") as f:
        f.write(raw)
    return len(raw)


def fetch_all(url_template, codes, out_dir, notes):
    os.makedirs(out_dir, exist_ok=True)
    total = failed = 0
    for i, code in enumerate(codes):
        dest = os.path.join(out_dir, code + ".json")
        try:
            total += fetch(url_template.format(code), dest)
        except Exception as e:
            print(f"  {code}: 取得に失敗 ({e})", file=sys.stderr)
            failed += 1
            continue
        note = notes.get(code, "")
        print(f"  {os.path.relpath(dest, FIXTURE_DIR)}{'  ' + note if note else ''}")
        if i + 1 < len(codes):
            time.sleep(0.3)  # 気象庁のサーバに連続で叩き込まない

    print(f"{os.path.relpath(out_dir, ROOT)}: {len(codes) - failed}/{len(codes)} 件, "
          f"{total // 1024} KB")
    return failed


def main():
    every = "--all" in sys.argv[1:]
    base = os.path.join(FIXTURE_DIR, "all") if every else FIXTURE_DIR

    failed = fetch_all(
        FORECAST_URL,
        load_office_codes(True) if every else sorted(PINNED),
        base,
        PINNED,
    )
    failed += fetch_all(
        WARNING_URL,
        load_office_codes(False) if every else sorted(WARNING_PINNED),
        os.path.join(base, "warning"),
        WARNING_PINNED,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
