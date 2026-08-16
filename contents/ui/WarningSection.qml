import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

import "../code/Warning.js" as Warning

// 発表中の警報・注意報。
//
// 見出しの文（headline）は予報区全体に対するもので、他の地域の話が混ざる。
// 主役は地域別の警報名にして、見出しはそちらの添え物として出す。
ColumnLayout {
    id: section

    // Warning.parse() の結果。取れていないときは null
    property var warning: null
    // 取れなかった理由（空なら取れている）
    property string errorText: ""

    readonly property bool hasWarning: Warning.hasWarning(warning)
    readonly property bool hasAny: Warning.hasAny(warning)

    spacing: Kirigami.Units.smallSpacing

    RowLayout {
        Layout.fillWidth: true
        spacing: Kirigami.Units.smallSpacing
        visible: section.hasWarning

        Kirigami.Icon {
            source: "dialog-warning"
            implicitWidth: Kirigami.Units.iconSizes.small
            implicitHeight: Kirigami.Units.iconSizes.small
            Layout.alignment: Qt.AlignTop
        }

        PlasmaComponents.Label {
            text: Warning.warningNames(section.warning)
            color: Kirigami.Theme.negativeTextColor
            font.bold: true
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }
    }

    PlasmaComponents.Label {
        visible: text !== ""
        text: Warning.advisoryNames(section.warning)
        color: Kirigami.Theme.neutralTextColor
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        Layout.fillWidth: true
    }

    PlasmaComponents.Label {
        visible: section.hasAny && text !== ""
        text: section.warning ? section.warning.headline : ""
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.7
        Layout.fillWidth: true
    }

    // 何も出ていないことも情報。黙って空白にすると、
    // 警報を見ているのかどうかが利用者に分からない。
    PlasmaComponents.Label {
        visible: !section.hasAny && section.errorText === ""
        text: "発表中の警報・注意報はありません"
        font: Kirigami.Theme.smallFont
        opacity: 0.6
        Layout.fillWidth: true
    }

    PlasmaComponents.Label {
        visible: section.errorText !== ""
        text: section.errorText
        color: Kirigami.Theme.neutralTextColor
        font: Kirigami.Theme.smallFont
        wrapMode: Text.WordWrap
        Layout.fillWidth: true
    }
}
