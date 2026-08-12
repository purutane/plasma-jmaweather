#!/usr/bin/env python3
"""テスト用に気象庁の予報 JSON を tests/fixtures/ へ保存する。

既定では厄介な予報区だけを取る（tests/fixtures/*.json、コミット対象）。

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


def load_endpoints():
    """Areas.js から予報区コードを読む（配信コードへの読み替え込み）。"""
    src = open(AREAS_JS, encoding="utf-8").read()
    remap = dict(re.findall(r'"(\d{6})":\s*"(\d{6})"', src.split("var OFFICES")[0]))
    # 予報区の行だけを拾う（"areas" を持つのが予報区、その中の地域は拾わない）
    codes = re.findall(r'^\s*\{"code": "(\d{6})", "name": "[^"]*", "areas":', src, re.M)
    if not codes:
        raise RuntimeError("Areas.js から予報区コードを読めない")
    # 十勝と奄美は隣の予報区と同じ JSON へ寄るので重複を落とす
    return sorted({remap.get(c, c) for c in codes})


def fetch(code, dest):
    req = urllib.request.Request(FORECAST_URL.format(code), headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8")
    json.loads(raw)  # 壊れたものを置かない
    with open(dest, "w", encoding="utf-8") as f:
        f.write(raw)
    return len(raw)


def main():
    every = "--all" in sys.argv[1:]
    out_dir = os.path.join(FIXTURE_DIR, "all") if every else FIXTURE_DIR
    codes = load_endpoints() if every else sorted(PINNED)

    os.makedirs(out_dir, exist_ok=True)
    total = failed = 0
    for i, code in enumerate(codes):
        dest = os.path.join(out_dir, code + ".json")
        try:
            total += fetch(code, dest)
        except Exception as e:
            print(f"  {code}: 取得に失敗 ({e})", file=sys.stderr)
            failed += 1
            continue
        note = PINNED.get(code, "")
        print(f"  {code}.json{'  ' + note if note else ''}")
        if i + 1 < len(codes):
            time.sleep(0.3)  # 気象庁のサーバに連続で叩き込まない

    print(f"{os.path.relpath(out_dir, ROOT)}: {len(codes) - failed}/{len(codes)} 件, "
          f"{total // 1024} KB")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
