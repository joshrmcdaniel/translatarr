import Foundation

/// The server owns this shape and evolves it independently of this client, so
/// every field but `TranslationOption.text` decodes leniently (missing ->
/// nil/empty rather than a thrown error).
public struct KeyWord: Decodable, Sendable {
    public let source: String?
    public let target: String?
    public let romanization: String?
}

public struct TranslationOption: Decodable, Sendable {
    public let text: String
    public let romanization: String?
    public let sourceEquivalent: String?
    public let register: String?
    public let tone: String?
    public let keyWords: [KeyWord]

    private enum CodingKeys: String, CodingKey {
        case text, romanization, sourceEquivalent, register, tone, keyWords
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        text = try container.decode(String.self, forKey: .text)
        romanization = try? container.decodeIfPresent(String.self, forKey: .romanization)
        sourceEquivalent = try? container.decodeIfPresent(String.self, forKey: .sourceEquivalent)
        register = try? container.decodeIfPresent(String.self, forKey: .register)
        tone = try? container.decodeIfPresent(String.self, forKey: .tone)
        keyWords = (try? container.decode([KeyWord].self, forKey: .keyWords)) ?? []
    }
}

public struct TranslationResponse: Decodable, Sendable {
    public let detectedSourceLanguage: String?
    public let confidence: Double?
    /// 2-3 ranked options, best first, per the server's schema.
    public let translations: [TranslationOption]

    private enum CodingKeys: String, CodingKey {
        case detectedSourceLanguage, confidence, translations
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        detectedSourceLanguage = try? container.decodeIfPresent(String.self, forKey: .detectedSourceLanguage)
        confidence = try? container.decodeIfPresent(Double.self, forKey: .confidence)
        translations = (try? container.decode([TranslationOption].self, forKey: .translations)) ?? []
    }
}

/// A chat as listed by `GET /api/chats`. Only `id` is required to decode —
/// everything else is display-only for the conversation picker.
public struct ChatSummary: Decodable, Sendable, Identifiable {
    public let id: String
    public let title: String?
    public let sourceLang: String?
    public let targetLang: String?
    public let updatedAt: String?

    private enum CodingKeys: String, CodingKey {
        case id, title, sourceLang, targetLang, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try? container.decodeIfPresent(String.self, forKey: .title)
        sourceLang = try? container.decodeIfPresent(String.self, forKey: .sourceLang)
        targetLang = try? container.decodeIfPresent(String.self, forKey: .targetLang)
        updatedAt = try? container.decodeIfPresent(String.self, forKey: .updatedAt)
    }
}

/// `POST /api/translate` request body. `tone` and `chatId` are omitted from
/// the encoded JSON when nil (the server's schema treats them as optional,
/// not nullable).
public struct TranslateRequest: Encodable, Sendable {
    public let text: String
    public let sourceLang: String
    public let targetLang: String
    public let tone: String?
    public let chatId: String?

    public init(text: String, sourceLang: String, targetLang: String, tone: String? = nil, chatId: String? = nil) {
        self.text = text
        self.sourceLang = sourceLang
        self.targetLang = targetLang
        self.tone = tone
        self.chatId = chatId
    }
}
