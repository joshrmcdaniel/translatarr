import TranslatarrKit
import UIKit

struct KeyboardDocumentContext: Equatable {
    let identifier: NSUUID?
    let before: String?
    let after: String?
    let selection: String?

    init(_ proxy: UITextDocumentProxy) {
        before = proxy.documentContextBeforeInput
        after = proxy.documentContextAfterInput
        selection = proxy.selectedText
        // UIKit can return nil while disconnecting a field, despite the
        // nonnull annotation. Keep the Objective-C value to avoid a forced
        // Swift UUID bridge during keyboard dismissal.
        identifier = (proxy as? NSObject)?.value(forKey: "documentIdentifier") as? NSUUID
    }
}

/// Local spelling and typing conveniences. UIKit exposes dictionaries, not
/// Apple's predictive keyboard engine; nothing here sends keystrokes to a server.
final class KeyboardTypingAssistant {
    struct Suggestions {
        let word: String
        let alternatives: [String]
        let correction: String?
    }

    private struct Correction {
        let original: String
        let inserted: String
        let context: KeyboardDocumentContext
    }

    private let checker = UITextChecker()
    private let languages = UITextChecker.availableLanguages
    private var shortcuts: [String: String] = [:]
    private var knownWords: Set<String> = []
    private var correction: Correction?
    private var rejectedWord: String?
    private var lastSpaceTime: TimeInterval?
    private var lastSpaceContext: KeyboardDocumentContext?

    func useSupplementaryLexicon(_ lexicon: UILexicon) {
        for entry in lexicon.entries {
            if entry.userInput.caseInsensitiveCompare(entry.documentText) == .orderedSame {
                knownWords.insert(entry.documentText.lowercased())
            } else {
                shortcuts[entry.userInput.lowercased()] = entry.documentText
            }
        }
    }

    func reset() {
        correction = nil
        rejectedWord = nil
        lastSpaceTime = nil
        lastSpaceContext = nil
    }

    private func allowsProse(_ proxy: UITextDocumentProxy) -> Bool {
        switch proxy.keyboardType ?? .default {
        case .emailAddress, .URL, .numberPad, .decimalPad, .phonePad,
             .namePhonePad, .asciiCapableNumberPad, .numbersAndPunctuation:
            return false
        default:
            return true
        }
    }

    private var language: String? {
        let source = Config.resolvedSourceLanguage
        let requested = (source == "auto" ? (Locale.preferredLanguages.first ?? "en-US") : source)
            .replacingOccurrences(of: "-", with: "_")
        return languages.first { $0.caseInsensitiveCompare(requested) == .orderedSame }
            ?? languages.first { $0.split(separator: "_").first == requested.split(separator: "_").first }
    }

    static func isWordCharacter(_ character: Character) -> Bool {
        character.isLetter || character == "'" || character == "’"
    }

    static func wordBeforeCursor(_ before: String?, after: String?) -> String? {
        guard let before, let last = before.last, last.isLetter,
              after?.first.map({ !isWordCharacter($0) && !$0.isNumber }) ?? true
        else { return nil }
        let word = String(before.reversed().prefix(while: isWordCharacter).reversed())
        guard (1...48).contains(word.count), word.first?.isLetter == true else { return nil }
        // Leave addresses, URLs, handles, numbers, and code-like tokens alone.
        if let previous = before.dropLast(word.count).last,
           previous.isNumber || "@#/_-.\\".contains(previous) { return nil }
        return word
    }

    func suggestions(for proxy: UITextDocumentProxy) -> Suggestions? {
        guard allowsProse(proxy), proxy.autocorrectionType != .no,
              proxy.spellCheckingType != .no, proxy.selectedText?.isEmpty != false,
              let word = Self.wordBeforeCursor(proxy.documentContextBeforeInput, after: proxy.documentContextAfterInput)
        else { return nil }

        var alternatives: [String] = []
        var replacement: String?
        if let shortcut = shortcuts[word.lowercased()] {
            alternatives.append(shortcut)
            replacement = shortcut
        }
        if let language {
            let range = NSRange(word.startIndex..., in: word)
            let misspelled = checker.rangeOfMisspelledWord(
                in: word, range: range, startingAt: 0, wrap: false, language: language
            ).location != NSNotFound
            if misspelled && !knownWords.contains(word.lowercased()) {
                let guesses = checker.guesses(forWordRange: range, in: word, language: language) ?? []
                alternatives += guesses.prefix(3).map { Self.matchCase($0, to: word) }
                if replacement == nil, word.count > 1, word != word.uppercased(),
                   let first = guesses.first, Self.isConservativeCorrection(from: word, to: first) {
                    replacement = Self.matchCase(first, to: word)
                }
            }
            if word == "i", language.hasPrefix("en") {
                alternatives.insert("I", at: 0)
                replacement = "I"
            }
            if alternatives.count < 2 {
                alternatives += (checker.completions(forPartialWordRange: range, in: word, language: language) ?? [])
                    .prefix(3).map { Self.matchCase($0, to: word) }
            }
        }
        var seen: Set<String> = [word]
        alternatives = alternatives.filter { seen.insert($0).inserted }
        return Suggestions(word: word, alternatives: Array(alternatives.prefix(2)), correction: replacement)
    }

    private static func matchCase(_ suggestion: String, to word: String) -> String {
        if word.count > 1, word == word.uppercased() { return suggestion.uppercased() }
        if word.first?.isUppercase == true {
            return suggestion.prefix(1).uppercased() + suggestion.dropFirst()
        }
        return suggestion
    }

    /// One inserted/deleted/substituted character, or an adjacent transposition.
    /// More speculative dictionary guesses remain available as manual suggestions.
    static func isConservativeCorrection(from word: String, to suggestion: String) -> Bool {
        let lhs = Array(word.lowercased())
        let rhs = Array(suggestion.lowercased())
        guard abs(lhs.count - rhs.count) <= 1 else { return false }
        if lhs == rhs { return false }
        if lhs.count == rhs.count {
            let differences = lhs.indices.filter { lhs[$0] != rhs[$0] }
            if differences.count == 1 { return true }
            guard differences.count == 2, differences[1] == differences[0] + 1 else { return false }
            return lhs[differences[0]] == rhs[differences[1]] && lhs[differences[1]] == rhs[differences[0]]
        }
        let shorter = lhs.count < rhs.count ? lhs : rhs
        let longer = lhs.count < rhs.count ? rhs : lhs
        let mismatch = shorter.indices.first { shorter[$0] != longer[$0] } ?? shorter.count
        return Array(longer.prefix(mismatch) + longer.dropFirst(mismatch + 1)) == shorter
    }

    func shouldCapitalize(_ proxy: UITextDocumentProxy) -> Bool {
        guard Config.keyboardAutoCapitalization, allowsProse(proxy) else { return false }
        let before = proxy.documentContextBeforeInput ?? ""
        switch proxy.autocapitalizationType ?? .sentences {
        case .none: return false
        case .allCharacters: return true
        case .words: return before.isEmpty || before.last?.isWhitespace == true
        case .sentences:
            if before.isEmpty || before.last?.isNewline == true { return true }
            guard before.last?.isWhitespace == true else { return false }
            let previous = before.reversed().drop(while: { $0.isWhitespace || "\"'’”)]}".contains($0) }).first
            return previous == nil || previous.map { ".!?。！？".contains($0) } == true
        @unknown default: return false
        }
    }

    func insert(_ text: String, into proxy: UITextDocumentProxy, correctWord: Bool = true) {
        let context = KeyboardDocumentContext(proxy)
        let now = ProcessInfo.processInfo.systemUptime
        if text == " ", Config.keyboardDoubleSpacePeriod, allowsProse(proxy),
           context.selection?.isEmpty != false, context == lastSpaceContext,
           let lastSpaceTime, now - lastSpaceTime < 0.35,
           let before = context.before, before.hasSuffix(" "),
           let previous = before.dropLast().last, previous.isLetter || previous.isNumber {
            _ = replaceSuffix(" ", with: ". ", in: proxy)
            reset()
            return
        }

        correction = nil
        let isBoundary = [" ", "\n", ".", ",", "!", "?", ";", ":"].contains(text)
        var correctedWord: (String, String)?
        if isBoundary, correctWord, context.identifier != nil, Config.keyboardAutoCorrection,
           let suggestions = suggestions(for: proxy), suggestions.word != rejectedWord,
           let replacement = suggestions.correction,
           replaceSuffix(suggestions.word, with: replacement, in: proxy) {
            correctedWord = (suggestions.word, replacement)
        }
        proxy.insertText(text)
        if let (original, replacement) = correctedWord {
            correction = Correction(original: original, inserted: replacement + text, context: KeyboardDocumentContext(proxy))
        }
        rejectedWord = nil
        lastSpaceTime = text == " " ? now : nil
        lastSpaceContext = text == " " ? KeyboardDocumentContext(proxy) : nil
    }

    func deleteBackward(in proxy: UITextDocumentProxy) {
        if let correction, correction.context.identifier != nil, correction.context == KeyboardDocumentContext(proxy),
           replaceSuffix(correction.inserted, with: correction.original, in: proxy) {
            rejectedWord = correction.original
        } else {
            proxy.deleteBackward()
            rejectedWord = nil
        }
        correction = nil
        lastSpaceTime = nil
        lastSpaceContext = nil
    }

    func accept(_ suggestion: String, word: String, context: KeyboardDocumentContext, in proxy: UITextDocumentProxy) {
        guard context.identifier != nil, context == KeyboardDocumentContext(proxy),
              replaceSuffix(word, with: suggestion, in: proxy) else { return }
        reset()
        proxy.insertText(" ")
    }

    @discardableResult
    private func replaceSuffix(_ suffix: String, with replacement: String, in proxy: UITextDocumentProxy) -> Bool {
        guard proxy.selectedText?.isEmpty != false,
              let before = proxy.documentContextBeforeInput, before.hasSuffix(suffix) else { return false }
        for _ in suffix { proxy.deleteBackward() }
        guard proxy.documentContextBeforeInput != before else { return false }
        proxy.insertText(replacement)
        return true
    }

    /// Include terminal punctuation and spaces in the replacement span. This
    /// also lets Translate work immediately after the double-space shortcut.
    static func sentenceBeforeCursor(_ before: String) -> String? {
        var contentEnd = before.endIndex
        while contentEnd > before.startIndex, before[before.index(before: contentEnd)].isWhitespace {
            contentEnd = before.index(before: contentEnd)
        }
        guard contentEnd > before.startIndex else { return nil }
        let enders = ".!?。！？\n"
        while contentEnd > before.startIndex {
            let previous = before.index(before: contentEnd)
            guard enders.contains(before[previous]) || "\"'’”)]}".contains(before[previous]) else { break }
            contentEnd = previous
        }
        let search = before[..<contentEnd]
        let start: String.Index
        if let boundary = search.lastIndex(where: { enders.contains($0) }) {
            start = before.index(after: boundary)
        } else {
            start = before.startIndex
        }
        let candidate = String(before[start...].drop(while: { $0.isWhitespace }))
        return candidate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : candidate
    }
}
