import TranslatarrKit
import UIKit

final class KeyboardViewController: UIInputViewController {
    /// The text the Translate key grabbed and where it came from, so the
    /// replacement step knows whether the OS already handles the delete (a
    /// live selection) or this has to delete each grapheme cluster itself.
    private struct InputSnapshot {
        let text: String
        let wasSelection: Bool
    }

    private enum Mode {
        case letters
        case numbers
        case symbols
    }

    /// Internal rows tolerate UIKit's temporary size during presentation.
    private static let sizePriority = UILayoutPriority(999)

    private func pinHeight(_ view: UIView, to constant: CGFloat) {
        let constraint = view.heightAnchor.constraint(equalToConstant: constant)
        constraint.priority = Self.sizePriority
        constraint.isActive = true
    }

    private let client = TranslatarrAPIClient()
    private var translateTask: Task<Void, Never>?
    private var isShifted = false
    private var isCapsLocked = false
    private var manualShift = false
    private var lastShiftTapTime: TimeInterval = 0
    private let typingAssistant = KeyboardTypingAssistant()
    private var observedContext: KeyboardDocumentContext?
    private var isEditingDocument = false
    private var keyboardHeightConstraint: NSLayoutConstraint?
    private var toolbarHeightConstraint: NSLayoutConstraint?
    private var accessoryHeightConstraint: NSLayoutConstraint?
    private var typingHeightConstraint: NSLayoutConstraint?
    private var mode: Mode = .letters
    private var letterButtons: [UIButton] = []
    private var deleteRepeatTimer: Timer?
    private var chipLongPressTimer: Timer?
    private var chipLongPressFired = false
    private var detailCallout: UIView?
    private var detailCalloutBackdrop: UIControl?
    private var calloutDismissTimer: Timer?

    /// The options from the last successful translate, and the text
    /// currently sitting in the document in their place — tapping a chip
    /// deletes exactly this much and inserts the tapped option instead.
    private var currentTranslations: [TranslationOption] = []
    private var lastInsertedText: String?

    private lazy var nextKeyboardButton = makeToolbarButton(title: "Next keyboard", symbol: "globe")
    private lazy var modeToggleButton = makeKeyButton(title: "123")
    private lazy var emojiButton: KeyboardKeyButton = {
        let button = KeyboardKeyButton(title: "Emoji", symbol: "face.smiling")
        button.accessibilityIdentifier = "keyboard.emojiSwitch"
        button.accessibilityHint = "Tap to switch keyboards. Touch and hold to choose Emoji."
        return button
    }()
    private lazy var moreSymbolsButton = makeKeyButton(title: "#+=")
    private lazy var backToNumbersButton = makeKeyButton(title: "123")
    private lazy var shiftButton = KeyboardKeyButton(title: "Shift", symbol: "shift")
    private lazy var lettersDeleteButton = KeyboardKeyButton(title: "Delete", symbol: "delete.left")
    private lazy var numbersDeleteButton = KeyboardKeyButton(title: "Delete", symbol: "delete.left")
    private lazy var symbolsDeleteButton = KeyboardKeyButton(title: "Delete", symbol: "delete.left")
    private lazy var spaceButton = KeyboardKeyButton(title: "space", style: .space)
    private lazy var returnButton = makeKeyButton(title: "return")
    private lazy var translateButton = makeToolbarButton(title: "Translate", emphasized: true)

    private lazy var languageButton: UIButton = {
        let button = makeToolbarButton(title: currentLanguageTitle())
        var config = button.configuration!
        config.title = currentLanguageTitle()
        config.image = UIImage(systemName: "chevron.down")
        config.imagePlacement = .trailing
        config.imagePadding = 3
        config.preferredSymbolConfigurationForImage = .init(pointSize: 10, weight: .semibold)
        config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
        config.background.cornerRadius = 6
        config.background.backgroundColor = .secondarySystemBackground
        config.baseForegroundColor = .label

        button.configuration = config
        button.showsMenuAsPrimaryAction = true
        button.configurationUpdateHandler = { [weak self] button in
            button.accessibilityLabel = "Translate to \(button.configuration?.title ?? "language")"
            self?.applyPressFeedback(to: button, emphasized: false)
        }
        return button
    }()

    /// Switches to a specific existing conversation, pinning it so every
    /// subsequent translation (and reply-read) uses that exact chat until
    /// the pair is changed or a different conversation is picked. The menu
    /// content is loaded lazily via `UIDeferredMenuElement` when opened,
    /// rather than a custom pane — this is the same lightweight mechanism
    /// `languageButton` already uses, just with async content.
    private lazy var conversationsButton: UIButton = {
        let button = makeToolbarButton(title: "Conversations", symbol: "bubble.left.and.bubble.right")
        button.showsMenuAsPrimaryAction = true
        button.menu = buildConversationsMenu()
        return button
    }()

    /// Reads what the other person wrote (copied from the host app, since a
    /// keyboard extension can't see their message bubbles) and translates it
    /// into the strip below — the reverse direction from typing, for reading
    /// a reply rather than sending one.
    private lazy var pasteTranslateButton: UIButton = {
        let button = makeToolbarButton(title: "Read a reply", symbol: "doc.on.clipboard")
        button.addTarget(self, action: #selector(handlePasteTranslateTap), for: .touchUpInside)
        return button
    }()

    private lazy var statusLabel: UILabel = {
        let label = UILabel()
        label.text = "Translatarr"
        label.textColor = .secondaryLabel
        label.textAlignment = .center
        label.numberOfLines = 2
        label.font = .systemFont(ofSize: 13)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return label
    }()

    private lazy var optionsStrip: UIStackView = {
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.spacing = 6
        stack.distribution = .fillEqually
        stack.isHidden = true
        stack.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return stack
    }()

    private lazy var topRow: UIStackView = {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 6
        row.distribution = .fill
        row.alignment = .fill
        return row
    }()

    private lazy var suggestionStrip: UIStackView = {
        let row = UIStackView()
        row.axis = .horizontal
        row.distribution = .fillEqually
        row.isHidden = true
        return row
    }()

    private lazy var accessoryRow: UIStackView = {
        let row = UIStackView(arrangedSubviews: [statusLabel, optionsStrip, suggestionStrip])
        row.axis = .horizontal
        return row
    }()

    private lazy var keyStack: UIStackView = {
        let stack = UIStackView(arrangedSubviews: [lettersBlock, numbersBlock, symbolsBlock, bottomRowView])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }()

    private let typingArea = UIView()

    private lazy var lettersBlock = buildLettersBlock()
    private lazy var numbersBlock = buildNumbersBlock()
    private lazy var symbolsBlock = buildSymbolsBlock()
    private lazy var bottomRowView = bottomRow()

    private lazy var readingPaneTextView: UITextView = {
        let textView = UITextView()
        textView.isEditable = false
        textView.isSelectable = true
        textView.backgroundColor = .secondarySystemBackground
        textView.layer.cornerRadius = 8
        textView.font = .preferredFont(forTextStyle: .body)
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.delegate = self
        return textView
    }()

    private lazy var readingPaneDoneButton: UIButton = {
        let button = makeKeyButton(title: "Done", emphasized: true)
        pinHeight(button, to: 50)
        button.addTarget(self, action: #selector(hideReadingPane), for: .touchUpInside)
        return button
    }()

    private lazy var readingPane: UIStackView = {
        let stack = UIStackView(arrangedSubviews: [readingPaneTextView, readingPaneDoneButton])
        stack.axis = .vertical
        stack.spacing = 4
        stack.isHidden = true
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }()

    private lazy var stack: UIStackView = {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 0
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }()

    override func loadView() {
        // UIKit's root view negotiates the extension's width and height with
        // the host. Replacing it can collapse the width or retain a stale height.
        super.loadView()
        view.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.12, alpha: 1)
                : UIColor(red: 0.82, green: 0.83, blue: 0.85, alpha: 1)
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        buildLayout()
        wireActions()
        requestSupplementaryLexicon { [weak self] lexicon in
            // UIKit delivers this reply on its lexicon XPC queue.
            DispatchQueue.main.async {
                self?.typingAssistant.useSupplementaryLexicon(lexicon)
                self?.refreshTypingState()
            }
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Lets the container app detect a disabled Full Access toggle and
        // say so plainly, rather than the keyboard just looking broken.
        Config.keyboardHasFullAccess = hasFullAccess
        sanitizeTargetLanguage()
        languageButton.configuration?.title = currentLanguageTitle()
        languageButton.menu = buildLanguageMenu()
        refreshConversationsButtonTitle()
        refreshLanguageButtonEnabled()
        typingAssistant.reset()
        observedContext = KeyboardDocumentContext(textDocumentProxy)
        updateKeyboardMetrics()
        refreshTypingState()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        nextKeyboardButton.isHidden = !needsInputModeSwitchKey
        updateKeyboardMetrics()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopDeleteRepeat()
        dismissDetailCallout()
        translateTask?.cancel()
        typingAssistant.reset()
    }

    // MARK: - Layout

    private func buildLayout() {
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -4),
        ])

        topRow.isLayoutMarginsRelativeArrangement = true
        topRow.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 2, leading: 6, bottom: 2, trailing: 6)
        topRow.addArrangedSubview(languageButton)
        topRow.addArrangedSubview(conversationsButton)
        topRow.addArrangedSubview(nextKeyboardButton)
        topRow.addArrangedSubview(UIView())
        topRow.addArrangedSubview(pasteTranslateButton)
        topRow.addArrangedSubview(translateButton)
        stack.addArrangedSubview(topRow)
        stack.addArrangedSubview(accessoryRow)
        stack.addArrangedSubview(typingArea)

        for pane in [keyStack, readingPane] {
            typingArea.addSubview(pane)
            NSLayoutConstraint.activate([
                pane.leadingAnchor.constraint(equalTo: typingArea.leadingAnchor),
                pane.trailingAnchor.constraint(equalTo: typingArea.trailingAnchor),
                pane.topAnchor.constraint(equalTo: typingArea.topAnchor),
                pane.bottomAnchor.constraint(equalTo: typingArea.bottomAnchor),
            ])
        }
        bottomRowView.heightAnchor.constraint(equalTo: keyStack.heightAnchor, multiplier: 0.25).isActive = true
        // The extension's height request must be required for UIKit to resize
        // its host after rotation. Internal row preferences remain flexible.
        keyboardHeightConstraint = view.heightAnchor.constraint(equalToConstant: 340)
        keyboardHeightConstraint?.isActive = true
        toolbarHeightConstraint = preferredHeight(topRow, 44)
        accessoryHeightConstraint = preferredHeight(accessoryRow, 40)
        typingHeightConstraint = preferredHeight(typingArea, 248)
    }

    private func preferredHeight(_ target: UIView, _ height: CGFloat) -> NSLayoutConstraint {
        let constraint = target.heightAnchor.constraint(equalToConstant: height)
        constraint.priority = Self.sizePriority
        constraint.isActive = true
        return constraint
    }

    private func updateKeyboardMetrics() {
        let landscape = view.window?.windowScene?.interfaceOrientation.isLandscape
            ?? (traitCollection.verticalSizeClass == .compact)
        let metrics = KeyboardLayoutMetrics(
            width: view.bounds.width,
            isLandscape: landscape,
            isPad: traitCollection.userInterfaceIdiom == .pad
        )
        let height = metrics.contentHeight + view.safeAreaInsets.bottom
        keyboardHeightConstraint?.constant = height
        toolbarHeightConstraint?.constant = metrics.toolbarHeight
        accessoryHeightConstraint?.constant = metrics.accessoryHeight
        typingHeightConstraint?.constant = metrics.typingHeight
        let requestedSize = CGSize(width: view.bounds.width, height: height)
        if preferredContentSize != requestedSize { preferredContentSize = requestedSize }
    }

    private func keyBlock(_ rows: [UIView], hidden: Bool = false) -> UIStackView {
        let block = UIStackView(arrangedSubviews: rows)
        block.axis = .vertical
        block.distribution = .fillEqually
        block.isHidden = hidden
        return block
    }

    private func buildLettersBlock() -> UIStackView {
        keyBlock([letterRow("qwertyuiop"), letterRow("asdfghjkl", inset: 0.05), lettersMiddleRow()])
    }

    private func buildNumbersBlock() -> UIStackView {
        keyBlock([
            symbolRow(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]),
            symbolRow(["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""]),
            punctuationRow(toggle: moreSymbolsButton, delete: numbersDeleteButton),
        ], hidden: true)
    }

    private func buildSymbolsBlock() -> UIStackView {
        keyBlock([
            symbolRow(["[", "]", "{", "}", "#", "%", "^", "*", "+", "="]),
            symbolRow(["_", "\\", "|", "~", "<", ">", "€", "£", "¥", "•"]),
            punctuationRow(toggle: backToNumbersButton, delete: symbolsDeleteButton),
        ], hidden: true)
    }

    private func letterRow(_ letters: String, inset: CGFloat = 0) -> UIView {
        let buttons = letters.map { character -> UIButton in
            let button = makeLetterButton(character)
            letterButtons.append(button)
            return button
        }
        let row = UIStackView(arrangedSubviews: buttons)
        row.distribution = .fillEqually
        guard inset > 0 else { return row }
        let container = UIView()
        row.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(row)
        NSLayoutConstraint.activate([
            row.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            row.widthAnchor.constraint(equalTo: container.widthAnchor, multiplier: 1 - 2 * inset),
            row.topAnchor.constraint(equalTo: container.topAnchor),
            row.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        return container
    }

    private func lettersMiddleRow() -> UIStackView {
        let letters = UIStackView()
        letters.distribution = .fillEqually
        for character in "zxcvbnm" {
            let button = makeLetterButton(character)
            letterButtons.append(button)
            letters.addArrangedSubview(button)
        }
        return rowWithFunctions(letters, leading: shiftButton, trailing: lettersDeleteButton)
    }

    private func symbolRow(_ symbols: [String]) -> UIStackView {
        let row = UIStackView(arrangedSubviews: symbols.map(makeSymbolButton))
        row.distribution = .fillEqually
        return row
    }

    private func punctuationRow(toggle: UIButton, delete: UIButton) -> UIStackView {
        rowWithFunctions(symbolRow([".", ",", "?", "!", "'"]), leading: toggle, trailing: delete)
    }

    private func rowWithFunctions(_ content: UIView, leading: UIButton, trailing: UIButton) -> UIStackView {
        let row = UIStackView(arrangedSubviews: [leading, content, trailing])
        leading.widthAnchor.constraint(equalTo: row.widthAnchor, multiplier: 0.15).isActive = true
        trailing.widthAnchor.constraint(equalTo: leading.widthAnchor).isActive = true
        return row
    }

    private func bottomRow() -> UIStackView {
        let row = UIStackView(arrangedSubviews: [modeToggleButton, emojiButton, spaceButton, returnButton])
        row.distribution = .fill
        // Make room for the emoji key by sharing the function-key space. The
        // space bar keeps at least half the row, including on smaller phones.
        NSLayoutConstraint.activate([
            modeToggleButton.widthAnchor.constraint(equalTo: row.widthAnchor, multiplier: 0.14),
            emojiButton.widthAnchor.constraint(equalToConstant: 44),
            returnButton.widthAnchor.constraint(equalTo: row.widthAnchor, multiplier: 0.21),
        ])
        return row
    }

    // MARK: - Buttons

    private func makeKeyButton(title: String, emphasized: Bool = false) -> UIButton {
        KeyboardKeyButton(title: title, style: emphasized ? .accent : .function)
    }

    private func makeToolbarButton(title: String, symbol: String? = nil, emphasized: Bool = false) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.title = symbol == nil ? title : nil
        config.image = symbol.flatMap { UIImage(systemName: $0) }
        config.preferredSymbolConfigurationForImage = .init(pointSize: 18)
        config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 10, bottom: 4, trailing: 10)
        config.background.cornerRadius = 8
        config.baseForegroundColor = emphasized ? .white : .label
        config.background.backgroundColor = emphasized ? .systemBlue : .secondarySystemBackground
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var attributes = incoming
            attributes.font = .systemFont(ofSize: 15, weight: .medium)
            return attributes
        }
        let button = UIButton(configuration: config)
        button.accessibilityLabel = title
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setContentHuggingPriority(.required, for: .horizontal)
        button.configurationUpdateHandler = { [weak self] button in
            self?.applyPressFeedback(to: button, emphasized: emphasized)
        }
        return button
    }

    /// Darkens/lightens on touch down so a tap reads as a tap instead of a
    /// keyboard that doesn't acknowledge you pressed anything.
    private func applyPressFeedback(to button: UIButton, emphasized: Bool) {
        let normal: UIColor = emphasized ? .systemBlue : .secondarySystemBackground
        let pressed: UIColor = emphasized ? .systemBlue.withAlphaComponent(0.7) : .systemGray3
        button.configuration?.background.backgroundColor = button.isHighlighted ? pressed : normal
    }

    private func makeOptionChip(_ option: TranslationOption, index: Int) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.title = option.text
        config.titleLineBreakMode = .byTruncatingTail
        config.titleAlignment = .leading
        if let register = option.register, !register.isEmpty {
            config.subtitle = register
            config.subtitleLineBreakMode = .byTruncatingTail
        }
        config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
        config.background.cornerRadius = 6
        config.background.backgroundColor = .secondarySystemBackground
        config.baseForegroundColor = .label

        let button = UIButton(configuration: config)
        button.tag = index
        button.translatesAutoresizingMaskIntoConstraints = false
        button.configurationUpdateHandler = { [weak self] button in
            self?.applyPressFeedback(to: button, emphasized: false)
        }
        button.addTarget(self, action: #selector(chipTouchDown(_:)), for: .touchDown)
        button.addTarget(self, action: #selector(chipTouchUpInside(_:)), for: .touchUpInside)
        button.addTarget(self, action: #selector(chipTouchCancelled), for: [.touchUpOutside, .touchCancel, .touchDragExit])
        return button
    }

    private func makeLetterButton(_ character: Character) -> UIButton {
        let button = KeyboardKeyButton(title: String(character), style: .character)
        button.addAction(UIAction { [weak self] _ in self?.insertLetter(character) }, for: .touchUpInside)
        return button
    }

    private func makeSymbolButton(_ symbol: String) -> UIButton {
        let button = KeyboardKeyButton(title: symbol, style: .character)
        button.addAction(UIAction { [weak self] _ in self?.insertSymbol(symbol) }, for: .touchUpInside)
        return button
    }

    private func wireActions() {
        nextKeyboardButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        modeToggleButton.addTarget(self, action: #selector(toggleMode), for: .touchUpInside)
        // iOS owns keyboard selection: tapping advances; holding opens its
        // keyboard list, where the user can select Apple's Emoji keyboard.
        emojiButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        moreSymbolsButton.addTarget(self, action: #selector(showSymbolsPage), for: .touchUpInside)
        backToNumbersButton.addTarget(self, action: #selector(showNumbersPage), for: .touchUpInside)
        shiftButton.addTarget(self, action: #selector(toggleShift), for: .touchUpInside)
        spaceButton.addTarget(self, action: #selector(insertSpace), for: .touchUpInside)
        returnButton.addTarget(self, action: #selector(insertReturn), for: .touchUpInside)
        translateButton.addTarget(self, action: #selector(handleTranslateTap), for: .touchUpInside)

        for deleteButton in [lettersDeleteButton, numbersDeleteButton, symbolsDeleteButton] {
            deleteButton.addTarget(self, action: #selector(handleDeleteTouchDown), for: .touchDown)
            deleteButton.addTarget(
                self,
                action: #selector(stopDeleteRepeat),
                for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit]
            )
        }
    }

    // MARK: - Typing

    private func editDocument(_ action: () -> Void) {
        isEditingDocument = true
        action()
        isEditingDocument = false
        observedContext = KeyboardDocumentContext(textDocumentProxy)
        refreshTypingState()
    }

    private func prepareToType() {
        translateTask?.cancel()
        resetOptionsStrip()
        UIDevice.current.playInputClick()
    }

    private func insertLetter(_ character: Character) {
        let letter = isShifted ? String(character).uppercased() : String(character)
        prepareToType()
        manualShift = false
        editDocument { typingAssistant.insert(letter, into: textDocumentProxy) }
    }

    private func insertSymbol(_ symbol: String) {
        let correctWord = lastInsertedText == nil
        prepareToType()
        manualShift = false
        editDocument { typingAssistant.insert(symbol, into: textDocumentProxy, correctWord: correctWord) }
    }

    @objc private func toggleShift() {
        UIDevice.current.playInputClick()
        let now = ProcessInfo.processInfo.systemUptime
        if now - lastShiftTapTime < 0.35, !isCapsLocked {
            isCapsLocked = true
            isShifted = true
        } else {
            isCapsLocked = false
            isShifted.toggle()
        }
        lastShiftTapTime = now
        manualShift = true
        updateShiftAppearance()
    }

    private func updateShiftAppearance() {
        for button in letterButtons {
            guard var config = button.configuration, let title = config.title else { continue }
            config.title = isShifted ? title.uppercased() : title.lowercased()
            button.configuration = config
            button.accessibilityLabel = config.title
        }
        shiftButton.configuration?.image = UIImage(systemName: isCapsLocked ? "capslock.fill" : (isShifted ? "shift.fill" : "shift"))
        shiftButton.isSelected = isShifted
        shiftButton.accessibilityLabel = isCapsLocked ? "Caps lock on" : "Shift"
    }

    private func refreshTypingState() {
        if !manualShift { isShifted = isCapsLocked || typingAssistant.shouldCapitalize(textDocumentProxy) }
        updateShiftAppearance()
        switch textDocumentProxy.returnKeyType ?? .default {
        case .go: returnButton.configuration?.title = "go"
        case .search, .google, .yahoo: returnButton.configuration?.title = "search"
        case .send: returnButton.configuration?.title = "send"
        case .next: returnButton.configuration?.title = "next"
        case .done: returnButton.configuration?.title = "done"
        case .join: returnButton.configuration?.title = "join"
        case .route: returnButton.configuration?.title = "route"
        case .continue: returnButton.configuration?.title = "continue"
        case .emergencyCall: returnButton.configuration?.title = "call"
        default: returnButton.configuration?.title = "return"
        }
        returnButton.accessibilityLabel = returnButton.configuration?.title
        switch textDocumentProxy.keyboardAppearance ?? .default {
        case .dark: overrideUserInterfaceStyle = .dark
        case .light: overrideUserInterfaceStyle = .light
        default: overrideUserInterfaceStyle = .unspecified
        }
        refreshSuggestions()
    }

    private func refreshSuggestions() {
        suggestionStrip.arrangedSubviews.forEach { $0.removeFromSuperview() }
        suggestionStrip.isHidden = true
        guard Config.keyboardSuggestions, readingPane.isHidden, currentTranslations.isEmpty,
              statusLabel.text == "Translatarr", let suggestions = typingAssistant.suggestions(for: textDocumentProxy)
        else {
            if optionsStrip.isHidden { statusLabel.isHidden = false }
            return
        }
        let context = KeyboardDocumentContext(textDocumentProxy)
        for (index, suggestion) in ([suggestions.word] + suggestions.alternatives).enumerated() {
            var config = UIButton.Configuration.plain()
            config.title = index == 0 ? "“\(suggestion)”" : suggestion
            config.titleLineBreakMode = .byTruncatingTail
            config.baseForegroundColor = .label
            config.contentInsets = NSDirectionalEdgeInsets(top: 3, leading: 6, bottom: 3, trailing: 6)
            config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var attributes = incoming
                attributes.font = .systemFont(ofSize: 17)
                return attributes
            }
            let button = UIButton(configuration: config)
            button.accessibilityLabel = index == 0 ? "Keep \(suggestion)" : "Use \(suggestion)"
            button.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            button.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                self.prepareToType()
                self.manualShift = false
                self.editDocument {
                    self.typingAssistant.accept(suggestion, word: suggestions.word, context: context, in: self.textDocumentProxy)
                }
            }, for: .touchUpInside)
            suggestionStrip.addArrangedSubview(button)
        }
        // Keep three predictable columns even when the dictionary has no guesses.
        while suggestionStrip.arrangedSubviews.count < 3 { suggestionStrip.addArrangedSubview(UIView()) }
        statusLabel.isHidden = true
        suggestionStrip.isHidden = false
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        hostContextDidChange()
    }

    override func selectionDidChange(_ textInput: UITextInput?) {
        super.selectionDidChange(textInput)
        hostContextDidChange()
    }

    private func hostContextDidChange() {
        guard isViewLoaded, !isEditingDocument else { return }
        let context = KeyboardDocumentContext(textDocumentProxy)
        if context != observedContext {
            translateTask?.cancel()
            typingAssistant.reset()
            manualShift = false
            resetOptionsStrip()
            observedContext = context
        }
        refreshTypingState()
    }

    @objc private func toggleMode() {
        UIDevice.current.playInputClick()
        setMode(mode == .letters ? .numbers : .letters)
    }

    @objc private func showSymbolsPage() {
        UIDevice.current.playInputClick()
        setMode(.symbols)
    }

    @objc private func showNumbersPage() {
        UIDevice.current.playInputClick()
        setMode(.numbers)
    }

    private func setMode(_ newMode: Mode) {
        stopDeleteRepeat()
        mode = newMode
        lettersBlock.isHidden = (mode != .letters)
        numbersBlock.isHidden = (mode != .numbers)
        symbolsBlock.isHidden = (mode != .symbols)
        modeToggleButton.configuration?.title = (mode == .letters) ? "123" : "ABC"
        modeToggleButton.accessibilityLabel = modeToggleButton.configuration?.title
        refreshSuggestions()
    }

    @objc private func insertSpace() {
        let correctWord = lastInsertedText == nil
        prepareToType()
        manualShift = false
        editDocument { typingAssistant.insert(" ", into: textDocumentProxy, correctWord: correctWord) }
        if mode == .numbers || mode == .symbols { setMode(.letters) }
    }

    @objc private func insertReturn() {
        let correctWord = lastInsertedText == nil
        prepareToType()
        manualShift = false
        editDocument { typingAssistant.insert("\n", into: textDocumentProxy, correctWord: correctWord) }
    }

    /// Delete repeats on long-press: one immediate delete on touch down, then
    /// (if still held past a short delay) repeating deletes until release.
    /// Scheduled on `.common` run-loop mode — the default mode stalls while
    /// UIKit is tracking the touch, i.e. exactly while the button is held.
    @objc private func handleDeleteTouchDown() {
        performDelete()
        deleteRepeatTimer?.invalidate()
        deleteRepeatTimer = scheduleTimer(interval: 0.45, repeats: false) { [weak self] in
            self?.startDeleteRepeat()
        }
    }

    private func startDeleteRepeat() {
        deleteRepeatTimer?.invalidate()
        deleteRepeatTimer = scheduleTimer(interval: 0.08, repeats: true) { [weak self] in
            self?.performDelete()
        }
    }

    @objc private func stopDeleteRepeat() {
        deleteRepeatTimer?.invalidate()
        deleteRepeatTimer = nil
    }

    private func scheduleTimer(interval: TimeInterval, repeats: Bool, action: @escaping () -> Void) -> Timer {
        let timer = Timer(timeInterval: interval, repeats: repeats) { _ in action() }
        RunLoop.main.add(timer, forMode: .common)
        return timer
    }

    private func performDelete() {
        prepareToType()
        manualShift = false
        editDocument { typingAssistant.deleteBackward(in: textDocumentProxy) }
    }

    // MARK: - Target language

    private func currentLanguageTitle() -> String {
        Config.targetLanguage?.uppercased() ?? "Lang"
    }

    /// The language translating "to" doesn't make sense for: the configured
    /// source language if set to something concrete, else the device's own
    /// locale (e.g. an English keyboard shouldn't offer English as a
    /// target).
    private func excludedTargetLanguageCode() -> String? {
        let source = Config.sourceLanguage?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let source, !source.isEmpty, source != "auto" {
            return source
        }
        return Locale.current.language.languageCode?.identifier
    }

    /// If the stored target now matches the excluded language (e.g. the
    /// user just set their own language to what was previously the target),
    /// clear it rather than silently keep offering to translate to yourself.
    private func sanitizeTargetLanguage() {
        guard let target = Config.targetLanguage, target == excludedTargetLanguageCode() else { return }
        Config.targetLanguage = nil
    }

    private func buildLanguageMenu() -> UIMenu {
        let current = Config.targetLanguage
        let excluded = excludedTargetLanguageCode()
        let actions = SupportedLanguages.all
            .filter { $0.code != excluded }
            .map { option in
                UIAction(title: option.name, state: option.code == current ? .on : .off) { [weak self] _ in
                    self?.selectTargetLanguage(option.code)
                }
            }
        return UIMenu(title: "Translate to", children: actions)
    }

    /// Picking a language by hand abandons any pinned conversation — the pin
    /// only makes sense for the exact pair it was created with. In practice
    /// this is now hard to reach while pinned, since `languageButton` is
    /// disabled in that state — leaving it here is just defensive.
    private func selectTargetLanguage(_ code: String) {
        Config.targetLanguage = code
        Config.pinnedChatId = nil
        languageButton.configuration?.title = currentLanguageTitle()
        languageButton.menu = buildLanguageMenu()
        refreshConversationsButtonTitle()
        refreshLanguageButtonEnabled()
        resetOptionsStrip()
    }

    // MARK: - Conversations

    private func refreshConversationsButtonTitle() {
        conversationsButton.configuration?.image = UIImage(systemName: Config.pinnedChatId != nil ? "pin.fill" : "bubble.left.and.bubble.right")
        conversationsButton.accessibilityLabel = Config.pinnedChatId != nil ? "Pinned conversation" : "Conversations"
    }

    /// The language pair is determined by whichever conversation is pinned,
    /// not independently editable — leaving it tappable would let you change
    /// languages out from under a pin without any indication why that
    /// silently un-pins it. Leaving a pin happens explicitly, via
    /// "Automatic" in the conversations menu.
    private func refreshLanguageButtonEnabled() {
        let pinned = Config.pinnedChatId != nil
        languageButton.isEnabled = !pinned
        languageButton.alpha = pinned ? 0.4 : 1
    }

    /// "Automatic" (per-pair auto-managed chat) plus the conversation list,
    /// as peer choices in one menu — exactly one is ever checked.
    private func buildConversationsMenu() -> UIMenu {
        UIMenu(children: [automaticChatAction(), conversationsMenuElement()])
    }

    private func automaticChatAction() -> UIAction {
        UIAction(title: "Automatic", state: Config.pinnedChatId == nil ? .on : .off) { [weak self] _ in
            self?.unpinConversation()
        }
    }

    private func unpinConversation() {
        UIDevice.current.playInputClick()
        Config.pinnedChatId = nil
        refreshConversationsButtonTitle()
        refreshLanguageButtonEnabled()
        conversationsButton.menu = buildConversationsMenu()
        resetOptionsStrip()
    }

    /// Loaded lazily each time the menu is about to be shown, so opening it
    /// always reflects the current chat list without a separate refresh step.
    private func conversationsMenuElement() -> UIDeferredMenuElement {
        UIDeferredMenuElement.uncached { [weak self] completion in
            guard let self else {
                completion([])
                return
            }

            Task {
                do {
                    let chats = try await self.client.listChats()
                    let sorted = chats.sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }

                    guard !sorted.isEmpty else {
                        completion([UIAction(title: "No conversations yet", attributes: .disabled) { _ in }])
                        return
                    }

                    let actions = sorted.map { chat -> UIAction in
                        let title = (chat.title?.isEmpty == false) ? chat.title! : "Untitled"
                        let action = UIAction(title: title, state: chat.id == Config.pinnedChatId ? .on : .off) { [weak self] _ in
                            self?.selectConversation(chat)
                        }
                        if let source = chat.sourceLang, let target = chat.targetLang {
                            action.subtitle = "\(source.uppercased()) → \(target.uppercased())"
                        }
                        return action
                    }
                    completion(actions)
                } catch {
                    completion([UIAction(title: "Couldn't load conversations", attributes: .disabled) { _ in }])
                }
            }
        }
    }

    /// A chat is locked server-side to the language pair it was created
    /// with, so switching to one adopts that pair rather than trying to
    /// keep whatever was previously configured.
    private func selectConversation(_ chat: ChatSummary) {
        guard let source = chat.sourceLang, let target = chat.targetLang else { return }

        UIDevice.current.playInputClick()
        Config.pinnedChatId = chat.id
        Config.sourceLanguage = source
        Config.targetLanguage = target
        languageButton.configuration?.title = currentLanguageTitle()
        languageButton.menu = buildLanguageMenu()
        refreshConversationsButtonTitle()
        refreshLanguageButtonEnabled()
        conversationsButton.menu = buildConversationsMenu()
        resetOptionsStrip()
    }

    // MARK: - Reading a reply

    /// Copy the other person's message in the host app, then tap this to
    /// read it in your own language. A keyboard extension can't see their
    /// message bubbles directly, so getting the text out requires a paste —
    /// but reading `UIPasteboard.general` programmatically triggers iOS's
    /// "Allow Paste" consent on every single call (iOS 16+ added this
    /// specifically to stop keyboards from silently reading the clipboard,
    /// and there's no way for a third-party keyboard to suppress it).
    /// Instead, this hands the user an empty field and lets them invoke the
    /// system's own Edit Menu paste (long-press -> Paste) — an explicit,
    /// user-driven paste through `UIResponderStandardEditActions` isn't
    /// gated by that prompt at all.
    @objc private func handlePasteTranslateTap() {
        UIDevice.current.playInputClick()
        translateTask?.cancel()

        guard let myLanguage = Config.sourceLanguage?.trimmingCharacters(in: .whitespacesAndNewlines),
              !myLanguage.isEmpty, myLanguage != "auto"
        else {
            setStatus("Set your language in Settings to read replies", isError: true)
            return
        }

        guard Config.targetLanguage?.isEmpty == false else {
            setStatus("Set a target language above", isError: true)
            return
        }

        keyStack.isHidden = true
        readingPane.isHidden = false
        typingAssistant.reset()

        readingPaneTextView.text = ""
        readingPaneTextView.isEditable = true
        // An empty dummy input view so becoming first responder here doesn't
        // try to pop a second software keyboard on top of this one — we
        // only want the Edit Menu (paste), not typing.
        readingPaneTextView.inputView = UIView(frame: .zero)
        readingPaneTextView.becomeFirstResponder()

        setStatus("Long-press below, tap Paste")
    }

    private func translateReply(_ text: String) {
        guard let myLanguage = Config.sourceLanguage?.trimmingCharacters(in: .whitespacesAndNewlines),
              !myLanguage.isEmpty, myLanguage != "auto",
              let theirLanguage = Config.targetLanguage, !theirLanguage.isEmpty
        else {
            showReadingPane(text: "Set your language and a target language first")
            return
        }

        showReadingPane(text: "Translating…")

        translateTask = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await self.client.translateInChat(
                    text: text,
                    sourceLang: theirLanguage,
                    targetLang: myLanguage,
                    pinnedChatId: Config.pinnedChatId
                )
                if Task.isCancelled { return }

                guard let top = result.translations.first else {
                    self.showReadingPane(text: "No translation returned")
                    return
                }
                self.showReadingPane(text: top.text)
            } catch {
                if Task.isCancelled { return }
                self.showReadingPane(text: self.describeTranslateError(error))
            }
        }
    }

    private func showReadingPane(text: String) {
        keyStack.isHidden = true
        readingPane.isHidden = false
        typingAssistant.reset()
        readingPaneTextView.isEditable = false
        readingPaneTextView.text = text
        setStatus("Translatarr")
    }

    @objc private func hideReadingPane() {
        UIDevice.current.playInputClick()
        translateTask?.cancel()
        readingPaneTextView.resignFirstResponder()
        readingPaneTextView.isEditable = false
        readingPane.isHidden = true
        keyStack.isHidden = false
        setMode(mode)
        setStatus("Translatarr")
        refreshTypingState()
    }

    // MARK: - Translate

    @objc private func handleTranslateTap() {
        translateTask?.cancel()
        resetOptionsStrip()
        UIDevice.current.playInputClick()

        guard let snapshot = currentInputSnapshot() else {
            setStatus("Nothing to translate")
            return
        }

        guard let targetLang = Config.targetLanguage, !targetLang.isEmpty else {
            setStatus("Set a target language above", isError: true)
            return
        }

        typingAssistant.reset()
        let requestContext = KeyboardDocumentContext(textDocumentProxy)
        setStatus("Translating…")
        translateButton.isEnabled = false

        translateTask = Task { [weak self] in
            guard let self else { return }
            defer { self.translateButton.isEnabled = true }

            do {
                let result = try await self.client.translateInChat(
                    text: snapshot.text.trimmingCharacters(in: .whitespacesAndNewlines),
                    sourceLang: Config.resolvedSourceLanguage,
                    targetLang: targetLang,
                    pinnedChatId: Config.pinnedChatId
                )
                if Task.isCancelled { return }

                guard let top = result.translations.first else {
                    self.setStatus("No translation returned", isError: true)
                    return
                }

                guard requestContext.identifier != nil,
                      requestContext == KeyboardDocumentContext(self.textDocumentProxy) else {
                    self.setStatus("Text changed — tap Translate again")
                    return
                }
                var replaced = false
                self.editDocument { replaced = self.replace(snapshot, with: top.text) }
                guard replaced else { return }
                self.lastInsertedText = top.text
                self.currentTranslations = result.translations
                self.showOptionChips(for: result.translations)
            } catch {
                if Task.isCancelled { return }
                self.setStatus(self.describeTranslateError(error), isError: true)
            }
        }
    }

    /// Shared by both translate flows: if a pinned conversation was deleted
    /// server-side, unpin it and say so, rather than showing a raw 404.
    private func describeTranslateError(_ error: Error) -> String {
        if Config.pinnedChatId != nil, case let APIError.httpError(status, _) = error, status == 404 {
            Config.pinnedChatId = nil
            refreshConversationsButtonTitle()
            refreshLanguageButtonEnabled()
            conversationsButton.menu = buildConversationsMenu()
            return "That conversation is gone — unpinned"
        }
        return (error as? LocalizedError)?.errorDescription ?? "Translation failed"
    }

    /// Order of preference: a live selection (cleanest, no deletion math),
    /// else the text back to the last sentence boundary in
    /// `documentContextBeforeInput`. Many host apps truncate that context or
    /// withhold it entirely in secure fields, so whole-field translation
    /// isn't promised.
    private func currentInputSnapshot() -> InputSnapshot? {
        if let selected = textDocumentProxy.selectedText, !selected.isEmpty {
            return InputSnapshot(text: selected, wasSelection: true)
        }

        guard let before = textDocumentProxy.documentContextBeforeInput, !before.isEmpty else {
            return nil
        }

        guard let candidate = KeyboardTypingAssistant.sentenceBeforeCursor(before) else { return nil }
        return InputSnapshot(text: candidate, wasSelection: false)
    }

    /// A selection is replaced by `insertText` automatically, matching how
    /// typing over a selection behaves. Without one, delete a grapheme
    /// cluster at a time and confirm the proxy actually shrank before
    /// inserting — some host fields silently no-op `deleteBackward()`.
    @discardableResult
    private func replace(_ snapshot: InputSnapshot, with translation: String) -> Bool {
        if !snapshot.wasSelection {
            let beforeCount = textDocumentProxy.documentContextBeforeInput?.count ?? 0
            for _ in snapshot.text {
                textDocumentProxy.deleteBackward()
            }
            let afterCount = textDocumentProxy.documentContextBeforeInput?.count ?? 0
            guard afterCount < beforeCount else {
                setStatus("Couldn't edit this field", isError: true)
                return false
            }
        }

        textDocumentProxy.insertText(translation)
        return true
    }

    // MARK: - Status / options strip

    /// The strip shows exactly one of: an idle/busy message, an error
    /// (distinctly colored so a failure reads as a failure at a glance, not
    /// a silent hang), or the option chips. `isError` only affects color —
    /// the message text itself is what actually distinguishes VPN-down from
    /// a bad key from a timeout (see `APIError`'s per-case descriptions).
    private func setStatus(_ text: String, isError: Bool = false) {
        dismissDetailCallout()
        optionsStrip.arrangedSubviews.forEach { $0.removeFromSuperview() }
        optionsStrip.isHidden = true
        suggestionStrip.isHidden = true
        statusLabel.isHidden = false
        statusLabel.text = text
        statusLabel.textColor = isError ? .systemRed : .secondaryLabel
    }

    /// Option 1 is already inserted by the time this runs; chips are for the
    /// remaining ranked options only.
    private func showOptionChips(for translations: [TranslationOption]) {
        let alternates = Array(translations.enumerated().dropFirst())
        guard !alternates.isEmpty else {
            setStatus("Translatarr")
            return
        }

        for (index, option) in alternates {
            optionsStrip.addArrangedSubview(makeOptionChip(option, index: index))
        }
        statusLabel.isHidden = true
        suggestionStrip.isHidden = true
        optionsStrip.isHidden = false
    }

    private func selectOption(at index: Int) {
        guard index < currentTranslations.count, let previousText = lastInsertedText else { return }

        guard textDocumentProxy.selectedText?.isEmpty != false,
              textDocumentProxy.documentContextBeforeInput?.hasSuffix(previousText) == true else {
            resetOptionsStrip()
            return
        }
        UIDevice.current.playInputClick()
        let option = currentTranslations[index]
        editDocument {
            for _ in previousText { textDocumentProxy.deleteBackward() }
            textDocumentProxy.insertText(option.text)
        }
        lastInsertedText = option.text
    }

    // MARK: - Chip long-press detail callout

    /// Long-press a chip to peek at the back-translation/romanization that
    /// don't fit in its truncated title — same touch-down + timer mechanism
    /// as the delete key's repeat, so a quick tap still fires
    /// `chipTouchUpInside` normally and a held touch shows the callout
    /// instead of also swapping the inserted text.
    @objc private func chipTouchDown(_ sender: UIButton) {
        chipLongPressFired = false
        chipLongPressTimer?.invalidate()
        chipLongPressTimer = scheduleTimer(interval: 0.4, repeats: false) { [weak self, weak sender] in
            guard let self, let sender else { return }
            self.chipLongPressFired = true
            self.showChipDetail(for: sender)
        }
    }

    @objc private func chipTouchUpInside(_ sender: UIButton) {
        chipLongPressTimer?.invalidate()
        if chipLongPressFired {
            chipLongPressFired = false
            return
        }
        selectOption(at: sender.tag)
    }

    @objc private func chipTouchCancelled() {
        chipLongPressTimer?.invalidate()
        chipLongPressFired = false
    }

    private func showChipDetail(for button: UIButton) {
        let index = button.tag
        guard index < currentTranslations.count else { return }
        let option = currentTranslations[index]

        var lines: [String] = []
        if let backTranslation = option.sourceEquivalent, !backTranslation.isEmpty {
            lines.append("↩︎ \(backTranslation)")
        }
        if let romanization = option.romanization, !romanization.isEmpty {
            lines.append("🔤 \(romanization)")
        }
        guard !lines.isEmpty else { return }

        UIDevice.current.playInputClick()
        presentDetailCallout(text: lines.joined(separator: "\n"))
    }

    /// A hand-rolled overlay rather than `UIAlertController` — presenting
    /// view controllers from a keyboard extension is unreliable, and this is
    /// small enough not to need it. Sits above everything else (added
    /// directly to `view`, not the arranged-subview `stack`), dismissed by
    /// tapping anywhere else or automatically after a few seconds.
    private func presentDetailCallout(text: String) {
        dismissDetailCallout()

        let label = UILabel()
        label.text = text
        label.numberOfLines = 0
        label.font = .preferredFont(forTextStyle: .footnote)
        label.textColor = .label
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false

        let callout = UIView()
        callout.backgroundColor = .tertiarySystemBackground
        callout.layer.cornerRadius = 8
        callout.layer.borderWidth = 1
        callout.layer.borderColor = UIColor.separator.cgColor
        callout.translatesAutoresizingMaskIntoConstraints = false
        callout.addSubview(label)

        let backdrop = UIControl()
        backdrop.translatesAutoresizingMaskIntoConstraints = false
        backdrop.addTarget(self, action: #selector(dismissDetailCallout), for: .touchUpInside)

        view.addSubview(backdrop)
        view.addSubview(callout)

        NSLayoutConstraint.activate([
            backdrop.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backdrop.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            backdrop.topAnchor.constraint(equalTo: view.topAnchor),
            backdrop.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            label.leadingAnchor.constraint(equalTo: callout.leadingAnchor, constant: 10),
            label.trailingAnchor.constraint(equalTo: callout.trailingAnchor, constant: -10),
            label.topAnchor.constraint(equalTo: callout.topAnchor, constant: 8),
            label.bottomAnchor.constraint(equalTo: callout.bottomAnchor, constant: -8),

            callout.topAnchor.constraint(equalTo: topRow.bottomAnchor, constant: 4),
            callout.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 8),
            callout.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -8),
            callout.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])

        detailCallout = callout
        detailCalloutBackdrop = backdrop

        calloutDismissTimer?.invalidate()
        calloutDismissTimer = scheduleTimer(interval: 4, repeats: false) { [weak self] in
            self?.dismissDetailCallout()
        }
    }

    @objc private func dismissDetailCallout() {
        calloutDismissTimer?.invalidate()
        calloutDismissTimer = nil
        detailCallout?.removeFromSuperview()
        detailCallout = nil
        detailCalloutBackdrop?.removeFromSuperview()
        detailCalloutBackdrop = nil
    }

    private func resetOptionsStrip() {
        currentTranslations = []
        lastInsertedText = nil
        setStatus("Translatarr")
    }
}

extension KeyboardViewController: UIInputViewAudioFeedback {
    var enableInputClickSound: Bool { true }
}

extension KeyboardViewController: UITextViewDelegate {
    func textViewDidChange(_ textView: UITextView) {
        guard textView === readingPaneTextView, textView.isEditable else { return }
        let pasted = textView.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pasted.isEmpty else { return }

        textView.isEditable = false
        textView.resignFirstResponder()
        translateReply(pasted)
    }
}
