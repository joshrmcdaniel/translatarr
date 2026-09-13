import Foundation

/// Non-secret configuration shared via the App Group's `UserDefaults` suite.
/// The API token itself lives in `KeychainStore`, never here.
public enum Config {
    private static let hostURLKey = "translatarr.hostURL"
    private static let sourceLanguageKey = "translatarr.sourceLanguage"
    private static let targetLanguageKey = "translatarr.targetLanguage"
    private static let keyboardHasFullAccessKey = "translatarr.keyboardHasFullAccess"
    private static let pinnedChatIdKey = "translatarr.pinnedChatId"

    public static var hostURL: URL? {
        get {
            guard let raw = AppGroup.defaults.string(forKey: hostURLKey) else { return nil }
            return URL(string: raw)
        }
        set {
            AppGroup.defaults.set(newValue?.absoluteString, forKey: hostURLKey)
        }
    }

    /// Raw stored preference; nil when the user hasn't set one yet. Settings
    /// UI binds to this directly so an unset field reads as empty.
    public static var sourceLanguage: String? {
        get { AppGroup.defaults.string(forKey: sourceLanguageKey) }
        set { AppGroup.defaults.set(newValue, forKey: sourceLanguageKey) }
    }

    public static var targetLanguage: String? {
        get { AppGroup.defaults.string(forKey: targetLanguageKey) }
        set { AppGroup.defaults.set(newValue, forKey: targetLanguageKey) }
    }

    /// `sourceLanguage`, defaulting to auto-detect when unset — auto is
    /// always a valid source, so the keyboard can translate before the user
    /// has touched Settings at all.
    public static var resolvedSourceLanguage: String {
        let trimmed = sourceLanguage?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty == false) ? trimmed! : "auto"
    }

    /// Reported by the extension itself (it's the only side that can read
    /// `UIInputViewController.hasFullAccess`) each time it appears, so the
    /// container app can detect the disabled state and say so plainly
    /// instead of leaving the keyboard looking silently broken. `nil` means
    /// the keyboard has never been opened yet, not that access is denied.
    public static var keyboardHasFullAccess: Bool? {
        get { AppGroup.defaults.object(forKey: keyboardHasFullAccessKey) as? Bool }
        set { AppGroup.defaults.set(newValue, forKey: keyboardHasFullAccessKey) }
    }

    /// A chat explicitly picked from the conversation list, overriding the
    /// per-pair auto-managed chat until the user changes languages or picks
    /// a different conversation. Callers are responsible for clearing this
    /// when the language pair changes out from under it.
    public static var pinnedChatId: String? {
        get { AppGroup.defaults.string(forKey: pinnedChatIdKey) }
        set { AppGroup.defaults.set(newValue, forKey: pinnedChatIdKey) }
    }
}
