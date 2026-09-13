import Foundation

/// The App Group shared between the container app and the keyboard extension.
///
/// This same identifier doubles as the keychain access group in
/// `KeychainStore` — items tagged with an App Group identifier as their
/// `kSecAttrAccessGroup` are visible to every target that shares that group,
/// so no separate `keychain-access-groups` entitlement is needed.
public enum AppGroup {
    public static let identifier = "group.dev.joshrmcdaniel.translatarr"

    /// Falls back to `.standard` if the App Group suite can't be opened
    /// (missing/broken entitlement, transient OS-level hiccup at launch,
    /// etc.) rather than crashing the whole extension — a shared-storage
    /// problem should degrade to "settings aren't shared with the app" and
    /// stay debuggable, not take down the keyboard entirely.
    public static var defaults: UserDefaults {
        UserDefaults(suiteName: identifier) ?? .standard
    }
}
