import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

import "../code/Areas.js" as Areas

// 設定ページの余白（上下左右）は SimpleKCM が持っている。
// FormLayout を直に根へ置くと、先頭の行がタイトルバーに貼り付く。
KCM.SimpleKCM {
    id: page

    property int cfg_locationMode
    property string cfg_detectedOfficeCode
    property string cfg_detectedAreaCode
    property string cfg_detectedAt
    // UI には出さないが、宣言しておかないと設定画面を開いた拍子に既定値へ戻る
    property bool cfg_locationMigrated
    property string cfg_carriedMinStation
    property string cfg_carriedMins
    property string cfg_officeCode
    property string cfg_areaCode
    property string cfg_areaName
    property int cfg_updateInterval
    property int cfg_panelContent
    property bool cfg_showAreaNameInPanel
    property bool cfg_showWarnings

    readonly property bool autoMode: page.cfg_locationMode === 0
    // 自動判定中はコンボに判定結果を映す。手動へ切り替えたときの出発点にもなる。
    readonly property bool hasDetected: Areas.areaIndex(page.cfg_detectedOfficeCode,
                                                        page.cfg_detectedAreaCode) >= 0
    readonly property string shownOfficeCode: page.autoMode && page.hasDetected
        ? page.cfg_detectedOfficeCode
        : page.cfg_officeCode
    readonly property string shownAreaCode: page.autoMode && page.hasDetected
        ? page.cfg_detectedAreaCode
        : page.cfg_areaCode

    property string locateError: ""

    LocationSource {
        id: locator

        onResolved: function (officeCode, areaCode) {
            page.cfg_detectedOfficeCode = officeCode;
            page.cfg_detectedAreaCode = areaCode;
            page.cfg_detectedAt = new Date().toISOString();
            page.locateError = "";
            page.syncBoxes();
        }

        onFailed: function (message) {
            page.locateError = message;
        }
    }

    // 区域コンボの選択内容を設定へ書き戻す
    function commitArea() {
        var office = Areas.OFFICES[officeBox.currentIndex];
        if (!office) {
            return;
        }
        var area = office.areas[Math.max(0, areaBox.currentIndex)];
        if (!area) {
            return;
        }
        page.cfg_officeCode = office.code;
        page.cfg_areaCode = area.code;
        page.cfg_areaName = Areas.displayName(office.code, area.code);
    }

    // ユーザーが一度でも選ぶと currentIndex の束縛は切れるので、判定結果を映すときは
    // こちらから書きに行く（自動へ戻したときと再判定したとき）
    function syncBoxes() {
        var i = Areas.officeIndex(page.shownOfficeCode);
        officeBox.currentIndex = i >= 0 ? i : 0;
        var j = Areas.areaIndex(page.shownOfficeCode, page.shownAreaCode);
        areaBox.currentIndex = j >= 0 ? j : 0;
    }

    function detectedText() {
        if (locator.busy) {
            return "判定中…";
        }
        if (page.hasDetected) {
            var name = Areas.displayName(page.cfg_detectedOfficeCode, page.cfg_detectedAreaCode);
            var at = new Date(page.cfg_detectedAt);
            return isNaN(at.getTime())
                ? name
                : name + "（" + Qt.formatDateTime(at, "M月d日 H:mm") + " 判定）";
        }
        // 判定できていないときは下の（無効になっている）指定がそのまま使われる
        return page.locateError !== "" ? page.locateError : "まだ判定していません";
    }

    Kirigami.FormLayout {
        QQC2.ComboBox {
            Kirigami.FormData.label: "地域の決め方:"
            model: ["自動判定（IP アドレス）", "手動で選ぶ"]
            currentIndex: page.cfg_locationMode
            Layout.minimumWidth: Kirigami.Units.gridUnit * 14

            onActivated: {
                page.cfg_locationMode = currentIndex;
                if (currentIndex === 1) {
                    // 判定結果を出発点にして手動へ移す（東京へ戻さない）
                    page.commitArea();
                } else {
                    page.syncBoxes();
                }
            }
        }

        RowLayout {
            Kirigami.FormData.label: "判定結果:"
            visible: page.autoMode
            spacing: Kirigami.Units.smallSpacing

            QQC2.Label {
                text: page.detectedText()
                wrapMode: Text.WordWrap
                Layout.maximumWidth: Kirigami.Units.gridUnit * 14
                Layout.fillWidth: true
            }

            QQC2.Button {
                text: "再判定"
                icon.name: "view-refresh"
                enabled: !locator.busy
                onClicked: locator.detect()
            }
        }

        // 設定値が届く順に依存しないよう、選択位置は cfg_ から導出しておく。
        // ユーザーが選ぶと ComboBox 側が currentIndex を書き換えて束縛が切れ、
        // onActivated が cfg_ を更新するので、どちらの向きでも食い違わない。
        QQC2.ComboBox {
            id: officeBox
            Kirigami.FormData.label: "予報区:"
            model: Areas.OFFICES
            textRole: "name"
            enabled: !page.autoMode
            Layout.minimumWidth: Kirigami.Units.gridUnit * 14

            currentIndex: {
                var i = Areas.officeIndex(page.shownOfficeCode);
                return i >= 0 ? i : 0;
            }

            onActivated: {
                areaBox.currentIndex = 0;
                page.commitArea();
            }
        }

        QQC2.ComboBox {
            id: areaBox
            Kirigami.FormData.label: "地域:"
            model: officeBox.currentIndex >= 0 && Areas.OFFICES[officeBox.currentIndex]
                ? Areas.OFFICES[officeBox.currentIndex].areas
                : []
            textRole: "name"
            enabled: !page.autoMode && count > 1
            Layout.minimumWidth: Kirigami.Units.gridUnit * 14

            currentIndex: {
                var i = Areas.areaIndex(page.shownOfficeCode, page.shownAreaCode);
                return i >= 0 ? i : 0;
            }

            onActivated: page.commitArea()
        }

        QQC2.Label {
            visible: page.autoMode
            Layout.maximumWidth: Kirigami.Units.gridUnit * 20
            text: "自動判定は接続元の IP アドレスを外部サービス（get.geojs.io / ipwho.is）に問い合わせます。"
                + "回線によっては契約者の登録地に丸められるので、外れるときは手動で選んでください。"
            wrapMode: Text.WordWrap
            font: Kirigami.Theme.smallFont
            opacity: 0.7
        }

        Item {
            Kirigami.FormData.isSection: true
        }

        QQC2.ComboBox {
            Kirigami.FormData.label: "パネルの表示:"
            model: ["アイコンのみ", "気温", "降水確率", "気温と降水確率"]
            currentIndex: page.cfg_panelContent
            onActivated: page.cfg_panelContent = currentIndex
            Layout.minimumWidth: Kirigami.Units.gridUnit * 14
        }

        QQC2.CheckBox {
            Kirigami.FormData.label: "地域名:"
            text: "パネルにも表示する"
            checked: page.cfg_showAreaNameInPanel
            onToggled: page.cfg_showAreaNameInPanel = checked
        }

        QQC2.CheckBox {
            id: warningCheck
            Kirigami.FormData.label: "警報・注意報:"
            text: "発表中のものを表示する"
            checked: page.cfg_showWarnings
            onToggled: page.cfg_showWarnings = checked
        }

        QQC2.Label {
            visible: warningCheck.checked
            Layout.maximumWidth: Kirigami.Units.gridUnit * 20
            text: "パネルに印が付くのは警報以上のときだけです。注意報は展開表示に出ます。"
            wrapMode: Text.WordWrap
            font: Kirigami.Theme.smallFont
            opacity: 0.7
        }

        QQC2.SpinBox {
            Kirigami.FormData.label: "更新間隔:"
            from: 5
            to: 360
            stepSize: 5
            value: page.cfg_updateInterval
            onValueModified: page.cfg_updateInterval = value
            textFromValue: function (value) {
                return value + " 分";
            }
            valueFromText: function (text) {
                return parseInt(text, 10);
            }
        }

        QQC2.Label {
            Layout.maximumWidth: Kirigami.Units.gridUnit * 20
            text: "データ提供: 気象庁（www.jma.go.jp）\n短期予報は 1 日 3 回（5時・11時・17時頃）、週間予報は 1 日 2 回更新されます。"
            wrapMode: Text.WordWrap
            font: Kirigami.Theme.smallFont
            opacity: 0.7
        }
    }
}
