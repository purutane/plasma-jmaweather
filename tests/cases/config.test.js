// 設定は main.xml（定義）・ConfigGeneral.qml（設定画面）・main.qml（利用側）の
// 3 箇所に分かれていて、揃っていなくても QML はエラーを出さずに黙って既定値を返す。
// 選択肢を 1 つ足したときに片方を直し忘れる事故が一番起きやすいので、そこを見る。
//
// QML を実行せずソースを読んでいるだけなので、書き方を変えると検出できなくなる。
// 落ちたときは「設定がズレた」のか「書き方が変わった」のかを先に確かめること。

const fs = require("fs");
const path = require("path");
const h = require("../harness");
const { test, ok, eq, fail } = h;

const read = (...p) => fs.readFileSync(path.join(h.ROOT, ...p), "utf8");

const XML = read("contents", "config", "main.xml");
const CONFIG_QML = read("contents", "ui", "ConfigGeneral.qml");
const MAIN_QML = read("contents", "ui", "main.qml");

const ENTRIES = [...XML.matchAll(/<entry name="(\w+)" type="(\w+)"/g)].map((m) => ({
    name: m[1],
    type: m[2]
}));
// <choice> は Enum ごとに分けて読む（全部まとめて数えると Enum を足した途端にずれる）
function choicesOf(name) {
    const block = XML.match(new RegExp(`<entry name="${name}"[^]*?</entry>`));
    if (!block) {
        return [];
    }
    return [...block[0].matchAll(/<choice name="(\w+)"\/>/g)].map((m) => m[1]);
}

function defaultOf(name) {
    const m = XML.match(new RegExp(`name="${name}"[^]*?<default>([^<]*)</default>`));
    return m ? m[1] : null;
}

const CHOICES = choicesOf("panelContent");

test("設定項目が main.xml と設定画面で揃っている", () => {
    ok(ENTRIES.length > 0, "main.xml から設定項目を読めない");
    for (const entry of ENTRIES) {
        ok(
            CONFIG_QML.includes(`cfg_${entry.name}`),
            `${entry.name}: ConfigGeneral.qml に cfg_${entry.name} が無い`
        );
    }
    const declared = [...CONFIG_QML.matchAll(/property \w+ cfg_(\w+)/g)].map((m) => m[1]);
    for (const name of declared) {
        ok(
            ENTRIES.some((e) => e.name === name),
            `cfg_${name} に対応する <entry> が main.xml に無い（設定画面で書いても保存されない）`
        );
    }
    eq(declared.length, ENTRIES.length, "設定項目の件数");
});

test("main.qml が読む設定はすべて定義済み", () => {
    const used = new Set(
        [...MAIN_QML.matchAll(/Plasmoid\.configuration\.(\w+)/g)].map((m) => m[1])
    );
    ok(used.size > 0, "main.qml から設定の参照を読めない");
    for (const name of used) {
        ok(
            ENTRIES.some((e) => e.name === name),
            `main.qml が読んでいる ${name} が main.xml に無い（黙って undefined になる）`
        );
    }
});

test("パネル表示の選択肢が定義と設定画面と実装で揃っている", () => {
    // main.xml の <choices>
    ok(CHOICES.length > 0, "panelContent の選択肢を読めない");

    // ConfigGeneral.qml のコンボボックス
    const combo = CONFIG_QML.match(
        /Kirigami\.FormData\.label: "パネルの表示:"[^]*?model: \[([^\]]*)\]/
    );
    ok(combo, "ConfigGeneral.qml のパネル表示コンボを読めない");
    const labels = combo[1].split(",").map((s) => s.trim()).filter(Boolean);
    eq(
        labels.length,
        CHOICES.length,
        `選択肢の件数が合わない（main.xml: ${CHOICES.join(",")} / 設定画面: ${labels.length} 件）`
    );

    // main.qml の panelText()
    const body = MAIN_QML.match(/function panelText\(\) \{([^]*?)\n    \}/);
    ok(body, "main.qml の panelText() を読めない");
    const handled = new Set(
        [...body[1].matchAll(/mode === (\d+)/g)].map((m) => parseInt(m[1], 10))
    );
    for (let i = 1; i < CHOICES.length; i++) {
        ok(
            handled.has(i),
            `panelText() に ${i} (${CHOICES[i]}) の分岐が無い。パネルが空になる`
        );
    }
    for (const i of handled) {
        ok(i < CHOICES.length, `panelText() の分岐 ${i} に対応する選択肢が無い`);
    }
    // 0 番（アイコンのみ）は分岐せず末尾の空文字に落ちる
    ok(!handled.has(0), "0 番は分岐せず既定に落とす前提");
    ok(/return "";\s*$/.test(body[1].trim()), "panelText() が空文字で終わっていない");
});

test("既定値が選択肢の範囲に収まる", () => {
    for (const name of ["panelContent", "locationMode"]) {
        const choices = choicesOf(name);
        ok(choices.length > 0, `${name} の選択肢を読めない`);
        const def = defaultOf(name);
        ok(def !== null, `${name} の既定値を読めない`);
        const value = parseInt(def, 10);
        ok(
            value >= 0 && value < choices.length,
            `${name} の既定値 ${value} が選択肢の範囲外 (0..${choices.length - 1})`
        );
    }
});

test("地域の決め方が定義と設定画面と実装で揃っている", () => {
    const choices = choicesOf("locationMode");
    // 0 番＝自動、1 番＝手動。この並びを前提に main.qml と設定画面が数値で分岐している
    eq(choices.length, 2, `locationMode の選択肢: ${choices.join(",")}`);
    eq(choices[0], "Auto", "0 番が自動でないと既定が手動になる");

    const combo = CONFIG_QML.match(
        /Kirigami\.FormData\.label: "地域の決め方:"[^]*?model: \[([^\]]*)\]/
    );
    ok(combo, "ConfigGeneral.qml の地域の決め方コンボを読めない");
    const labels = combo[1].split(",").map((s) => s.trim()).filter(Boolean);
    eq(labels.length, choices.length, "選択肢の件数が設定画面と合わない");

    // 自動を 0 番として読んでいるか（ずれると手動指定が自動扱いになる）
    ok(
        /Plasmoid\.configuration\.locationMode === 0/.test(MAIN_QML),
        "main.qml が locationMode の 0 番を自動として見ていない"
    );
    ok(
        /cfg_locationMode === 0/.test(CONFIG_QML),
        "ConfigGeneral.qml が locationMode の 0 番を自動として見ていない"
    );
    eq(defaultOf("locationMode"), "0", "既定は自動判定");
});

test("1.0 からの移行判定が既定値と同じ地域を見ている", () => {
    // 「既定のまま使っていた人」だけを自動判定へ移す。main.xml の既定値を変えたら
    // main.qml のここも変えないと、設定済みの人まで自動へ動いてしまう。
    const body = MAIN_QML.match(/function migrateLocation\(\) \{([^]*?)\n    \}/);
    ok(body, "main.qml の migrateLocation() を読めない");
    for (const name of ["officeCode", "areaCode"]) {
        const value = defaultOf(name);
        ok(
            body[1].includes(`"${value}"`),
            `migrateLocation() が ${name} の既定値 ${value} を見ていない`
        );
    }
    ok(
        /locationMigrated/.test(body[1]),
        "移行済みの印を付けないと毎回走ってしまう"
    );
});

test("自動判定の結果は設定に保存して使い回す", () => {
    // 外部サービスへ毎回問い合わせないための間引き。ここが消えると 30 分ごとに叩く
    ok(
        /function locationStale\(\)[^]*?detectedAt/.test(MAIN_QML),
        "main.qml が detectedAt を見て判定の古さを測っていない"
    );
    ok(
        /24 \* 3600 \* 1000/.test(MAIN_QML),
        "再判定の間隔（1 日）が main.qml に無い"
    );
    for (const name of ["detectedOfficeCode", "detectedAreaCode", "detectedAt"]) {
        ok(
            new RegExp(`Plasmoid\\.configuration\\.${name} =`).test(MAIN_QML),
            `${name} を書き戻していない`
        );
    }
});

test("更新間隔の下限が設定画面と実装で揃っている", () => {
    const spin = CONFIG_QML.match(/from: (\d+)[^]*?to: (\d+)/);
    ok(spin, "ConfigGeneral.qml の更新間隔を読めない");
    const guard = MAIN_QML.match(
        /Math\.max\((\d+), Plasmoid\.configuration\.updateInterval\)/
    );
    ok(guard, "main.qml のタイマーに下限のガードが無い");
    eq(
        parseInt(guard[1], 10),
        parseInt(spin[1], 10),
        "設定画面の下限とタイマーのガードが違う"
    );

    const def = XML.match(/name="updateInterval"[^]*?<default>(\d+)<\/default>/);
    ok(def, "updateInterval の既定値を読めない");
    const value = parseInt(def[1], 10);
    ok(
        value >= parseInt(spin[1], 10) && value <= parseInt(spin[2], 10),
        `既定値 ${value} が ${spin[1]}..${spin[2]} の外`
    );
});

test("metadata.json の体裁", () => {
    const meta = JSON.parse(read("metadata.json"));
    eq(meta.KPackageStructure, "Plasma/Applet", "KPackageStructure");
    const id = meta.KPlugin.Id;
    ok(id && !id.startsWith("org.kde."), `プラグイン ID は org.kde 名前空間を使わない: ${id}`);
    // README のインストール手順が同じ ID を指しているか
    ok(read("README.md").includes(id), `README に ${id} が出てこない`);
    ok(meta["X-Plasma-API-Minimum-Version"], "X-Plasma-API-Minimum-Version が無い");
});

test("QML ファイルに残骸が無い", () => {
    const dir = path.join(h.ROOT, "contents", "ui");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".qml"));
    ok(files.length > 0, "contents/ui/ に QML が無い");
    for (const file of files) {
        const src = read("contents", "ui", file);
        const bad = src.match(/console\.(log|debug)\(/g);
        if (bad) {
            fail(`${file}: デバッグ出力が ${bad.length} 件残っている`);
        }
    }
});
