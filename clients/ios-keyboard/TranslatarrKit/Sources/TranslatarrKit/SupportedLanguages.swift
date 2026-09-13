import Foundation

public struct LanguageOption: Sendable {
    public let code: String
    public let name: String
}

/// Mirrors the server's `languages.ts` registry. There's no REST endpoint
/// exposing it (only the MCP tool `list_languages` does), so this has to be
/// kept in sync by hand — the same situation the TypeScript and Rust clients
/// solve with their own generated language mirrors.
public enum SupportedLanguages {
    public static let all: [LanguageOption] = [
        LanguageOption(code: "en", name: "English"),
        LanguageOption(code: "ar", name: "Arabic"),
        LanguageOption(code: "yue", name: "Cantonese"),
        LanguageOption(code: "zh", name: "Chinese (Mandarin)"),
        LanguageOption(code: "cs", name: "Czech"),
        LanguageOption(code: "nl", name: "Dutch"),
        LanguageOption(code: "fi", name: "Finnish"),
        LanguageOption(code: "fr", name: "French"),
        LanguageOption(code: "de", name: "German"),
        LanguageOption(code: "el", name: "Greek"),
        LanguageOption(code: "he", name: "Hebrew"),
        LanguageOption(code: "hu", name: "Hungarian"),
        LanguageOption(code: "id", name: "Indonesian"),
        LanguageOption(code: "it", name: "Italian"),
        LanguageOption(code: "ja", name: "Japanese"),
        LanguageOption(code: "km", name: "Khmer"),
        LanguageOption(code: "ko", name: "Korean"),
        LanguageOption(code: "mn", name: "Mongolian"),
        LanguageOption(code: "fa", name: "Persian (Farsi)"),
        LanguageOption(code: "pl", name: "Polish"),
        LanguageOption(code: "pt", name: "Portuguese"),
        LanguageOption(code: "ro", name: "Romanian"),
        LanguageOption(code: "ru", name: "Russian"),
        LanguageOption(code: "es", name: "Spanish"),
        LanguageOption(code: "sv", name: "Swedish"),
        LanguageOption(code: "tl", name: "Tagalog"),
        LanguageOption(code: "th", name: "Thai"),
        LanguageOption(code: "uk", name: "Ukrainian"),
        LanguageOption(code: "vi", name: "Vietnamese"),
    ]
}
