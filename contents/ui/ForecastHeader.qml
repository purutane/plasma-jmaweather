import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami

// 展開表示のヘッダー。地域名・発表時刻・更新ボタン。
PlasmaExtras.PlasmoidHeading {
    id: heading

    property string areaName: ""
    // 「08/16 17:00 発表」。整形は呼ぶ側（main.qml）で済ませて渡す
    property string reportTime: ""
    // 自動判定に失敗して設定の地域を出しているときだけ中身が入る
    property string locateError: ""
    property bool busy: false

    signal reloadRequested()

    // PlasmoidHeading は左右の余白を持たないので自分で足す。右はツールボタンが
    // 自前の余白を持っているぶん狭くしないと右だけ広く見える。
    leftPadding: Kirigami.Units.largeSpacing
    rightPadding: Kirigami.Units.smallSpacing

    // contentItem に入れる（子として置くと高さが背景の 40px 固定になり、
    // 判定失敗の行が出たときにヘッダーからはみ出す）
    contentItem: RowLayout {
        spacing: Kirigami.Units.smallSpacing

        ColumnLayout {
            spacing: 0
            Layout.fillWidth: true

            PlasmaExtras.Heading {
                level: 4
                text: heading.areaName
                elide: Text.ElideRight
                Layout.fillWidth: true
            }

            PlasmaComponents.Label {
                text: heading.reportTime
                font: Kirigami.Theme.smallFont
                opacity: 0.7
                elide: Text.ElideRight
                Layout.fillWidth: true
            }

            // 自動判定に失敗すると設定の地域が出る。黙って別の土地を出さない。
            PlasmaComponents.Label {
                visible: heading.locateError !== ""
                text: heading.locateError + "（設定の地域を表示中）"
                font: Kirigami.Theme.smallFont
                color: Kirigami.Theme.neutralTextColor
                elide: Text.ElideRight
                Layout.fillWidth: true
            }
        }

        PlasmaComponents.BusyIndicator {
            running: heading.busy
            visible: heading.busy
            implicitWidth: Kirigami.Units.iconSizes.small
            implicitHeight: Kirigami.Units.iconSizes.small
        }

        PlasmaComponents.ToolButton {
            icon.name: "view-refresh"
            display: PlasmaComponents.AbstractButton.IconOnly
            text: "更新"
            enabled: !heading.busy
            onClicked: heading.reloadRequested()

            PlasmaComponents.ToolTip.text: text
            PlasmaComponents.ToolTip.visible: hovered
            PlasmaComponents.ToolTip.delay: Kirigami.Units.toolTipDelay
        }
    }
}
