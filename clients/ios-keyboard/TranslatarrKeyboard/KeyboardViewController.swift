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

    /// The system allocates the keyboard extension a fixed content height
    /// that isn't knowable in advance (observed 224-241pt on one device in
    /// one session; Apple's own guidance says "~216pt default") and doesn't
    /// negotiate with our layout — it just clips/breaks whatever doesn't
    /// fit. So every fixed size in this file targets a conservative total
    /// and uses a sub-required priority, so a tighter-than-expected
    /// allocation compresses gracefully instead of throwing "unsatisfiable
    /// constraints" (which was destabilizing the extension process).
    private static let keyHeight: CGFloat = 38
    private static let sizePriority = UILayoutPriority(999)

    private func pinHeight(_ view: UIView, to constant: CGFloat) {
        let constraint = view.heightAnchor.constraint(equalToConstant: constant)
        constraint.priority = Self.sizePriority
        constraint.isActive = true
    }

    private let client = TranslatarrAPIClient()
    private var translateTask: Task<Void, Never>?
    private var isShifted = false
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

    private lazy var nextKeyboardButton = makeKeyButton(title: "🌐")
    private lazy var modeToggleButton = makeKeyButton(title: "123")
    private lazy var moreSymbolsButton = makeKeyButton(title: "#+=")
    private lazy var backToNumbersButton = makeKeyButton(title: "123")
    private lazy var shiftButton = makeKeyButton(title: "⇧")
    private lazy var lettersDeleteButton = makeKeyButton(title: "⌫")
    private lazy var numbersDeleteButton = makeKeyButton(title: "⌫")
    private lazy var symbolsDeleteButton = makeKeyButton(title: "⌫")
    private lazy var spaceButton = makeKeyButton(title: "space")
    private lazy var returnButton = makeKeyButton(title: "return")
    private lazy var translateButton = makeKeyButton(title: "Translate", emphasized: true)

    private lazy var languageButton: UIButton = {
        var config = UIButton.Configuration.plain()
        config.title = currentLanguageTitle()
        config.image = UIImage(systemName: "chevron.down")
        config.imagePlacement = .trailing
        config.imagePadding = 3
        config.preferredSymbolConfigurationForImage = .init(pointSize: 10, weight: .semibold)
        config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
        config.background.cornerRadius = 6
        config.background.backgroundColor = .secondarySystemBackground
        config.baseForegroundColor = .label

        let button = UIButton(configuration: config)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setContentHuggingPriority(.required, for: .horizontal)
        button.showsMenuAsPrimaryAction = true
        button.configurationUpdateHandler = { [weak self] button in
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
        var config = UIButton.Configuration.plain()
        config.title = "💬"
        config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
        config.background.cornerRadius = 6
        config.background.backgroundColor = .secondarySystemBackground
        config.baseForegroundColor = .label

        let button = UIButton(configuration: config)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setContentHuggingPriority(.required, for: .horizontal)
        button.configurationUpdateHandler = { [weak self] button in
            self?.applyPressFeedback(to: button, emphasized: false)
        }
        button.showsMenuAsPrimaryAction = true
        button.menu = buildConversationsMenu()
        return button
    }()

    /// Reads what the other person wrote (copied from the host app, since a
    /// keyboard extension can't see their message bubbles) and translates it
    /// into the strip below — the reverse direction from typing, for reading
    /// a reply rather than sending one.
    private lazy var pasteTranslateButton: UIButton = {
        var config = UIButton.Configuration.plain()
        config.title = "📋"
        config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
        config.background.cornerRadius = 6
        config.background.backgroundColor = .secondarySystemBackground
        config.baseForegroundColor = .label

        let button = UIButton(configuration: config)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setContentHuggingPriority(.required, for: .horizontal)
        button.configurationUpdateHandler = { [weak self] button in
            self?.applyPressFeedback(to: button, emphasized: false)
        }
        button.addTarget(self, action: #selector(handlePasteTranslateTap), for: .touchUpInside)
        return button
    }()

    private lazy var statusLabel: UILabel = {
        let label = UILabel()
        label.text = "Translatarr"
        label.font = .preferredFont(forTextStyle: .footnote)
        label.textColor = .secondaryLabel
        label.textAlignment = .center
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
        // A scrollable UITextView reports no intrinsic content size, so
        // without an explicit height it claims ~zero space in the stack —
        // it won't stretch to fill on its own the way a plain view would.
        pinHeight(textView, to: 120)
        textView.delegate = self
        return textView
    }()

    private lazy var readingPaneDoneButton: UIButton = {
        let button = makeKeyButton(title: "Done", emphasized: true)
        button.addTarget(self, action: #selector(hideReadingPane), for: .touchUpInside)
        return button
    }()

    private lazy var readingPane: UIStackView = {
        let stack = UIStackView(arrangedSubviews: [readingPaneTextView, readingPaneDoneButton])
        stack.axis = .vertical
        stack.spacing = 4
        stack.isHidden = true
        return stack
    }()

    private lazy var stack: UIStackView = {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 4
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        buildLayout()
        wireActions()
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
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        nextKeyboardButton.isHidden = !needsInputModeSwitchKey
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopDeleteRepeat()
        dismissDetailCallout()
        translateTask?.cancel()
    }

    // MARK: - Layout

    private func buildLayout() {
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 4),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -4),
            stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -4),
        ])

        pinHeight(topRow, to: 30)
        topRow.addArrangedSubview(languageButton)
        topRow.addArrangedSubview(conversationsButton)
        topRow.addArrangedSubview(statusLabel)
        topRow.addArrangedSubview(optionsStrip)
        topRow.addArrangedSubview(pasteTranslateButton)

        stack.addArrangedSubview(topRow)
        stack.addArrangedSubview(lettersBlock)
        stack.addArrangedSubview(numbersBlock)
        stack.addArrangedSubview(symbolsBlock)
        stack.addArrangedSubview(bottomRowView)
        stack.addArrangedSubview(readingPane)
    }

    private func buildLettersBlock() -> UIStackView {
        let block = UIStackView()
        block.axis = .vertical
        block.spacing = 4
        block.addArrangedSubview(letterRow("qwertyuiop"))
        block.addArrangedSubview(letterRow("asdfghjkl"))
        block.addArrangedSubview(lettersMiddleRow())
        return block
    }

    private func buildNumbersBlock() -> UIStackView {
        let block = UIStackView()
        block.axis = .vertical
        block.spacing = 4
        block.isHidden = true
        block.addArrangedSubview(symbolRow(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]))
        block.addArrangedSubview(symbolRow(["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""]))
        block.addArrangedSubview(punctuationRow(toggle: moreSymbolsButton, delete: numbersDeleteButton))
        return block
    }

    private func buildSymbolsBlock() -> UIStackView {
        let block = UIStackView()
        block.axis = .vertical
        block.spacing = 4
        block.isHidden = true
        block.addArrangedSubview(symbolRow(["[", "]", "{", "}", "#", "%", "^", "*", "+", "="]))
        block.addArrangedSubview(symbolRow(["_", "\\", "|", "~", "<", ">", "€", "£", "¥", "•"]))
        block.addArrangedSubview(punctuationRow(toggle: backToNumbersButton, delete: symbolsDeleteButton))
        return block
    }

    private func letterRow(_ letters: String) -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 4
        row.distribution = .fillEqually
        for character in letters {
            let button = makeLetterButton(character)
            letterButtons.append(button)
            row.addArrangedSubview(button)
        }
        return row
    }

    private func lettersMiddleRow() -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 4
        row.distribution = .fillEqually
        row.addArrangedSubview(shiftButton)
        for character in "zxcvbnm" {
            let button = makeLetterButton(character)
            letterButtons.append(button)
            row.addArrangedSubview(button)
        }
        row.addArrangedSubview(lettersDeleteButton)
        return row
    }

    private func symbolRow(_ symbols: [String]) -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 4
        row.distribution = .fillEqually
        for symbol in symbols {
            row.addArrangedSubview(makeSymbolButton(symbol))
        }
        return row
    }

    /// Shared third row for the numbers/symbols pages: a page-toggle key
    /// (`#+=` <-> `123`, matching the system keyboard's third symbols page),
    /// common punctuation, and delete.
    private func punctuationRow(toggle: UIButton, delete: UIButton) -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 4
        row.distribution = .fillEqually
        row.addArrangedSubview(toggle)
        for symbol in [".", ",", "?", "!", "'"] {
            row.addArrangedSubview(makeSymbolButton(symbol))
        }
        row.addArrangedSubview(delete)
        return row
    }

    private func bottomRow() -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 4
        row.distribution = .fill
        row.addArrangedSubview(modeToggleButton)
        row.addArrangedSubview(nextKeyboardButton)
        row.addArrangedSubview(spaceButton)
        row.addArrangedSubview(translateButton)
        row.addArrangedSubview(returnButton)

        NSLayoutConstraint.activate([
            modeToggleButton.widthAnchor.constraint(equalTo: nextKeyboardButton.widthAnchor, multiplier: 1.4),
            spaceButton.widthAnchor.constraint(equalTo: nextKeyboardButton.widthAnchor, multiplier: 3),
            translateButton.widthAnchor.constraint(equalTo: nextKeyboardButton.widthAnchor, multiplier: 2.5),
            returnButton.widthAnchor.constraint(equalTo: nextKeyboardButton.widthAnchor, multiplier: 2),
        ])

        return row
    }

    // MARK: - Buttons

    private func makeKeyButton(title: String, emphasized: Bool = false) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.title = title
        config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 4)
        config.background.cornerRadius = 6
        config.baseForegroundColor = emphasized ? .white : .label
        config.background.backgroundColor = emphasized ? .systemBlue : .secondarySystemBackground

        let button = UIButton(configuration: config)
        button.translatesAutoresizingMaskIntoConstraints = false
        pinHeight(button, to: Self.keyHeight)
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
        let button = makeKeyButton(title: String(character))
        button.addAction(UIAction { [weak self] _ in self?.insertLetter(character) }, for: .touchUpInside)
        return button
    }

    private func makeSymbolButton(_ symbol: String) -> UIButton {
        let button = makeKeyButton(title: symbol)
        button.addAction(UIAction { [weak self] _ in self?.insertSymbol(symbol) }, for: .touchUpInside)
        return button
    }

    private func wireActions() {
        nextKeyboardButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        modeToggleButton.addTarget(self, action: #selector(toggleMode), for: .touchUpInside)
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

    private func insertLetter(_ character: Character) {
        translateTask?.cancel()
        resetOptionsStrip()
        UIDevice.current.playInputClick()
        textDocumentProxy.insertText(isShifted ? String(character).uppercased() : String(character))
        if isShifted {
            isShifted = false
            updateShiftAppearance()
        }
    }

    private func insertSymbol(_ symbol: String) {
        translateTask?.cancel()
        resetOptionsStrip()
        UIDevice.current.playInputClick()
        textDocumentProxy.insertText(symbol)
    }

    @objc private func toggleShift() {
        UIDevice.current.playInputClick()
        isShifted.toggle()
        updateShiftAppearance()
    }

    private func updateShiftAppearance() {
        for button in letterButtons {
            guard var config = button.configuration, let title = config.title else { continue }
            config.title = isShifted ? title.uppercased() : title.lowercased()
            button.configuration = config
        }
        shiftButton.configuration?.background.backgroundColor = isShifted ? .systemBlue : .secondarySystemBackground
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
        mode = newMode
        lettersBlock.isHidden = (mode != .letters)
        numbersBlock.isHidden = (mode != .numbers)
        symbolsBlock.isHidden = (mode != .symbols)
        modeToggleButton.configuration?.title = (mode == .letters) ? "123" : "ABC"
    }

    @objc private func insertSpace() {
        translateTask?.cancel()
        resetOptionsStrip()
        UIDevice.current.playInputClick()
        textDocumentProxy.insertText(" ")
    }

    @objc private func insertReturn() {
        translateTask?.cancel()
        resetOptionsStrip()
        UIDevice.current.playInputClick()
        textDocumentProxy.insertText("\n")
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
        translateTask?.cancel()
        resetOptionsStrip()
        UIDevice.current.playInputClick()
        textDocumentProxy.deleteBackward()
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
        conversationsButton.configuration?.title = Config.pinnedChatId != nil ? "📌" : "💬"
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

        lettersBlock.isHidden = true
        numbersBlock.isHidden = true
        symbolsBlock.isHidden = true
        bottomRowView.isHidden = true
        readingPane.isHidden = false

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
        lettersBlock.isHidden = true
        numbersBlock.isHidden = true
        symbolsBlock.isHidden = true
        bottomRowView.isHidden = true
        readingPane.isHidden = false
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
        bottomRowView.isHidden = false
        setMode(mode)
        setStatus("Translatarr")
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

        setStatus("Translating…")
        translateButton.isEnabled = false

        translateTask = Task { [weak self] in
            guard let self else { return }
            defer { self.translateButton.isEnabled = true }

            do {
                let result = try await self.client.translateInChat(
                    text: snapshot.text,
                    sourceLang: Config.resolvedSourceLanguage,
                    targetLang: targetLang,
                    pinnedChatId: Config.pinnedChatId
                )
                if Task.isCancelled { return }

                guard let top = result.translations.first else {
                    self.setStatus("No translation returned", isError: true)
                    return
                }

                guard self.replace(snapshot, with: top.text) else { return }
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

        let sentenceEnders: Set<Character> = [".", "!", "?"]
        let candidate: Substring
        if let lastEnder = before.lastIndex(where: { sentenceEnders.contains($0) }) {
            candidate = before[before.index(after: lastEnder)...]
        } else {
            candidate = before[...]
        }

        let trimmed = String(candidate).trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : InputSnapshot(text: trimmed, wasSelection: false)
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
        optionsStrip.isHidden = false
    }

    private func selectOption(at index: Int) {
        guard index < currentTranslations.count, let previousText = lastInsertedText else { return }

        UIDevice.current.playInputClick()
        for _ in previousText {
            textDocumentProxy.deleteBackward()
        }
        let option = currentTranslations[index]
        textDocumentProxy.insertText(option.text)
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
