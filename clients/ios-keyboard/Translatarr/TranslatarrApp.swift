import SwiftUI

@main
struct TranslatarrApp: App {
    var body: some Scene {
        WindowGroup {
            TabView {
                TranslateView()
                    .tabItem { Label("Translate", systemImage: "text.bubble") }
                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gear") }
            }
        }
    }
}
