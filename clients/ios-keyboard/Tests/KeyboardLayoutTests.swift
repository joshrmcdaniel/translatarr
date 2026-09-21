import UIKit
import XCTest

final class KeyboardLayoutTests: XCTestCase {
    @MainActor
    func testKeyboardFollowsItsHostWidthAfterPresentationAndResizing() throws {
        let keyboard = KeyboardViewController()
        keyboard.loadViewIfNeeded()
        let host = UIView(frame: CGRect(x: 0, y: 0, width: 0, height: 340))
        keyboard.view.frame = host.bounds
        host.addSubview(keyboard.view)
        let buttons = descendants(keyboard.view).compactMap { $0 as? UIButton }
        let q = try XCTUnwrap(buttons
            .first { $0.configuration?.title?.lowercased() == "q" })
        let p = try XCTUnwrap(buttons
            .first { $0.configuration?.title?.lowercased() == "p" })

        // Assign each new frame as the extension host does. Start at zero width
        // and resize the same view, without a test-only width constraint.
        for width: CGFloat in [440, 320, 375, 956, 440] {
            host.bounds.size.width = width
            keyboard.view.frame = host.bounds
            host.setNeedsLayout()
            host.layoutIfNeeded()
            keyboard.view.layoutIfNeeded()
            XCTAssertEqual(keyboard.view.bounds.width, width, accuracy: 0.5)
            XCTAssertEqual(q.bounds.width, width / 10, accuracy: 0.5)
            XCTAssertEqual(q.convert(q.bounds, to: host).minX, 0, accuracy: 0.5)
            XCTAssertEqual(p.convert(p.bounds, to: host).maxX, width, accuracy: 0.5)
        }
    }

    @MainActor
    func testPortraitKeysHaveRoomAndTranslationStaysAboveTypingArea() async throws {
        for width: CGFloat in [320, 375, 440] {
            let controller = KeyboardViewController()
            controller.loadViewIfNeeded()
            let metrics = KeyboardLayoutMetrics(width: width, isLandscape: false, isPad: false)
            controller.view.frame = CGRect(x: 0, y: 0, width: width, height: metrics.contentHeight)
            controller.view.setNeedsLayout()
            controller.view.layoutIfNeeded()
            controller.view.layoutIfNeeded()
            let buttons = descendants(controller.view).compactMap { $0 as? UIButton }
            let q = try XCTUnwrap(buttons.first { $0.configuration?.title?.lowercased() == "q" })
            let a = try XCTUnwrap(buttons.first { $0.configuration?.title?.lowercased() == "a" })
            let z = try XCTUnwrap(buttons.first { $0.configuration?.title?.lowercased() == "z" })
            let space = try XCTUnwrap(buttons.first { $0.accessibilityLabel == "space" })
            let emoji = try XCTUnwrap(buttons.first { $0.accessibilityLabel == "Emoji" })
            let translate = try XCTUnwrap(buttons.first { $0.accessibilityLabel == "Translate" })
            XCTAssertEqual(controller.view.bounds.width, width, accuracy: 0.5)
            XCTAssertEqual(q.bounds.width, width / 10, accuracy: 0.5)
            XCTAssertGreaterThanOrEqual(q.bounds.height, 58)
            XCTAssertEqual(q.bounds.width, a.bounds.width, accuracy: 0.5)
            XCTAssertEqual(q.bounds.width, z.bounds.width, accuracy: 0.5)
            XCTAssertGreaterThanOrEqual(space.bounds.width, width * 0.49)
            XCTAssertGreaterThanOrEqual(emoji.bounds.width, 44)
            XCTAssertEqual(emoji.bounds.height, space.bounds.height, accuracy: 0.5)
            XCTAssertLessThan(translate.convert(translate.bounds, to: controller.view).maxY,
                              q.convert(q.bounds, to: controller.view).minY)
            XCTAssertEqual(a.convert(a.bounds, to: controller.view).minX, width * 0.05, accuracy: 0.5)

            if width == 440 {
                let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
                let window = UIWindow(windowScene: scene)
                let host = UIViewController()
                window.rootViewController = host
                host.view.addSubview(controller.view)
                window.isHidden = false
                defer {
                    window.isHidden = true
                    controller.view.removeFromSuperview()
                }
                for style in [UIUserInterfaceStyle.light, .dark] {
                    window.overrideUserInterfaceStyle = style
                    // Let UIKit update its text and symbol layers before taking
                    // an offscreen snapshot of the keyboard itself.
                    try await Task.sleep(nanoseconds: 100_000_000)
                    controller.view.layoutIfNeeded()
                    XCTAssertEqual(q.traitCollection.userInterfaceStyle, style)
                    controller.view.traitCollection.performAsCurrent {
                        let renderer = UIGraphicsImageRenderer(size: controller.view.bounds.size)
                        let image = renderer.image { context in
                            controller.view.layer.render(in: context.cgContext)
                        }
                        let attachment = XCTAttachment(image: image)
                        attachment.name = "Keyboard-17-Pro-Max-\(style == .light ? "light" : "dark")"
                        attachment.lifetime = .keepAlways
                        add(attachment)
                    }
                }
            }
        }
    }

    func testKeyboardMetricsReserveAccessorySpaceAndUseShorterLandscapeRows() {
        let portrait = KeyboardLayoutMetrics(width: 440, isLandscape: false, isPad: false)
        let landscape = KeyboardLayoutMetrics(width: 956, isLandscape: true, isPad: false)
        XCTAssertGreaterThan(portrait.contentHeight, portrait.typingHeight + portrait.toolbarHeight)
        XCTAssertLessThan(landscape.contentHeight, portrait.contentHeight)
        XCTAssertGreaterThanOrEqual(landscape.rowHeight, 44)
    }

    private func descendants(_ view: UIView) -> [UIView] {
        view.subviews.flatMap { [$0] + descendants($0) }
    }
}
