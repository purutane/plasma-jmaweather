import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

// 今日これからの降水確率（6時間ごと）。過ぎた時間帯を落とすのは Forecast.js 側。
ColumnLayout {
    id: section

    // Forecast.remainingPops() の結果を必要な分だけ切ったもの
    property var pops: []

    spacing: Kirigami.Units.smallSpacing
    visible: repeater.count > 0

    PlasmaComponents.Label {
        text: "これからの降水確率"
        font: Kirigami.Theme.smallFont
        opacity: 0.7
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: Kirigami.Units.smallSpacing

        Repeater {
            id: repeater
            model: section.pops

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
