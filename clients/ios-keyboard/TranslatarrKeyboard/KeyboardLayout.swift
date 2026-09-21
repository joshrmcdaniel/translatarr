import UIKit

struct KeyboardLayoutMetrics {
    let rowHeight: CGFloat
    let toolbarHeight: CGFloat
    let accessoryHeight: CGFloat

    init(width: CGFloat, isLandscape: Bool, isPad: Bool) {
        rowHeight = isPad ? 64 : (isLandscape ? 44 : (width >= 400 ? 62 : 58))
        toolbarHeight = isLandscape ? 40 : 44
        accessoryHeight = isLandscape ? 32 : 40
    }

    var typingHeight: CGFloat { rowHeight * 4 }
    var contentHeight: CGFloat { toolbarHeight + accessoryHeight + typingHeight + 8 }
}

/// The visible key is inset inside its button, so the spaces between keycaps
/// still accept touches. Row positions and hit areas stay the same on all pages.
final class KeyboardKeyButton: UIButton {
    enum Style { case character, function, space, accent }

    private let keyStyle: Style

    init(title: String, symbol: String? = nil, style: Style = .function) {
        keyStyle = style
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.title = symbol == nil ? title : nil
        config.image = symbol.flatMap { UIImage(systemName: $0) }
        config.preferredSymbolConfigurationForImage = .init(pointSize: 21, weight: .regular)
        config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 3, bottom: 6, trailing: 3)
        config.background.backgroundInsets = config.contentInsets
        config.background.cornerRadius = 6
        let font = UIFont.systemFont(ofSize: style == .character ? 26 : 16)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var attributes = incoming
            attributes.font = font
            return attributes
        }
        configuration = config
        accessibilityLabel = title
        setContentHuggingPriority(.defaultLow, for: .horizontal)
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.2
        layer.shadowOffset = CGSize(width: 0, height: 1)
        layer.shadowRadius = 0
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func updateConfiguration() {
        guard var config = configuration else { return }
        let normal: UIColor
        if keyStyle == .accent {
            normal = .systemBlue
        } else if isSelected {
            normal = .white
        } else if keyStyle == .function {
            normal = UIColor { $0.userInterfaceStyle == .dark
                ? UIColor(white: 0.28, alpha: 1) : UIColor(white: 0.68, alpha: 1) }
        } else {
            normal = UIColor { $0.userInterfaceStyle == .dark ? UIColor(white: 0.42, alpha: 1) : .white }
        }
        config.background.backgroundColor = isHighlighted ? .systemGray2 : normal
        config.baseForegroundColor = keyStyle == .accent ? .white : (isSelected ? .black : .label)
        configuration = config
    }
}
