from playwright.sync_api import sync_playwright, expect
import base64

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    callback_executed = False
    def handle_console(msg):
        if "onTargetSelect callback executed" in msg.text:
            nonlocal callback_executed
            callback_executed = True

    page.on("console", handle_console)

    # Mock the elevation API call
    page.route("https://api.open-meteo.com/v1/elevation**", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"elevation": [100]}'
    ))

    # Mock the map tile server
    tile_url_pattern = "https://*.tile.openstreetmap.org/**/*.png"
    png_pixel = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
    page.route(tile_url_pattern, lambda route: route.fulfill(
        status=200,
        content_type="image/png",
        body=png_pixel
    ))

    page.goto("http://localhost:8000")

    # Wait for the map to load
    expect(page.locator("#map")).to_be_visible()

    # Hide the UI container to prevent it from intercepting the click
    page.evaluate("document.getElementById('ui-container').style.display = 'none'")

    # Last resort: wait a moment for the map to potentially initialize listeners
    page.wait_for_timeout(2000)

    # Click on the map to select a target
    page.locator("#map").click(position={"x": 100, "y": 100})

    # Wait for a moment to see if the callback is executed
    page.wait_for_timeout(1000)

    if not callback_executed:
        raise Exception("onTargetSelect callback was not executed.")

    # Wait for the AR object to become visible
    expect(page.locator("#ar-object")).to_be_visible()

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
