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

PlasmoidItem {
    id: root

    readonly property bool autoLocation: Plasmoid.configuration.locationMode === 0
    // 判定結果は設定に残してあるが、区域が再編されて消えていることもあるので実在を確かめる
    readonly property bool usingDetected: autoLocation
        && Areas.areaIndex(Plasmoid.configuration.detectedOfficeCode,
                           Plasmoid.configuration.detectedAreaCode) >= 0

    readonly property string officeCode: usingDetected
        ? Plasmoid.configuration.detectedOfficeCode
        : Plasmoid.configuration.officeCode
    readonly property string areaCode: usingDetected
        ? Plasmoid.configuration.detectedAreaCode
        : Plasmoid.configuration.areaCode
    // 保存済みの名前ではなくコードから毎回組み立てる（選び直さなくても表記が揃う）
    readonly property string areaName: {
        var n = Areas.displayName(officeCode, areaCode);
        return n !== "" ? n : Plasmoid.configuration.areaName;
    }

    property string locateError: ""

    property var parsed: null
    property string overview: ""
    property string errorText: ""
    property bool busy: false

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
        if (today.text) {
            parts.push(Forecast.cleanText(today.text));
        }
        parts.push("最高 " + Forecast.tempText(today.tmax)
                 + " / 最低 " + Forecast.tempText(today.tmin)
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

    function request(url, onOk, onFail) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== XMLHttpRequest.DONE) {
                return;
            }
            if (xhr.status === 200) {
                try {
                    onOk(JSON.parse(xhr.responseText));
                } catch (e) {
                    onFail("応答を解析できませんでした: " + e);
                }
            } else {
                onFail("取得に失敗しました (HTTP " + xhr.status + ")");
            }
        };
        xhr.send();
    }

    function reload() {
        if (busy) {
            return;
        }
        busy = true;
        request(forecastUrl(), function (json) {
            try {
                root.parsed = Forecast.parse(json, root.areaCode);
                root.errorText = "";
            } catch (e) {
                root.errorText = "予報データの解析に失敗しました: " + e;
            }
            root.busy = false;
        }, function (msg) {
            root.errorText = msg;
            root.busy = false;
        });

        request(overviewUrl(), function (json) {
            root.overview = json.text ? json.text.replace(/\n+/g, "\n").trim() : "";
        }, function () {
            root.overview = "";
        });
    }

    // 予報区と地域は別々に届くので、片方だけ新しい状態で取りに行かないよう一拍待つ
    Timer {
        id: reloadDebounce
        interval: 200
        onTriggered: root.reload()
    }

    onOfficeCodeChanged: reloadDebounce.restart()
    onAreaCodeChanged: reloadDebounce.restart()

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

    function panelText() {
        if (!hasData) {
            return "–";
        }
        var mode = Plasmoid.configuration.panelContent;
        var temp = Forecast.tempText(today.tmax) + "/" + Forecast.tempText(today.tmin);
        var pop = Forecast.popText(today.pop);
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
                source: root.currentIcon
                Layout.alignment: Qt.AlignCenter
                implicitWidth: compact.vertical
                    ? Math.min(compact.width, Kirigami.Units.iconSizes.medium)
                    : Math.min(compact.height, Kirigami.Units.iconSizes.medium)
                implicitHeight: implicitWidth
                active: compact.containsMouse
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

        collapseMarginsHint: true

        header: PlasmaExtras.PlasmoidHeading {
            RowLayout {
                anchors.fill: parent
                spacing: Kirigami.Units.smallSpacing

                ColumnLayout {
                    spacing: 0
                    Layout.fillWidth: true

                    PlasmaExtras.Heading {
                        level: 4
                        text: root.areaName
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }

                    PlasmaComponents.Label {
                        text: root.parsed
                            ? Forecast.formatReportTime(root.parsed.reportTime)
                            : ""
                        font: Kirigami.Theme.smallFont
                        opacity: 0.7
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }

                    // 自動判定に失敗すると設定の地域が出る。黙って別の土地を出さない。
                    PlasmaComponents.Label {
                        visible: root.autoLocation && !root.usingDetected && root.locateError !== ""
                        text: root.locateError + "（設定の地域を表示中）"
                        font: Kirigami.Theme.smallFont
                        color: Kirigami.Theme.neutralTextColor
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }
                }

                PlasmaComponents.BusyIndicator {
                    running: root.busy
                    visible: root.busy
                    implicitWidth: Kirigami.Units.iconSizes.small
                    implicitHeight: Kirigami.Units.iconSizes.small
                }

                PlasmaComponents.ToolButton {
                    icon.name: "view-refresh"
                    display: PlasmaComponents.AbstractButton.IconOnly
                    text: "更新"
                    enabled: !root.busy
                    onClicked: root.reload()

                    PlasmaComponents.ToolTip.text: text
                    PlasmaComponents.ToolTip.visible: hovered
                    PlasmaComponents.ToolTip.delay: Kirigami.Units.toolTipDelay
                }
            }
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

                ColumnLayout {
                        width: scroll.availableWidth
                        spacing: Kirigami.Units.largeSpacing

                    // ---- 今日 ----
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: Kirigami.Units.smallSpacing
                        spacing: Kirigami.Units.largeSpacing

                        Kirigami.Icon {
                            source: root.currentIcon
                            implicitWidth: Kirigami.Units.iconSizes.huge
                            implicitHeight: Kirigami.Units.iconSizes.huge
                            Layout.alignment: Qt.AlignTop
                        }

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Kirigami.Units.smallSpacing

                            PlasmaExtras.Heading {
                                level: 3
                                text: root.hasData
                                    ? Forecast.dayLabel(root.today.date) + "　" + (root.today.label || "")
                                    : ""
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }

                            RowLayout {
                                spacing: Kirigami.Units.largeSpacing

                                PlasmaComponents.Label {
                                    text: root.hasData ? Forecast.tempText(root.today.tmax) : "–"
                                    color: Kirigami.Theme.negativeTextColor
                                    font.pointSize: Kirigami.Theme.defaultFont.pointSize * 1.6
                                }

                                PlasmaComponents.Label {
                                    text: root.hasData ? Forecast.tempText(root.today.tmin) : "–"
                                    color: Kirigami.Theme.linkColor
                                    font.pointSize: Kirigami.Theme.defaultFont.pointSize * 1.6
                                }

                                RowLayout {
                                    spacing: Kirigami.Units.smallSpacing
                                    Kirigami.Icon {
                                        source: "weather-showers-symbolic"
                                        implicitWidth: Kirigami.Units.iconSizes.small
                                        implicitHeight: Kirigami.Units.iconSizes.small
                                    }
                                    PlasmaComponents.Label {
                                        text: root.hasData ? Forecast.popText(root.today.pop) : "–"
                                    }
                                }
                            }

                            PlasmaComponents.Label {
                                visible: text !== ""
                                text: root.hasData ? Forecast.cleanText(root.today.text) : ""
                                wrapMode: Text.WordWrap
                                opacity: 0.9
                                Layout.fillWidth: true
                            }

                            PlasmaComponents.Label {
                                visible: text !== ""
                                text: root.hasData && root.today.wind
                                    ? "風: " + Forecast.cleanText(root.today.wind)
                                    : ""
                                wrapMode: Text.WordWrap
                                font: Kirigami.Theme.smallFont
                                opacity: 0.7
                                Layout.fillWidth: true
                            }
                        }
                    }

                    // ---- 今日これからの降水確率 ----
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Kirigami.Units.smallSpacing
                        visible: popRepeater.count > 0

                        PlasmaComponents.Label {
                            text: "これからの降水確率"
                            font: Kirigami.Theme.smallFont
                            opacity: 0.7
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Kirigami.Units.smallSpacing

                            Repeater {
                                id: popRepeater
                                model: root.parsed ? Forecast.remainingPops(root.parsed).slice(0, 4) : []

                                delegate: ColumnLayout {
                                    required property var modelData
                                    spacing: 0
                                    Layout.fillWidth: true

                                    PlasmaComponents.Label {
                                        Layout.alignment: Qt.AlignHCenter
                                        text: modelData.hour + "時"
                                        font: Kirigami.Theme.smallFont
                                        opacity: 0.7
                                    }
                                    PlasmaComponents.Label {
                                        Layout.alignment: Qt.AlignHCenter
                                        text: modelData.value + "%"
                                        font.bold: modelData.value >= 50
                                    }
                                }
                            }
                        }
                    }

                    Kirigami.Separator { Layout.fillWidth: true }

                    // ---- 週間予報 ----
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Kirigami.Units.smallSpacing

                        Repeater {
                            model: root.parsed
                                ? root.parsed.order.filter(function (d) {
                                      return root.today && d > root.today.date;
                                  })
                                : []

                            delegate: RowLayout {
                                required property var modelData
                                readonly property var day: root.parsed.days[modelData]

                                Layout.fillWidth: true
                                spacing: Kirigami.Units.smallSpacing

                                PlasmaComponents.Label {
                                    text: Forecast.shortDate(day.date)
                                    Layout.preferredWidth: Kirigami.Units.gridUnit * 4
                                }

                                Kirigami.Icon {
                                    source: day.code ? Telops.icon(day.code, false) : "weather-none-available"
                                    implicitWidth: Kirigami.Units.iconSizes.smallMedium
                                    implicitHeight: Kirigami.Units.iconSizes.smallMedium
                                }

                                PlasmaComponents.Label {
                                    text: day.label || "–"
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }

                                PlasmaComponents.Label {
                                    text: Forecast.popText(day.pop)
                                    horizontalAlignment: Text.AlignRight
                                    opacity: 0.8
                                    Layout.preferredWidth: Kirigami.Units.gridUnit * 2.5
                                }

                                PlasmaComponents.Label {
                                    text: Forecast.tempText(day.tmax)
                                    color: Kirigami.Theme.negativeTextColor
                                    horizontalAlignment: Text.AlignRight
                                    Layout.preferredWidth: Kirigami.Units.gridUnit * 2
                                }

                                PlasmaComponents.Label {
                                    text: Forecast.tempText(day.tmin)
                                    color: Kirigami.Theme.linkColor
                                    horizontalAlignment: Text.AlignRight
                                    Layout.preferredWidth: Kirigami.Units.gridUnit * 2
                                }
                            }
                        }
                    }

                    // ---- 概況 ----
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.bottomMargin: Kirigami.Units.smallSpacing
                        spacing: Kirigami.Units.smallSpacing
                        visible: root.overview !== ""

                        Kirigami.Separator { Layout.fillWidth: true }

                        PlasmaComponents.Label {
                            text: "概況"
                            font: Kirigami.Theme.smallFont
                            opacity: 0.7
                        }

                        PlasmaComponents.Label {
                            text: root.overview
                            wrapMode: Text.WordWrap
                            font: Kirigami.Theme.smallFont
                            opacity: 0.9
                            Layout.fillWidth: true
                        }
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
