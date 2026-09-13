import Foundation

/// The distinct failure modes worth surfacing separately: each calls for a
/// different user action (fix the VPN vs. fix the API key vs. wait and retry).
public enum APIError: Error, Sendable {
    case invalidHost
    case cannotConnectToHost
    case timedOut
    case notConnectedToInternet
    case serverCertificateUntrusted
    case unauthorized
    case httpError(status: Int, message: String)
    case decodingFailed
    case unknown(String)

    static func from(_ error: Error) -> APIError {
        guard let urlError = error as? URLError else {
            return .unknown(error.localizedDescription)
        }

        switch urlError.code {
        case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
            return .cannotConnectToHost
        case .timedOut:
            return .timedOut
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
            return .notConnectedToInternet
        case .serverCertificateUntrusted, .serverCertificateHasBadDate, .serverCertificateNotYetValid,
             .serverCertificateHasUnknownRoot, .clientCertificateRejected:
            return .serverCertificateUntrusted
        default:
            return .unknown(urlError.localizedDescription)
        }
    }
}

extension APIError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .invalidHost:
            return "Set a server URL in Settings."
        case .cannotConnectToHost:
            return "Can't reach server — VPN?"
        case .timedOut:
            return "Request timed out — VPN?"
        case .notConnectedToInternet:
            return "No internet connection."
        case .serverCertificateUntrusted:
            return "Server certificate isn't trusted. Check the CA profile on this device."
        case .unauthorized:
            return "Bad API key."
        case let .httpError(status, message):
            return "\(message) (\(status))"
        case .decodingFailed:
            return "Unexpected response from server."
        case let .unknown(message):
            return message
        }
    }
}
