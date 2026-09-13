import SwiftUI
import TranslatarrKit

struct SettingsView: View {
    @State private var hostURLText: String = Config.hostURL?.absoluteString ?? ""
    @State private var apiToken: String = KeychainStore.loadToken() ?? ""
    @State private var sourceLanguage: String = Config.sourceLanguage ?? ""
    @State private var targetLanguage: String = Config.targetLanguage ?? ""
    @State private var savedAt: Date?
    @State private var keyboardHasFullAccess: Bool? = Config.keyboardHasFullAccess
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
                    Text("The keyboard extension has no settings UI of its own — it reads this pair.")
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
        savedAt = Date()
    }
}

#Preview {
    SettingsView()
}
