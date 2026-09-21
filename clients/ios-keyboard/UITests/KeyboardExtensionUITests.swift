import XCTest

final class KeyboardExtensionUITests: XCTestCase {
    func testKeyboardLayoutAndSystemEmojiSwitching() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        let general = settings.staticTexts["General"]
        for _ in 0..<3 where !general.isHittable { settings.swipeDown() }
        for _ in 0..<3 where !general.isHittable { settings.swipeUp() }
        XCTAssertTrue(general.waitForExistence(timeout: 10), settings.debugDescription)
        general.tap()
        let keyboard = settings.staticTexts["Keyboard"]
        if !keyboard.isHittable { settings.swipeUp() }
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5), settings.debugDescription)
        keyboard.tap()
        let keyboards = settings.cells["KEYBOARDS"]
        XCTAssertTrue(keyboards.waitForExistence(timeout: 5), settings.debugDescription)
        keyboards.tap()
        if !settings.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Translatarr")).firstMatch.exists {
            let addKeyboard = settings.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Add New Keyboard")).firstMatch
            XCTAssertTrue(addKeyboard.waitForExistence(timeout: 5), settings.debugDescription)
            addKeyboard.tap()
            let translatarr = settings.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Translatarr")).firstMatch
            XCTAssertTrue(translatarr.waitForExistence(timeout: 5), settings.debugDescription)
            translatarr.tap()
        }

        app.activate()
        app.tabBars.buttons["Settings"].tap()
        let field = app.textFields["Source (auto, en, ja, …)"]
        field.tap()
        let reply = app.buttons["Read a reply"]
        for _ in 0..<4 where !reply.waitForExistence(timeout: 2) {
            let globe = app.buttons["Next keyboard"].firstMatch
            XCTAssertTrue(globe.exists, app.debugDescription)
            globe.tap()
        }
        XCTAssertTrue(reply.waitForExistence(timeout: 5), app.debugDescription)
        let q = app.buttons["q"]
        let p = app.buttons["p"]
        let space = app.buttons["space"]
        XCTAssertTrue(q.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertEqual(q.frame.minX, app.frame.minX, accuracy: 2)
        XCTAssertEqual(p.frame.maxX, app.frame.maxX, accuracy: 2)
        XCTAssertEqual(q.frame.width, app.frame.width / 10, accuracy: 1)
        XCTAssertGreaterThanOrEqual(q.frame.height, 58)
        XCTAssertLessThan(q.frame.minY - reply.frame.maxY, 60)
        XCTAssertGreaterThanOrEqual(space.frame.width, app.frame.width * 0.49)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Actual keyboard extension - iPhone 17 Pro Max"
        attachment.lifetime = .keepAlways
        add(attachment)

        app.buttons["keyboard.emojiSwitch"].press(forDuration: 1)
        let emojiOption = app.staticTexts["Emoji"].firstMatch
        XCTAssertTrue(emojiOption.waitForExistence(timeout: 5), app.debugDescription)
        emojiOption.tap()
        XCTAssertTrue(app.textFields["Search Emoji"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(reply.exists)
        let emojiAttachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        emojiAttachment.name = "Apple Emoji keyboard"
        emojiAttachment.lifetime = .keepAlways
        add(emojiAttachment)

        app.buttons["Next keyboard"].firstMatch.press(forDuration: 1)
        let translatarrOption = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Translatarr")).firstMatch
        XCTAssertTrue(translatarrOption.waitForExistence(timeout: 5), app.debugDescription)
        translatarrOption.tap()
        XCTAssertTrue(q.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertEqual(q.frame.width, app.frame.width / 10, accuracy: 1)

        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        let rotated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            app.frame.width > app.frame.height && abs(q.frame.height - 44) < 1
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [rotated], timeout: 8), .completed, app.debugDescription)
        let landscapeScreen = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        landscapeScreen.name = "Landscape screen"
        landscapeScreen.lifetime = .keepAlways
        add(landscapeScreen)
        XCTAssertLessThan(q.frame.minY - reply.frame.maxY, 50)
        XCTAssertGreaterThan(space.frame.maxY, app.frame.maxY - 75)
        // iOS gives the landscape keyboard symmetric side insets. Verify its
        // usable area expands and stays centered, rather than assuming zero insets.
        let typingWidth = p.frame.maxX - q.frame.minX
        XCTAssertEqual(q.frame.minX - app.frame.minX, app.frame.maxX - p.frame.maxX, accuracy: 2)
        XCTAssertGreaterThan(typingWidth, app.frame.width * 0.7)
        XCTAssertEqual(q.frame.width, typingWidth / 10, accuracy: 1)
        XCTAssertGreaterThanOrEqual(space.frame.width, typingWidth * 0.49)
        let landscapeAttachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        landscapeAttachment.name = "Actual keyboard extension - landscape"
        landscapeAttachment.lifetime = .keepAlways
        add(landscapeAttachment)

        // A short tap follows iOS's next-keyboard choice, which need not be Emoji.
        app.buttons["keyboard.emojiSwitch"].tap()
        let switched = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: reply)
        XCTAssertEqual(XCTWaiter.wait(for: [switched], timeout: 5), .completed, app.debugDescription)
    }
}
