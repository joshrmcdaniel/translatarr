import SwiftUI
import TranslatarrKit

/// Paste-a-blob proof of the server round trip: auth, TLS/VPN reachability,
/// and decoding, with none of the keyboard extension's proxy/latency
/// constraints. No chat, no glossary, no romanization — the web UI already
/// does those.
struct TranslateView: View {
    @State private var sourceText = ""
    @State private var sourceLang = Config.resolvedSourceLanguage
    @State private var targetLang = Config.targetLanguage ?? "es"
    @State private var result: TranslationResponse?
    @State private var errorMessage: String?
    @State private var isTranslating = false

    private let client = TranslatarrAPIClient()

    var body: some View {
        NavigationStack {
            Form {
                Section("Text") {
                    TextEditor(text: $sourceText)
                        .frame(minHeight: 120)
                }

                Section("Languages") {
                    TextField("Source (auto, en, ja, …)", text: $sourceLang)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Target (es, fr, ja, …)", text: $targetLang)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section {
                    Button {
                        Task { await translate() }
                    } label: {
                        if isTranslating {
                            ProgressView()
                        } else {
                            Text("Translate")
                        }
                    }
                    .disabled(isTranslating || sourceText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }

                if let result, !result.translations.isEmpty {
                    Section("Options") {
                        ForEach(Array(result.translations.enumerated()), id: \.offset) { _, option in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(option.text)
                                if let register = option.register {
                                    Text(register)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Translate")
        }
    }

    private func translate() async {
        errorMessage = nil
        result = nil
        isTranslating = true
        defer { isTranslating = false }

        do {
            result = try await client.translate(text: sourceText, sourceLang: sourceLang, targetLang: targetLang)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Something went wrong."
        }
    }
}

#Preview {
    TranslateView()
}
