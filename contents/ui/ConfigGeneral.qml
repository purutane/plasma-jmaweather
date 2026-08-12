import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

import "../code/Areas.js" as Areas

Kirigami.FormLayout {
    id: page

    property string cfg_officeCode
    property string cfg_areaCode
    property string cfg_areaName
    property int cfg_updateInterval
    property int cfg_panelContent
    property bool cfg_showAreaNameInPanel

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

    // 設定値が届く順に依存しないよう、選択位置は cfg_ から導出しておく。
    // ユーザーが選ぶと ComboBox 側が currentIndex を書き換えて束縛が切れ、
    // onActivated が cfg_ を更新するので、どちらの向きでも食い違わない。
    QQC2.ComboBox {
        id: officeBox
        Kirigami.FormData.label: "予報区:"
        model: Areas.OFFICES
        textRole: "name"
        Layout.minimumWidth: Kirigami.Units.gridUnit * 14

        currentIndex: {
            var i = Areas.officeIndex(page.cfg_officeCode);
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
        enabled: count > 1
        Layout.minimumWidth: Kirigami.Units.gridUnit * 14

        currentIndex: {
            var i = Areas.areaIndex(page.cfg_officeCode, page.cfg_areaCode);
            return i >= 0 ? i : 0;
        }

        onActivated: page.commitArea()
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
