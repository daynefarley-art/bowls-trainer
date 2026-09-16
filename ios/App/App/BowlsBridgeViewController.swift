import UIKit
import WebKit
import AVFoundation
import Capacitor

/**
 Bowls Trainer bridge view controller.

 WHY THIS EXISTS
 ---------------
 Head Scan runs inside WKWebView and uses `getUserMedia`. For a REMOTE origin
 WKWebView asks its `WKUIDelegate` for media-capture permission on every single
 request, which is why the player was prompted for the camera on every end even
 though iOS had already granted camera access to the app.

 This subclass answers that delegate call using the real OS authorisation
 status:

   - AVAuthorizationStatus .authorized  -> .grant  (no second, redundant prompt)
   - .notDetermined                     -> ask iOS properly, then honour the
                                           user's actual answer
   - .denied / .restricted              -> .deny   (never silently granted)

 There is NO blanket grant: the OS remains the authority, and revoking Camera in
 Settings immediately makes Head Scan fall back to its "Open Settings" screen.

 Every other WKUIDelegate responsibility (JS alert/confirm/prompt, etc.) is
 forwarded to Capacitor's own delegate so nothing else changes.
 */
class BowlsBridgeViewController: CAPBridgeViewController, WKUIDelegate {

    private weak var capacitorUIDelegate: WKUIDelegate?

    /// Visible fallback so a failed load can never present a blank white screen.
    private var fallbackView: UIView?

    override func viewDidLoad() {
        super.viewDidLoad()
        // Keep Capacitor's delegate for forwarding, then take over ourselves.
        if let webView = self.webView {
            capacitorUIDelegate = webView.uiDelegate
            webView.uiDelegate = self
        }
        installFallbackView()
        // The web app is loaded over the network, so a flaky first request used
        // to leave a silent white screen. Check early and keep checking.
        scheduleLoadCheck(after: 6)
        scheduleLoadCheck(after: 12)
        scheduleLoadCheck(after: 25)
    }

    // MARK: - Blank-screen safety net

    private func installFallbackView() {
        let container = UIView(frame: view.bounds)
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.backgroundColor = UIColor(red: 0.059, green: 0.318, blue: 0.196, alpha: 1) // #0F5132
        container.isHidden = true

        let title = UILabel()
        title.text = "Bowls Trainer couldn't load"
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        title.textColor = .white
        title.textAlignment = .center
        title.numberOfLines = 0

        let body = UILabel()
        body.text = "Check your internet connection and try again. Your account and training history are safe."
        body.font = .systemFont(ofSize: 15)
        body.textColor = UIColor.white.withAlphaComponent(0.85)
        body.textAlignment = .center
        body.numberOfLines = 0

        let button = UIButton(type: .system)
        button.setTitle("Try again", for: .normal)
        button.setTitleColor(UIColor(red: 0.059, green: 0.318, blue: 0.196, alpha: 1), for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        button.backgroundColor = .white
        button.layer.cornerRadius = 12
        button.contentEdgeInsets = UIEdgeInsets(top: 12, left: 24, bottom: 12, right: 24)
        button.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, body, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -28),
        ])

        view.addSubview(container)
        fallbackView = container
    }

    private func scheduleLoadCheck(after seconds: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            self?.verifyContentRendered()
        }
    }

    /// Shows the fallback only when the WebView genuinely has nothing rendered.
    private func verifyContentRendered() {
        guard let webView = self.webView else { return }
        if webView.isLoading {
            NSLog("[BowlsTrainer] startup check: still loading \(webView.url?.absoluteString ?? "nil")")
            return
        }
        if webView.url == nil {
            NSLog("[BowlsTrainer] startup check: navigation produced no URL — showing fallback")
            showFallback()
            return
        }
        // Rendered text OR a mounted app root counts as "loaded": a branded
        // loading screen is legitimate content while a route resolves.
        let probe = """
        (function () {
          var text = document.body ? document.body.innerText.trim().length : 0;
          var nodes = document.body ? document.body.querySelectorAll('*').length : 0;
          return text > 0 || nodes > 8 ? 1 : 0;
        })()
        """
        webView.evaluateJavaScript(probe) { [weak self] result, error in
            let rendered = (result as? NSNumber)?.intValue ?? 0
            if let error = error {
                NSLog("[BowlsTrainer] startup probe failed: \(error.localizedDescription)")
            }
            if rendered == 0 {
                NSLog("[BowlsTrainer] startup check: blank document at \(webView.url?.absoluteString ?? "nil")")
                self?.showFallback()
            } else {
                self?.fallbackView?.isHidden = true
            }
        }
    }

    private func showFallback() {
        guard let fallbackView = fallbackView else { return }
        view.bringSubviewToFront(fallbackView)
        fallbackView.isHidden = false
    }

    @objc private func retryLoad() {
        fallbackView?.isHidden = true
        guard let webView = self.webView else { return }
        if let url = webView.url ?? bridge?.config.serverURL {
            webView.load(URLRequest(url: url))
        } else {
            webView.reload()
        }
        scheduleLoadCheck(after: 12)
    }

    // MARK: - Media capture

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {

        // Audio is not used by Head Scan.
        guard type == .camera else {
            decisionHandler(.deny)
            return
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            decisionHandler(.grant)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    decisionHandler(granted ? .grant : .deny)
                }
            }
        default:
            decisionHandler(.deny)
        }
    }

    // MARK: - Forwarded WKUIDelegate methods

    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        if let delegate = capacitorUIDelegate,
           delegate.responds(to: #selector(WKUIDelegate.webView(_:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))) {
            delegate.webView?(webView,
                              runJavaScriptAlertPanelWithMessage: message,
                              initiatedByFrame: frame,
                              completionHandler: completionHandler)
        } else {
            completionHandler()
        }
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        if let delegate = capacitorUIDelegate,
           delegate.responds(to: #selector(WKUIDelegate.webView(_:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))) {
            delegate.webView?(webView,
                              runJavaScriptConfirmPanelWithMessage: message,
                              initiatedByFrame: frame,
                              completionHandler: completionHandler)
        } else {
            completionHandler(false)
        }
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        if let delegate = capacitorUIDelegate,
           delegate.responds(to: #selector(WKUIDelegate.webView(_:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))) {
            delegate.webView?(webView,
                              runJavaScriptTextInputPanelWithPrompt: prompt,
                              defaultText: defaultText,
                              initiatedByFrame: frame,
                              completionHandler: completionHandler)
        } else {
            completionHandler(nil)
        }
    }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let delegate = capacitorUIDelegate,
           delegate.responds(to: #selector(WKUIDelegate.webView(_:createWebViewWith:for:windowFeatures:))) {
            return delegate.webView?(webView,
                                     createWebViewWith: configuration,
                                     for: navigationAction,
                                     windowFeatures: windowFeatures)
        }
        return nil
    }
}
