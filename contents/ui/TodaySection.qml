import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami

import "../code/Forecast.js" as Forecast

// 主役の 1 日。17時発表以降は今日の気温が配信から消えるので、ここに来るのが
// 明日になることがある（見出しの「今日／明日」は日付から組み立てる）。
RowLayout {
    id: section

    // Forecast.currentDay() の結果
    property var day: null
    property string iconName: "weather-none-available"

    readonly property bool hasData: day !== null && day !== undefined

    spacing: Kirigami.Units.largeSpacing

    Kirigami.Icon {
        source: section.iconName
        implicitWidth: Kirigami.Units.iconSizes.huge
        implicitHeight: Kirigami.Units.iconSizes.huge
        Layout.alignment: Qt.AlignTop
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: Kirigami.Units.smallSpacing

        PlasmaExtras.Heading {
            level: 3
            text: section.hasData
                ? Forecast.dayLabel(section.day.date) + "　" + (section.day.label || "")
                : ""
            elide: Text.ElideRight
            Layout.fillWidth: true
        }

        RowLayout {
            spacing: Kirigami.Units.largeSpacing

            PlasmaComponents.Label {
                text: section.hasData ? Forecast.tempText(section.day.tmax) : "–"
                color: Kirigami.Theme.negativeTextColor
                font.pointSize: Kirigami.Theme.defaultFont.pointSize * 1.6
            }

            PlasmaComponents.Label {
                text: section.hasData ? Forecast.tempText(section.day.tmin) : "–"
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
                    text: section.hasData ? Forecast.popText(section.day.pop) : "–"
                }
            }
        }

        PlasmaComponents.Label {
            visible: text !== ""
            text: section.hasData ? Forecast.cleanText(section.day.text) : ""
            wrapMode: Text.WordWrap
            opacity: 0.9
            Layout.fillWidth: true
        }

        PlasmaComponents.Label {
            visible: text !== ""
            text: section.hasData && section.day.wind
                ? "風: " + Forecast.cleanText(section.day.wind)
                : ""
            wrapMode: Text.WordWrap
            font: Kirigami.Theme.smallFont
            opacity: 0.7
            Layout.fillWidth: true
        }
    }
}
