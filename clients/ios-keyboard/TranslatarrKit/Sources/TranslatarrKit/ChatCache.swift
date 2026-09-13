import Foundation

/// Maps a language pair to the id of the long-lived chat used for that
/// pair's rolling context, cached in the App Group so it survives across
/// extension launches without any chat-management UI.
public enum ChatCache {
    private static func key(sourceLang: String, targetLang: String) -> String {
        "translatarr.chatId.\(sourceLang)-\(targetLang)"
    }

    public static func get(sourceLang: String, targetLang: String) -> String? {
        AppGroup.defaults.string(forKey: key(sourceLang: sourceLang, targetLang: targetLang))
    }

    public static func set(_ chatId: String, sourceLang: String, targetLang: String) {
        AppGroup.defaults.set(chatId, forKey: key(sourceLang: sourceLang, targetLang: targetLang))
    }

    public static func clear(sourceLang: String, targetLang: String) {
        AppGroup.defaults.removeObject(forKey: key(sourceLang: sourceLang, targetLang: targetLang))
    }
}
