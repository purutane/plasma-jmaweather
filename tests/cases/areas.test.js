// Areas.js は tools/generate_data.py の生成物。気象庁が区域を再編したときに
// 何が変わったのかを気付けるようにしておく。README に書いた件数との突き合わせも兼ねる。

const fs = require("fs");
const path = require("path");
const h = require("../harness");
const { test, ok, eq } = h;

const areas = h.loadAreas();
const README = fs.readFileSync(path.join(h.ROOT, "README.md"), "utf8");

const ALL_AREAS = areas.OFFICES.flatMap((o) =>
    o.areas.map((a) => ({ office: o, area: a }))
);

test("予報区と地域の件数が README と一致する", () => {
    const m = README.match(/全国 (\d+) 予報区 \/ (\d+) 地域/);
    ok(m, "README に件数の記述が見つからない");
    eq(areas.OFFICES.length, parseInt(m[1], 10), "予報区の件数");
    eq(ALL_AREAS.length, parseInt(m[2], 10), "地域の件数");
    // 生成し直して件数が変わったなら README も直す
    h.note(`${areas.OFFICES.length} 予報区 / ${ALL_AREAS.length} 地域`);
});

test("全地域に気温の観測所が付いている", () => {
    // 観測所が欠けると、その地域だけ別の場所（週間側の観測所）の気温を出す
    let multi = 0;
    for (const { office, area } of ALL_AREAS) {
        const stations = areas.stationsOf(area.code);
        ok(
            stations.length > 0,
            `${office.name} - ${area.name}: 気温の観測所が無い`
        );
        for (const s of stations) {
            ok(/^\d{5}$/.test(s), `${office.name} - ${area.name}: 観測所コード ${s}`);
        }
        if (stations.length > 1) {
            multi++;
        }
    }
    // 1 区域に複数割り当てられているものがある（気象庁のページは全部を並べる）
    h.note(`${multi} 地域が複数の観測所を持つ`);
});

test("知らない区域コードの観測所は空", () => {
    eq(areas.stationsOf("999999").length, 0, "存在しない区域");
    eq(areas.stationsOf("").length, 0, "空のコード");
});

test("配信コードの読み替えは十勝と奄美の 2 件だけ", () => {
    eq(areas.endpoint("014030"), "014100", "十勝");
    eq(areas.endpoint("460040"), "460100", "奄美");
    eq(Object.keys(areas.REMAP).length, 2, "読み替えの件数");
    // 残りは素通し
    for (const office of areas.OFFICES) {
        if (office.code === "014030" || office.code === "460040") {
            continue;
        }
        eq(areas.endpoint(office.code), office.code, `${office.name} は読み替えない`);
    }
});

test("読み替え先の予報区も一覧に居る", () => {
    // 014100 / 460100 は読み替え先であると同時に、それ自体が選べる予報区
    for (const code of Object.values(areas.REMAP)) {
        ok(areas.officeIndex(code) >= 0, `${code} が OFFICES に無い`);
    }
});

test("地域名は予報区名を冠して一意になる", () => {
    const seen = new Map();
    for (const { office, area } of ALL_AREAS) {
        const name = areas.displayName(office.code, area.code);
        ok(name !== "", `${office.code}/${area.code}: 表示名が空`);
        ok(
            !seen.has(name),
            `表示名が重複: ${name} (${seen.get(name)} と ${office.code}/${area.code})`
        );
        seen.set(name, `${office.code}/${area.code}`);
    }
    eq(seen.size, ALL_AREAS.length, "表示名の件数");
});

test("予報区名と地域名が同じときは重ねない", () => {
    const same = ALL_AREAS.filter(({ office, area }) => {
        const prefix = office.name.replace(/（[^）]*）/g, "");
        return prefix === area.name;
    });
    // Areas.js のコメントが「7 件」と言っている
    eq(same.length, 7, "予報区名と地域名が同じものの件数");
    for (const { office, area } of same) {
        eq(areas.displayName(office.code, area.code), area.name, `${area.name} は重ねない`);
    }
});

test("但し書きは表示名から落とす", () => {
    // 「鹿児島県（奄美地方除く）- 大隅地方」ではなく「鹿児島県 - 大隅地方」
    eq(areas.displayName("460100", "460020"), "鹿児島県 - 大隅地方");
    eq(areas.displayName("120000", "120010"), "千葉県 - 北西部");
    ok(
        !ALL_AREAS.some(({ office, area }) =>
            areas.displayName(office.code, area.code).includes("（")
        ),
        "表示名に括弧が残っている"
    );
});

test("知らないコードは -1 と空文字を返す", () => {
    eq(areas.officeIndex("999999"), -1);
    eq(areas.areaIndex("999999", "999999"), -1);
    eq(areas.areaIndex("130000", "999999"), -1);
    eq(areas.displayName("999999", "999999"), "");
    // 予報区は合っていて地域が不明なら予報区名だけ返す
    eq(areas.displayName("130000", "999999"), "東京都");
});

test("コードは 6 桁でインデックスが引ける", () => {
    for (const { office, area } of ALL_AREAS) {
        ok(/^\d{6}$/.test(office.code), `予報区コードの形式: ${office.code}`);
        ok(/^\d{6}$/.test(area.code), `地域コードの形式: ${area.code}`);
        eq(
            areas.OFFICES[areas.officeIndex(office.code)].code,
            office.code,
            `officeIndex(${office.code})`
        );
        const j = areas.areaIndex(office.code, area.code);
        eq(office.areas[j].code, area.code, `areaIndex(${office.code}, ${area.code})`);
    }
});

test("既定の設定値が実在する地域を指す", () => {
    const xml = fs.readFileSync(
        path.join(h.ROOT, "contents", "config", "main.xml"),
        "utf8"
    );
    const pick = (name) =>
        xml.match(new RegExp(`name="${name}"[^]*?<default>([^<]*)</default>`))[1];
    const office = pick("officeCode");
    const area = pick("areaCode");
    ok(areas.officeIndex(office) >= 0, `既定の予報区 ${office} が無い`);
    ok(areas.areaIndex(office, area) >= 0, `既定の地域 ${area} が無い`);
    // 既定の areaName は displayName から組み立てたものと揃えておく
    eq(pick("areaName"), areas.displayName(office, area), "既定の地域名");
});
