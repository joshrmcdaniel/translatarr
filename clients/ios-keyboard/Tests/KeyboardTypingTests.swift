import TranslatarrKit
import UIKit
import XCTest

final class KeyboardTypingTests: XCTestCase {
    private var savedPreferences: [String: Any] = [:]
    private let preferenceKeys = [
        "keyboard.autoCorrection", "keyboard.suggestions", "keyboard.autoCapitalization",
        "keyboard.doubleSpacePeriod", "translatarr.sourceLanguage",
    ]

    override func setUp() {
        super.setUp()
        for key in preferenceKeys { savedPreferences[key] = AppGroup.defaults.object(forKey: key) }
        Config.sourceLanguage = "en"
        Config.keyboardAutoCorrection = true
        Config.keyboardAutoCapitalization = true
        Config.keyboardDoubleSpacePeriod = true
    }

    override func tearDown() {
        for key in preferenceKeys { AppGroup.defaults.set(savedPreferences[key], forKey: key) }
        super.tearDown()
    }

    func testCorrectionCanBeUndoneAndOriginalKept() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "teh")
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "the ")
        assistant.deleteBackward(in: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh")
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh ")
    }

    func testAutocorrectionHonorsPreferencesAndFieldTraits() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "teh")
        proxy.autocorrectionType = .no
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh ")
        proxy.documentContextBeforeInput = "teh"
        proxy.autocorrectionType = .default
        Config.keyboardAutoCorrection = false
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh ")
        Config.keyboardAutoCorrection = true
        proxy.documentContextBeforeInput = "teh"
        proxy.keyboardType = .emailAddress
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh ")
    }

    func testUnsupportedSourceDoesNotFallBackToEnglishCorrections() {
        Config.sourceLanguage = "zz"
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "teh")
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh ")
    }

    func testSelectionAndMiddleOfWordAreNotAutocorrected() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "teh", after: "rest")
        XCTAssertNil(assistant.suggestions(for: proxy))
        proxy.documentContextAfterInput = ""
        proxy.selectedText = "selection"
        XCTAssertNil(assistant.suggestions(for: proxy))
        assistant.insert("x", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "tehx")
    }

    func testSuggestionsCannotReplaceTextAfterCursorOrDocumentChanges() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "teh")
        let context = KeyboardDocumentContext(proxy)
        proxy.documentContextBeforeInput = "somewhere else"
        assistant.accept("the", word: "teh", context: context, in: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "somewhere else")
        proxy.documentContextBeforeInput = "teh"
        proxy.documentIdentifier = UUID()
        assistant.accept("the", word: "teh", context: context, in: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh")
    }

    func testCorrectionUndoCannotAffectAnotherDocument() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "teh")
        assistant.insert(" ", into: proxy)
        proxy.documentIdentifier = UUID()
        assistant.deleteBackward(in: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "the")
    }

    func testDisconnectedDocumentDoesNotCrashOrAcceptASuggestion() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "teh")
        proxy.isDisconnected = true
        let context = KeyboardDocumentContext(proxy)
        XCTAssertNil(context.identifier)
        assistant.accept("the", word: "teh", context: context, in: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "teh")
    }

    func testDoubleSpaceRequiresTwoConsecutiveSpaceTaps() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "hello")
        assistant.insert(" ", into: proxy)
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "hello. ")
        XCTAssertTrue(assistant.shouldCapitalize(proxy))

        assistant.reset()
        proxy.documentContextBeforeInput = "hello "
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "hello  ")
        assistant.reset()
        proxy.documentContextBeforeInput = "hello!"
        assistant.insert(" ", into: proxy)
        assistant.insert(" ", into: proxy)
        XCTAssertEqual(proxy.documentContextBeforeInput, "hello!  ")
    }

    func testCapitalizationHonorsHostTraits() {
        let assistant = KeyboardTypingAssistant()
        let proxy = TestDocumentProxy(before: "")
        XCTAssertTrue(assistant.shouldCapitalize(proxy))
        proxy.documentContextBeforeInput = nil
        XCTAssertTrue(assistant.shouldCapitalize(proxy))
        proxy.documentContextBeforeInput = "Hello "
        XCTAssertFalse(assistant.shouldCapitalize(proxy))
        proxy.documentContextBeforeInput = "Hello! ” "
        XCTAssertTrue(assistant.shouldCapitalize(proxy))
        proxy.autocapitalizationType = .none
        XCTAssertFalse(assistant.shouldCapitalize(proxy))
        proxy.autocapitalizationType = .words
        proxy.documentContextBeforeInput = "Hello "
        XCTAssertTrue(assistant.shouldCapitalize(proxy))
        Config.keyboardAutoCapitalization = false
        XCTAssertFalse(assistant.shouldCapitalize(proxy))
    }

    func testUnicodeWordsAndNonProseTokens() {
        XCTAssertEqual(KeyboardTypingAssistant.wordBeforeCursor("👨‍👩‍👧‍👦 cafe\u{301}", after: ""), "cafe\u{301}")
        XCTAssertEqual(KeyboardTypingAssistant.wordBeforeCursor("don't", after: ""), "don't")
        for text in ["me@teh", "https://teh", "name.teh", "@teh", "#teh", "123teh", "snake_teh"] {
            XCTAssertNil(KeyboardTypingAssistant.wordBeforeCursor(text, after: ""), text)
        }
    }

    func testOnlyCloseSpellingGuessesAreAutomaticallyApplied() {
        XCTAssertTrue(KeyboardTypingAssistant.isConservativeCorrection(from: "teh", to: "the"))
        XCTAssertTrue(KeyboardTypingAssistant.isConservativeCorrection(from: "dont", to: "don't"))
        XCTAssertTrue(KeyboardTypingAssistant.isConservativeCorrection(from: "hellp", to: "hello"))
        XCTAssertFalse(KeyboardTypingAssistant.isConservativeCorrection(from: "hello", to: "helpful"))
        XCTAssertFalse(KeyboardTypingAssistant.isConservativeCorrection(from: "hello", to: "hello"))
    }

    func testTranslatePreservesExactReplacementSpanAfterTypingShortcuts() {
        XCTAssertEqual(KeyboardTypingAssistant.sentenceBeforeCursor("Hello. "), "Hello. ")
        XCTAssertEqual(KeyboardTypingAssistant.sentenceBeforeCursor("First. Second!  "), "Second!  ")
        XCTAssertEqual(KeyboardTypingAssistant.sentenceBeforeCursor("First\n👋 Hello"), "👋 Hello")
        XCTAssertEqual(KeyboardTypingAssistant.sentenceBeforeCursor("  café 👨‍👩‍👧‍👦  "), "café 👨‍👩‍👧‍👦  ")
        XCTAssertNil(KeyboardTypingAssistant.sentenceBeforeCursor(" \n "))
    }
}

private final class TestDocumentProxy: NSObject, UITextDocumentProxy {
    var documentContextBeforeInput: String?
    var documentContextAfterInput: String?
    var selectedText: String?
    var documentInputMode: UITextInputMode? { nil }
    var documentIdentifier = UUID()
    var isDisconnected = false
    var autocorrectionType: UITextAutocorrectionType = .default
    var autocapitalizationType: UITextAutocapitalizationType = .sentences
    var keyboardType: UIKeyboardType = .default
    var hasText: Bool { documentContextBeforeInput?.isEmpty == false }

    init(before: String, after: String = "") {
        documentContextBeforeInput = before
        documentContextAfterInput = after
    }

    override func value(forKey key: String) -> Any? {
        if key == "documentIdentifier", isDisconnected { return nil }
        return super.value(forKey: key)
    }

    func insertText(_ text: String) {
        selectedText = nil
        documentContextBeforeInput = (documentContextBeforeInput ?? "") + text
    }

    func deleteBackward() {
        if selectedText != nil { selectedText = nil }
        else { documentContextBeforeInput = documentContextBeforeInput.map { String($0.dropLast()) } }
    }

    func adjustTextPosition(byCharacterOffset offset: Int) {}
    func setMarkedText(_ markedText: String, selectedRange: NSRange) {}
    func unmarkText() {}
}
