import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.components as PlasmaComponents
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami

import "../code/Forecast.js" as Forecast
import "../code/Telops.js" as Telops
import "../code/Areas.js" as Areas
import "../code/Locate.js" as Locate
import "../code/Warning.js" as Warning

PlasmoidItem {
    id: root

    readonly property bool autoLocation: Plasmoid.configuration.locationMode === 0

    // 自動判定と手動指定のどちらを使うかは設定画面と同じ判断でなければならないので、
    // Locate.effectiveArea() に寄せてある（別々に書くと片方だけ直したときにずれる）
    readonly property var activeArea: Locate.effectiveArea(
        autoLocation,
        Plasmoid.configuration.detectedOfficeCode,
        Plasmoid.configuration.detectedAreaCode,
        Plasmoid.configuration.officeCode,
        Plasmoid.configuration.areaCode)

    readonly property bool usingDetected: activeArea.detected
    readonly property string officeCode: activeArea.officeCode
    readonly property string areaCode: activeArea.areaCode
    // 保存済みの名前ではなくコードから毎回組み立てる（選び直さなくても表記が揃う）
    readonly property string areaName: {
        var n = Areas.displayName(officeCode, areaCode);
        return n !== "" ? n : Plasmoid.configuration.areaName;
    }

    property string locateError: ""

    property var parsed: null
    property string overview: ""
    property string errorText: ""
    // 3 本とも終わるまで回す。予報だけを見ていると、概況や警報がまだ飛んでいる
    // うちにインジケータが止まる。
    readonly property bool busy: forecastRequest.busy
        || overviewRequest.busy
        || warningRequest.busy

    property var warning: null
    property string warningError: ""
    readonly property bool showWarnings: Plasmoid.configuration.showWarnings
    // 「発表なし」と「取れていない」を見分けられるよう、失敗しても枠は出す
    readonly property bool showWarningBlock: showWarnings
        && (warning !== null || warningError !== "")
    // パネルで目立たせるのは警報以上だけ。注意報（とくに雷・濃霧）は全国のどこかで
    // 年中出ているので、パネルに出すと常時点灯して意味が薄れる。
    readonly property bool hasWarning: showWarnings && Warning.hasWarning(warning)
    readonly property bool hasAnyWarning: showWarnings && Warning.hasAny(warning)

    readonly property var today: parsed ? Forecast.currentDay(parsed) : null
    readonly property bool hasData: today !== null && today !== undefined

    // 夜アイコンは実際に今日を出しているときだけ。翌日に繰り上がっているなら昼アイコン。
    readonly property string currentIcon: hasData && today.code
        ? Telops.icon(today.code, Forecast.isNight() && Forecast.isToday(today))
        : "weather-none-available"

    Plasmoid.icon: currentIcon
    Plasmoid.status: PlasmaCore.Types.ActiveStatus

    preferredRepresentation: Plasmoid.formFactor === PlasmaCore.Types.Planar
        ? fullRepresentation
        : compactRepresentation

    toolTipMainText: areaName + (hasData && today.label ? " – " + today.label : "")
    toolTipSubText: {
        if (errorText) {
            return errorText;
        }
        if (!hasData) {
            return "読み込み中…";
        }
        var parts = [];
        if (hasAnyWarning) {
            parts.push(Warning.summary(warning));
        }
        if (today.text) {
            parts.push(Forecast.cleanText(today.text));
        }
        parts.push("最高 " + Forecast.tempText(today.tmax)
                 + " / 最低 " + Forecast.tempText(today.tmin)
                 + (today.tminCarried ? "（前日発表）" : "")
                 + "   降水 " + Forecast.popText(today.pop));
        parts.push(Forecast.formatReportTime(parsed.reportTime));
        return parts.join("\n");
    }

    function forecastUrl() {
        return "https://www.jma.go.jp/bosai/forecast/data/forecast/"
             + Areas.endpoint(officeCode) + ".json";
    }

    function overviewUrl() {
        return "https://www.jma.go.jp/bosai/forecast/data/overview_forecast/"
             + Areas.endpoint(officeCode) + ".json";
    }

    // 警報は予報と逆で、読み替えてはいけない。十勝 (014030) と奄美 (460040) は
    // 警報だと自分のコードで配信されていて、読み替え先（014100 / 460100）の
    // JSON にはその地域が入っていない。Areas.endpoint() を挟むと警報が出なくなる。
    //
    // data/r8/ が現行の配信。data/warning/ にも同名の JSON があるが更新が
    // 止まっているので、そちらを見ると特別警報が出ていても静かなままになる。
    function warningUrl() {
        return "https://www.jma.go.jp/bosai/warning/data/r8/"
             + officeCode + ".json";
    }

    HttpRequest {
        id: forecastRequest

        onLoaded: function (json) {
            try {
                var parsed = Forecast.parse(json, root.areaCode);
                var saved = root.carriedMin();
                Forecast.applyCarriedMin(parsed, saved);
                root.carryMin(parsed, saved);
                root.parsed = parsed;
                root.errorText = "";
            } catch (e) {
                root.errorText = "予報データの解析に失敗しました: " + e;
            }
        }

        onFailed: function (message) {
            root.errorText = message;
        }
    }

    // 概況は無くても困らないので、取れなければ黙って畳む
    HttpRequest {
        id: overviewRequest

        onLoaded: function (json) {
            root.overview = json.text ? json.text.replace(/\n+/g, "\n").trim() : "";
        }

        onFailed: function (message) {
            root.overview = "";
        }
    }

    // 警報が取れなくても予報は出す。取れていないことは展開表示に出す。
    HttpRequest {
        id: warningRequest

        onLoaded: function (json) {
            try {
                root.warning = Warning.parse(json, root.areaCode);
                root.warningError = "";
            } catch (e) {
                root.warning = null;
                root.warningError = "警報・注意報を読めませんでした";
            }
        }

        onFailed: function (message) {
            root.warning = null;
            root.warningError = "警報・注意報を取得できませんでした";
        }
    }

    function carriedMin() {
        return {
            station: Plasmoid.configuration.carriedMinStation,
            mins: Plasmoid.configuration.carriedMins
        };
    }

    // 今日の朝の最低気温は 5時・11時発表から消えるので、先の日の分を控えておいて翌日以降に使う。
    // 予報は 30 分ごとに取り直すため、変わっていないのに毎回書き込まないようにする。
    function carryMin(parsed, saved) {
        var rec = Forecast.carriedFrom(parsed, saved);
        if (!rec || (saved.station === rec.station && saved.mins === rec.mins)) {
            return;
        }
        Plasmoid.configuration.carriedMinStation = rec.station;
        Plasmoid.configuration.carriedMins = rec.mins;
    }

    function reload() {
        if (busy) {
            return;
        }
        forecastRequest.get(forecastUrl());
        overviewRequest.get(overviewUrl());

        if (!showWarnings) {
            root.warning = null;
            root.warningError = "";
            return;
        }
        warningRequest.get(warningUrl());
    }

    // 予報区と地域は別々に届くので、片方だけ新しい状態で取りに行かないよう一拍待つ
    Timer {
        id: reloadDebounce
        interval: 200
        onTriggered: root.reload()
    }

    onOfficeCodeChanged: reloadDebounce.restart()
    onAreaCodeChanged: reloadDebounce.restart()
    onShowWarningsChanged: reloadDebounce.restart()

    // ---- 現在地の自動判定 ----

    LocationSource {
        id: locator

        onResolved: function (officeCode, areaCode) {
            Plasmoid.configuration.detectedOfficeCode = officeCode;
            Plasmoid.configuration.detectedAreaCode = areaCode;
            Plasmoid.configuration.detectedAt = new Date().toISOString();
            root.locateError = "";
        }

        onFailed: function (message) {
            root.locateError = message;
        }
    }

    // 予報は 30 分ごとに取りに行くが、現在地はそう動かないので 1 日 1 回で足りる。
    // 外部サービスに毎回聞きに行かないための間引き。
    function locationStale() {
        var at = Date.parse(Plasmoid.configuration.detectedAt);
        return isNaN(at) || Date.now() - at > 24 * 3600 * 1000;
    }

    // autoLocation の束縛は移行直後にまだ古い値を返すので、ここは設定を直接見る
    function detectLocation(force) {
        if (Plasmoid.configuration.locationMode !== 0) {
            return;
        }
        if (force || locationStale()) {
            locator.detect();
        }
    }

    // 1.0 からの持ち越し。既に地域を選んでいた人を勝手に自動判定へ動かさない。
    // 既定のまま使っていた人（＝東京地方）と新規の人だけが自動になる。
    function migrateLocation() {
        if (Plasmoid.configuration.locationMigrated) {
            return;
        }
        if (Plasmoid.configuration.officeCode !== "130000"
                || Plasmoid.configuration.areaCode !== "130010") {
            Plasmoid.configuration.locationMode = 1;
        }
        Plasmoid.configuration.locationMigrated = true;
    }

    onAutoLocationChanged: detectLocation(false)

    Component.onCompleted: {
        migrateLocation();
        detectLocation(false);
        reload();
    }

    Timer {
        interval: Math.max(5, Plasmoid.configuration.updateInterval) * 60000
        running: true
        repeat: true
        onTriggered: root.reload()
    }

    // 日付をまたいだら「今日」がずれるので、次の0時に組み直す
    Timer {
        id: midnight
        repeat: false
        running: true
        interval: {
            var now = new Date();
            var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
            return Math.max(1000, next - now);
        }
        onTriggered: {
            root.detectLocation(false);
            root.reload();
            interval = 24 * 3600 * 1000;
            repeat = true;
            restart();
        }
    }

    // 欠損は値ごとのダッシュで表す。先に「読み込み中は –」と返してしまうと、
    // 「アイコンのみ」を選んでいる人のパネルにも起動直後と取得失敗中だけ文字が出る。
    function panelText() {
        var mode = Plasmoid.configuration.panelContent;
        var temp = hasData ? Forecast.tempPairText(today) : "–";
        var pop = hasData ? Forecast.popText(today.pop) : "–";
        if (mode === 1) {
            return temp;
        }
        if (mode === 2) {
            return pop;
        }
        if (mode === 3) {
            return temp + " " + pop;
        }
        return "";
    }

    compactRepresentation: MouseArea {
        id: compact

        readonly property bool vertical: Plasmoid.formFactor === PlasmaCore.Types.Vertical
        readonly property string text: root.panelText()
        readonly property bool showText: text.length > 0
        readonly property bool showName: Plasmoid.configuration.showAreaNameInPanel

        Layout.minimumWidth: vertical ? 0 : compactLayout.implicitWidth
        Layout.maximumWidth: vertical ? Infinity : compactLayout.implicitWidth
        Layout.minimumHeight: vertical ? compactLayout.implicitHeight : 0
        Layout.maximumHeight: vertical ? compactLayout.implicitHeight : Infinity

        acceptedButtons: Qt.LeftButton | Qt.MiddleButton
        hoverEnabled: true

        onClicked: function (mouse) {
            if (mouse.button === Qt.MiddleButton) {
                root.reload();
            } else {
                root.expanded = !root.expanded;
            }
        }

        GridLayout {
            id: compactLayout
            anchors.centerIn: parent
            flow: compact.vertical ? GridLayout.TopToBottom : GridLayout.LeftToRight
            columnSpacing: Kirigami.Units.smallSpacing
            rowSpacing: 0

            Kirigami.Icon {
                id: compactIcon
                source: root.currentIcon
                Layout.alignment: Qt.AlignCenter
                implicitWidth: compact.vertical
                    ? Math.min(compact.width, Kirigami.Units.iconSizes.medium)
                    : Math.min(compact.height, Kirigami.Units.iconSizes.medium)
                implicitHeight: implicitWidth
                active: compact.containsMouse

                // 警報の印。アイコン名に頼ると環境によっては出ないので図形で描く。
                // 縁を背景色で抜いて、天気アイコンの一部に見えないようにしている。
                Rectangle {
                    visible: root.hasWarning
                    width: Math.max(5, Math.round(parent.width * 0.34))
                    height: width
                    radius: width / 2
                    anchors.right: parent.right
                    anchors.top: parent.top
                    color: Kirigami.Theme.negativeTextColor
                    border.width: Math.max(1, Math.round(width * 0.18))
                    border.color: Kirigami.Theme.backgroundColor
                }
            }

            ColumnLayout {
                spacing: 0
                visible: compact.showText || compact.showName
                Layout.alignment: Qt.AlignCenter

                PlasmaComponents.Label {
                    visible: compact.showName
                    Layout.alignment: Qt.AlignHCenter
                    text: root.areaName
                    font.pointSize: Kirigami.Theme.smallFont.pointSize
                    opacity: 0.8
                    elide: Text.ElideRight
                }

                PlasmaComponents.Label {
                    visible: compact.showText
                    Layout.alignment: Qt.AlignHCenter
                    text: compact.text
                    font.pointSize: compact.showName
                        ? Kirigami.Theme.smallFont.pointSize
                        : Kirigami.Theme.defaultFont.pointSize
                }
            }
        }
    }

    fullRepresentation: PlasmaExtras.Representation {
        id: full

        Layout.minimumWidth: Kirigami.Units.gridUnit * 20
        Layout.minimumHeight: Kirigami.Units.gridUnit * 18
        Layout.preferredWidth: Kirigami.Units.gridUnit * 26
        Layout.preferredHeight: Kirigami.Units.gridUnit * 30

        header: ForecastHeader {
            areaName: root.areaName
            reportTime: root.parsed ? Forecast.formatReportTime(root.parsed.reportTime) : ""
            // 判定に失敗して設定の地域を出しているときだけ知らせる
            locateError: root.autoLocation && !root.usingDetected ? root.locateError : ""
            busy: root.busy
            onReloadRequested: root.reload()
        }

        // Representation は Page なので、中身は単一の子にまとめてヘッダーの下に置かせる
        Item {
            anchors.fill: parent

            PlasmaExtras.PlaceholderMessage {
                anchors.centerIn: parent
                width: parent.width - Kirigami.Units.gridUnit * 4
                visible: root.errorText !== "" && !root.hasData
                iconName: "dialog-error"
                text: "予報を取得できません"
                explanation: root.errorText
            }

            PlasmaComponents.ScrollView {
                id: scroll
                anchors.fill: parent
                visible: root.hasData
                contentWidth: availableWidth

                // 左右の余白は中身をずらして作る。ScrollView 側にマージンを付けると
                // スクロールバーまで内側に寄ってポップアップの縁から浮く。
                ColumnLayout {
                    x: Kirigami.Units.largeSpacing
                    width: scroll.availableWidth - Kirigami.Units.largeSpacing * 2
                    spacing: Kirigami.Units.largeSpacing

                    WarningSection {
                        Layout.fillWidth: true
                        Layout.topMargin: Kirigami.Units.largeSpacing
                        visible: root.showWarningBlock
                        warning: root.warning
                        errorText: root.warningError
                    }

                    TodaySection {
                        Layout.fillWidth: true
                        // 警報の枠が出ているならその余白で足りる
                        Layout.topMargin: root.showWarningBlock
                            ? 0
                            : Kirigami.Units.largeSpacing
                        day: root.today
                        iconName: root.currentIcon
                    }

                    PopSection {
                        Layout.fillWidth: true
                        // 5 枠以上あっても横に並べきれないので頭から 4 枠だけ
                        pops: root.parsed ? Forecast.remainingPops(root.parsed).slice(0, 4) : []
                    }

                    Kirigami.Separator { Layout.fillWidth: true }

                    WeekSection {
                        Layout.fillWidth: true
                        parsed: root.parsed
                        today: root.today
                    }

                    OverviewSection {
                        Layout.fillWidth: true
                        overview: root.overview
                    }

                    // 末尾の余白。概況が空でも下端に文字が張り付かないよう独立させてある
                    Item {
                        Layout.fillWidth: true
                        implicitHeight: Kirigami.Units.largeSpacing
                    }
                }
            }
        }
    }

    Plasmoid.contextualActions: [
        PlasmaCore.Action {
            text: "今すぐ更新"
            icon.name: "view-refresh"
            onTriggered: root.reload()
        },
        PlasmaCore.Action {
            text: "現在地を判定し直す"
            icon.name: "mark-location"
            visible: root.autoLocation
            onTriggered: root.detectLocation(true)
        }
    ]
}
