#!/usr/bin/env node
// テスト一式。
//
//     node tests/run.js              固定フィクスチャ（tests/fixtures/*.json）で検証
//     node tests/run.js --all        tests/fixtures/all/ の全 58 予報区でも検証
//     node tests/run.js 受け皿       名前に含まれる文字列で絞り込み
//
// 気象庁の配信時刻に依存する挙動があるので、時刻は日本時間に固定して走らせる。

process.env.TZ = "Asia/Tokyo";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const h = require("./harness");

const args = process.argv.slice(2);
const every = args.includes("--all");
const skipLint = args.includes("--no-lint");
const filter = args.find((a) => !a.startsWith("-"));

// ---- QML の静的チェック ----
// JS 側のテストは QML を実行しないので、main.qml の構文と型の間違いはここでしか出ない。
function lint() {
    const files = fs
        .readdirSync(path.join(h.ROOT, "contents", "ui"))
        .filter((f) => f.endsWith(".qml"))
        .map((f) => path.join("contents", "ui", f))
        .concat(path.join("contents", "config", "config.qml"));

    const r = spawnSync("qmllint", files, { cwd: h.ROOT, encoding: "utf8" });
    if (r.error && r.error.code === "ENOENT") {
        console.log("  - qmllint が無いので飛ばす（pacman -S qt6-declarative）\n");
        return true;
    }
    const out = ((r.stdout || "") + (r.stderr || "")).trim();
    if (r.status === 0) {
        console.log(`  ✓ qmllint  (${files.length} ファイル)\n`);
        return true;
    }
    console.log(`  ✗ qmllint`);
    console.log(out.replace(/^/gm, "      ") + "\n");
    return false;
}

async function main() {
    let linted = true;
    if (!skipLint && !filter) {
        console.log("QML");
        linted = lint();
    }

    require("./cases/areas.test");
    require("./cases/telops.test");
    require("./cases/locate.test");
    require("./cases/config.test");
    const forecast = require("./cases/forecast.test");

    if (every) {
        const dir = path.join(h.FIXTURE_DIR, "all");
        if (h.fixtureCodes(dir).length === 0) {
            console.error(
                "tests/fixtures/all/ が空です。python3 tools/fetch_fixtures.py --all を実行してください。"
            );
            process.exit(2);
        }
        forecast.register(dir, "（全国）");
    }

    console.log(every ? "テスト（全国フィクスチャ込み）" : "テスト");
    const { passed, failures } = await h.run(filter);

    const total = passed + failures.length;
    console.log("");
    if (failures.length === 0 && linted) {
        console.log(`${total} 件すべて成功`);
        process.exit(0);
    }
    if (failures.length) {
        console.log(`${failures.length}/${total} 件失敗`);
    }
    process.exit(1);
}

main();
