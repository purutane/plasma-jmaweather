// IP から得た座標を一次細分区域へ落とす部分。Geo.js は生成物なので、
// 気象庁が区域を再編したときにここが先に落ちてくれる状態にしておく。
//
// 座標から区域を引くのは近似（市区町村の外接矩形の中心への最近傍）なので、
// 境界ぎりぎりの点ではなく、誰が見てもその区域だと分かる地点で確かめる。

const h = require("../harness");
const { test, ok, eq } = h;

const areas = h.loadAreas();
const geo = h.loadGeo();
const locate = h.loadLocate();

const ALL_AREA_CODES = new Set(
    areas.OFFICES.flatMap((o) => o.areas.map((a) => a.code))
);

test("代表点がすべての地域に付いている", () => {
    const covered = Object.keys(geo.POINTS);
    for (const code of covered) {
        ok(ALL_AREA_CODES.has(code), `Geo.js の ${code} が Areas.js に無い`);
        ok(geo.POINTS[code].length > 0, `${code} に代表点が無い`);
    }
    for (const code of ALL_AREA_CODES) {
        ok(covered.includes(code), `${code} (${areas.displayName(areas.officeOf(code), code)}) に代表点が無い`);
    }
    eq(covered.length, ALL_AREA_CODES.size, "代表点を持つ地域の件数");
    const towns = covered.reduce((n, code) => n + geo.POINTS[code].length, 0);
    h.note(`${towns} 代表点 / ${covered.length} 地域`);
});

test("代表点が日本の範囲に収まっている", () => {
    for (const code of Object.keys(geo.POINTS)) {
        for (const [lat, lon] of geo.POINTS[code]) {
            ok(lat > 20 && lat < 46, `${code}: 緯度が範囲外 ${lat}`);
            ok(lon > 122 && lon < 154, `${code}: 経度が範囲外 ${lon}`);
        }
    }
});

test("地域コードから予報区を引き直せる", () => {
    for (const office of areas.OFFICES) {
        for (const area of office.areas) {
            eq(areas.officeOf(area.code), office.code, `officeOf(${area.code})`);
        }
    }
    eq(areas.officeOf("999999"), "", "知らないコードは空文字");
});

test("代表点そのものは自分の地域に落ちる", () => {
    // 別の地域と同じ座標を持つ市区町村があると、そこだけ静かに隣を指すことになる
    for (const code of Object.keys(geo.POINTS)) {
        for (const [lat, lon] of geo.POINTS[code]) {
            const hit = locate.nearestArea(lat, lon, geo.POINTS);
            ok(hit !== null, `${code}: (${lat}, ${lon}) が圏外になった`);
            eq(hit.areaCode, code, `(${lat}, ${lon}) の帰属`);
        }
    }
});

test("代表的な地点が期待どおりの地域になる", () => {
    const places = [
        ["東京駅", 35.681, 139.767, "130010"],
        ["札幌市役所", 43.062, 141.354, "016010"],
        ["いわき市", 37.05, 140.888, "070020"],
        ["名古屋市", 35.181, 136.907, "230010"],
        ["大阪市", 34.694, 135.502, "270000"],
        ["高松市", 34.34, 134.043, "370000"],
        ["那覇市", 26.212, 127.679, "471010"],
        ["石垣市", 24.34, 124.156, "474010"],
        // 飛び地を抱える市区町村（generate_data.py の ISLAND_POINTS）。
        // 外接矩形の中心を代表点にすると、ここが軒並み数百km ずれて圏外になる
        ["父島", 27.094, 142.192, "130040"],
        ["母島", 26.63, 142.16, "130040"],
        ["久米島", 26.35, 126.8, "471030"],
        ["隠岐・西郷", 36.208, 133.325, "320030"],
        ["北大東島", 25.945, 131.3, "472000"],
        ["対馬市", 34.203, 129.288, "420030"],
        ["十勝・帯広市", 42.924, 143.196, "014030"],
        ["奄美・名瀬", 28.377, 129.494, "460040"]
    ];
    for (const [name, lat, lon, expected] of places) {
        const hit = locate.nearestArea(lat, lon, geo.POINTS);
        ok(hit !== null, `${name}: 圏外と判定された`);
        eq(
            hit.areaCode,
            expected,
            `${name} は ${areas.displayName(areas.officeOf(expected), expected)} のはず` +
                `（実際は ${areas.displayName(areas.officeOf(hit.areaCode), hit.areaCode)}）`
        );
        ok(hit.distance < 15, `${name}: 最近傍が ${hit.distance.toFixed(0)}km も離れている`);
    }
});

test("国外や海の上は判定しない", () => {
    // 蓋が無いとソウルから対馬（395km）、台北から与那国島を拾ってしまう
    const outside = [
        ["ソウル", 37.566, 126.978],
        ["台北", 25.033, 121.565],
        ["ホノルル", 21.307, -157.858],
        ["太平洋のまん中", 30.0, 150.0]
    ];
    for (const [name, lat, lon] of outside) {
        eq(locate.nearestArea(lat, lon, geo.POINTS), null, `${name} が国内と判定された`);
    }
});

test("応答から座標と国コードを取り出せる", () => {
    // get.geojs.io は文字列で、ipwho.is は数値で返す
    const geojs = locate.readLocation({
        latitude: "35.6483",
        longitude: "140.3248",
        country_code: "JP"
    });
    eq(geojs.lat, 35.6483, "geojs の緯度");
    eq(geojs.lon, 140.3248, "geojs の経度");
    eq(geojs.country, "JP", "geojs の国コード");

    const ipwho = locate.readLocation({
        success: true,
        latitude: 35.6894973,
        longitude: 139.6923172,
        country_code: "JP"
    });
    eq(ipwho.lat, 35.6894973, "ipwho の緯度");
    eq(ipwho.country, "JP", "ipwho の国コード");
});

test("読めない応答は null にして次の候補へ回す", () => {
    eq(locate.readLocation(null), null, "空");
    eq(locate.readLocation({}), null, "座標が無い");
    eq(locate.readLocation({ success: false }), null, "ipwho の失敗");
    eq(locate.readLocation({ error: true, reason: "RateLimited" }), null, "ipapi 風の失敗");
    eq(locate.readLocation({ latitude: "", longitude: "" }), null, "空文字");
    eq(locate.readLocation({ latitude: 0, longitude: 0 }), null, "0,0 は未知の意味で使われる");
});

test("日本以外の国コードは座標を見るまでもなく捨てる", () => {
    const points = geo.POINTS;
    // 座標が国内でも国コードが違えば採らない（VPN 経由などで食い違うことがある）
    eq(locate.resolve({ lat: 35.681, lon: 139.767, country: "US" }, points), null, "US");
    eq(locate.resolve(null, points), null, "判定できなかったとき");
    const hit = locate.resolve({ lat: 35.681, lon: 139.767, country: "JP" }, points);
    eq(hit.areaCode, "130010", "JP なら通す");
    // 国コードを返さないサービスでも距離の蓋で守られる
    eq(locate.resolve({ lat: 37.566, lon: 126.978, country: "" }, points), null, "国コード無しのソウル");
});

test("問い合わせ先は HTTPS で固定されている", () => {
    ok(locate.PROVIDERS.length >= 2, "候補が 1 つしか無いと落ちたときに詰む");
    for (const p of locate.PROVIDERS) {
        ok(p.url.startsWith("https://"), `${p.name}: 平文で問い合わせている`);
        ok(p.name && p.name !== "", "候補に名前が無い");
    }
    h.note(locate.PROVIDERS.map((p) => p.name).join(" → "));
});
