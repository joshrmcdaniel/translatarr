import SwiftUI
import TranslatarrKit

struct SettingsView: View {
    @State private var hostURLText: String = Config.hostURL?.absoluteString ?? ""
    @State private var apiToken: String = KeychainStore.loadToken() ?? ""
    @State private var sourceLanguage: String = Config.sourceLanguage ?? ""
    @State private var targetLanguage: String = Config.targetLanguage ?? ""
    @State private var savedAt: Date?
    @State private var keyboardHasFullAccess: Bool? = Config.keyboardHasFullAccess
    @State private var autoCorrection = Config.keyboardAutoCorrection
    @State private var suggestions = Config.keyboardSuggestions
    @State private var autoCapitalization = Config.keyboardAutoCapitalization
    @State private var doubleSpacePeriod = Config.keyboardDoubleSpacePeriod
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            Form {
                if keyboardHasFullAccess == false {
                    Section {
                        Label(
                            "Full Access is off — the keyboard can't reach the server. Enable it in Settings → Keyboard → Keyboards → Translatarr → Allow Full Access.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .foregroundStyle(.orange)
                    }
                }

                Section("Server") {
                    TextField("https://translatarr.example", text: $hostURLText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }

                Section("API key") {
                    SecureField("tra_…", text: $apiToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("Settings → API keys in the web app.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Keyboard language pair") {
                    TextField("Source (auto, en, ja, …)", text: $sourceLanguage)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Target (es, fr, ja, …)", text: $targetLanguage)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("Source also sets the spelling language. Auto uses your device language.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Typing") {
                    Toggle("Auto-Correction", isOn: $autoCorrection)
                    Toggle("Word Suggestions", isOn: $suggestions)
                    Toggle("Auto-Capitalization", isOn: $autoCapitalization)
                    Toggle("Double-Space Period", isOn: $doubleSpacePeriod)
                    Text("Spelling suggestions work on your device. Press delete immediately after a correction to undo it.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                if let savedAt {
                    Section {
                        Text("Saved \(savedAt.formatted(date: .omitted, time: .standard))")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Translatarr")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                }
            }
        }
        .onChange(of: scenePhase) { newPhase in
            // The user toggles Full Access in the iOS Settings app, not here —
            // refresh when they come back to us.
            if newPhase == .active {
                keyboardHasFullAccess = Config.keyboardHasFullAccess
            }
        }
    }

    private func save() {
        Config.hostURL = URL(string: hostURLText)
        if apiToken.isEmpty {
            KeychainStore.deleteToken()
        } else {
            KeychainStore.saveToken(apiToken)
        }
        Config.sourceLanguage = sourceLanguage.isEmpty ? nil : sourceLanguage
        Config.targetLanguage = targetLanguage.isEmpty ? nil : targetLanguage
        Config.keyboardAutoCorrection = autoCorrection
        Config.keyboardSuggestions = suggestions
        Config.keyboardAutoCapitalization = autoCapitalization
        Config.keyboardDoubleSpacePeriod = doubleSpacePeriod
        savedAt = Date()
    }
}

#Preview {
    SettingsView()
}
