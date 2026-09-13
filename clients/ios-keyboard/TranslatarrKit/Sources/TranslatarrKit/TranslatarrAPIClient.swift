import Foundation

/// Thin wrapper over the translate and chat endpoints. Reads the host and
/// token from `Config` / `KeychainStore` on every call rather than caching
/// them, so a Settings change takes effect on the next call without
/// restarting anything.
public struct TranslatarrAPIClient: Sendable {
    private struct ErrorPayload: Decodable {
        let error: String
        let code: String?
    }

    private let session: URLSession

    public init(requestTimeout: TimeInterval = 8) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = requestTimeout
        configuration.timeoutIntervalForResource = requestTimeout
        self.session = URLSession(configuration: configuration)
    }

    // MARK: - Stateless translate

    public func translate(
        text: String,
        sourceLang: String,
        targetLang: String,
        tone: String? = nil,
        chatId: String? = nil
    ) async throws -> TranslationResponse {
        try await send(
            path: "api/translate",
            body: TranslateRequest(text: text, sourceLang: sourceLang, targetLang: targetLang, tone: tone, chatId: chatId)
        )
    }

    // MARK: - Chat-backed context

    /// Translates within the long-lived chat for this language pair (created
    /// on first use, cached by `ChatCache`), so pronouns and formality carry
    /// between calls. If the cached chat was deleted server-side (e.g. from
    /// the web UI), transparently creates a new one and retries once.
    ///
    /// Pass `pinnedChatId` to target a specific, user-picked conversation
    /// instead — that path does *not* self-heal on a 404 (a pin the user
    /// explicitly chose shouldn't silently become a different conversation);
    /// the caller is expected to notice the error and clear the pin.
    public func translateInChat(
        text: String,
        sourceLang: String,
        targetLang: String,
        tone: String? = nil,
        pinnedChatId: String? = nil
    ) async throws -> TranslationResponse {
        if let pinnedChatId {
            return try await addTurn(chatId: pinnedChatId, text: text, sourceLang: sourceLang, targetLang: targetLang, tone: tone)
        }

        let chatId = try await resolveChatId(sourceLang: sourceLang, targetLang: targetLang)

        do {
            return try await addTurn(chatId: chatId, text: text, sourceLang: sourceLang, targetLang: targetLang, tone: tone)
        } catch let APIError.httpError(status, _) where status == 404 {
            ChatCache.clear(sourceLang: sourceLang, targetLang: targetLang)
            let freshChatId = try await createChat(sourceLang: sourceLang, targetLang: targetLang)
            ChatCache.set(freshChatId, sourceLang: sourceLang, targetLang: targetLang)
            return try await addTurn(chatId: freshChatId, text: text, sourceLang: sourceLang, targetLang: targetLang, tone: tone)
        }
    }

    /// The user's chats, for the "switch conversation" picker.
    public func listChats() async throws -> [ChatSummary] {
        struct Envelope: Decodable { let chats: [ChatSummary] }
        let envelope: Envelope = try await send(path: "api/chats")
        return envelope.chats
    }

    private func resolveChatId(sourceLang: String, targetLang: String) async throws -> String {
        if let cached = ChatCache.get(sourceLang: sourceLang, targetLang: targetLang) {
            return cached
        }
        let chatId = try await createChat(sourceLang: sourceLang, targetLang: targetLang)
        ChatCache.set(chatId, sourceLang: sourceLang, targetLang: targetLang)
        return chatId
    }

    private struct CreateChatRequest: Encodable {
        let sourceLang: String
        let targetLang: String
    }

    private struct ChatEnvelope: Decodable {
        let chat: ChatSummary
    }

    private func createChat(sourceLang: String, targetLang: String) async throws -> String {
        let envelope: ChatEnvelope = try await send(
            path: "api/chats",
            body: CreateChatRequest(sourceLang: sourceLang, targetLang: targetLang)
        )
        return envelope.chat.id
    }

    private struct CreateTurnRequest: Encodable {
        let text: String
        let sourceLang: String
        let targetLang: String
        let tone: String?
    }

    private struct TurnEnvelope: Decodable {
        struct Turn: Decodable { let result: TranslationResponse }
        struct Chat: Decodable { let turns: [Turn] }
        let chat: Chat
    }

    private func addTurn(
        chatId: String,
        text: String,
        sourceLang: String,
        targetLang: String,
        tone: String?
    ) async throws -> TranslationResponse {
        let envelope: TurnEnvelope = try await send(
            path: "api/chats/\(chatId)/turns",
            body: CreateTurnRequest(text: text, sourceLang: sourceLang, targetLang: targetLang, tone: tone)
        )
        guard let result = envelope.chat.turns.last?.result else {
            throw APIError.decodingFailed
        }
        return result
    }

    // MARK: - Request plumbing

    private func send<Body: Encodable, Response: Decodable>(path: String, body: Body) async throws -> Response {
        var request = try authorizedRequest(path: path, method: "POST")
        request.httpBody = try JSONEncoder().encode(body)
        return try await perform(request)
    }

    private func send<Response: Decodable>(path: String, method: String = "GET") async throws -> Response {
        try await perform(try authorizedRequest(path: path, method: method))
    }

    private func authorizedRequest(path: String, method: String) throws -> URLRequest {
        guard let host = Config.hostURL else { throw APIError.invalidHost }
        guard let token = KeychainStore.loadToken(), !token.isEmpty else { throw APIError.unauthorized }

        var request = URLRequest(url: host.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.from(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("No HTTP response.")
        }

        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 401 {
                throw APIError.unauthorized
            }
            let message = (try? JSONDecoder().decode(ErrorPayload.self, from: data))?.error ?? "Request failed."
            throw APIError.httpError(status: http.statusCode, message: message)
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw APIError.decodingFailed
        }
    }
}
