import AppKit
import MetalKit
import QuartzCore

struct Configuration {
    // Content (programmatic):
    var tool: String = "GMAIL_GET_PROFILE"
    var account: String = "gmail_pall-seba"
    var callerAgent: String? = nil                 // claude | codex | openclaw | composio (omit → CLI mode)
    var callerName: String? = nil                  // overrides agent.displayName
    var title: String? = nil                       // overrides the auto-built title
    var subtitle: String? = nil                    // overrides the auto-built subtitle
    var denyLabel: String = "Deny"
    var allowSessionLabel: String = "Allow for 1 hr"
    var allowOnceLabel: String = "Allow once"

    // Window:
    var width: CGFloat = 460
    var height: CGFloat = 200
    var margin: CGFloat = 24
    var timeoutSeconds: TimeInterval?

    // Result channel: if set, the decision JSON is written to this file path.
    // Otherwise it is written to stdout. Either way the process exits 0 for a
    // button press, 1 for dismissed / timeout / window-close.
    var callbackFile: String?

    var resolvedAgent: Agent? { callerAgent.map(Agents.resolve) }
    var resolvedCallerName: String { callerName ?? resolvedAgent?.displayName ?? "The composio cli" }

    // Sentinel used when no custom --title is supplied; makeContentView
    // builds an attributed string with an inline agent logo at this point.
    var resolvedTitle: String {
        title ?? ""
    }

    var resolvedSubtitle: String {
        if let subtitle, !subtitle.isEmpty { return subtitle }
        return "Approve once, for 1 hour, or deny."
    }

    init(arguments: [String]) {
        var index = 0
        while index < arguments.count {
            let argument = arguments[index]
            let value = index + 1 < arguments.count ? arguments[index + 1] : nil

            switch argument {
            case "--tool":
                if let value { tool = value; index += 1 }
            case "--account":
                if let value { account = value; index += 1 }
            case "--caller-agent", "--agent":
                if let value { callerAgent = value; index += 1 }
            case "--caller-name":
                if let value { callerName = value; index += 1 }
            case "--title", "--message":
                if let value { title = value; index += 1 }
            case "--subtitle", "--detail":
                if let value { subtitle = value; index += 1 }
            case "--deny-label":
                if let value { denyLabel = value; index += 1 }
            case "--allow-session-label":
                if let value { allowSessionLabel = value; index += 1 }
            case "--allow-once-label":
                if let value { allowOnceLabel = value; index += 1 }
            case "--callback-file":
                if let value { callbackFile = value; index += 1 }
            case "--width":
                if let value, let parsed = Double(value) { width = CGFloat(parsed); index += 1 }
            case "--height":
                if let value, let parsed = Double(value) { height = CGFloat(parsed); index += 1 }
            case "--margin":
                if let value, let parsed = Double(value) { margin = CGFloat(parsed); index += 1 }
            case "--timeout":
                if let value, let parsed = Double(value), parsed > 0 {
                    timeoutSeconds = parsed
                    index += 1
                }
            case "--help", "-h":
                print("""
                Usage: composio-native-ui [options]

                Content:
                  --tool <slug>             Tool slug shown in the title. Default: GMAIL_GET_PROFILE
                  --account <name>          Account identifier. Default: gmail_pall-seba
                  --caller-agent <id>       Agent calling the tool. claude | codex | openclaw | composio (default).
                  --caller-name <text>      Override the agent display name shown in the title.
                  --title <text>            Override the auto-built title entirely.
                  --message <text>          Alias for --title, used by CLI dev previews.
                  --subtitle <text>         Subtitle / description line.
                  --deny-label <text>       Override the "Deny" button label.
                  --allow-session-label <text>
                  --allow-once-label <text> Override the action button labels.

                Window:
                  --width <points>          Window width. Default: 460
                  --height <points>         Window height. Default: 200
                  --margin <points>         Margin from visible screen edges. Default: 24
                  --timeout <secs>          Auto-close after the given number of seconds.

                Result:
                  --callback-file <path>    Write the decision JSON to this file. If omitted, JSON is printed to stdout.

                Emits a single JSON line:
                  {"decision":"allow_once|allow_session|deny|dismissed","tool":"...","account":"..."}

                Exit code: 0 on button press, 1 on dismissed/timeout/window-close.
                """)
                Foundation.exit(0)
            default:
                break
            }

            index += 1
        }
    }
}

// MARK: - Shader

final class ShaderRenderer: NSObject, MTKViewDelegate {
    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState
    private let startTime = CACurrentMediaTime()

    init?(device: MTLDevice, pixelFormat: MTLPixelFormat) {
        guard let commandQueue = device.makeCommandQueue() else { return nil }
        self.commandQueue = commandQueue

        let source = """
        #include <metal_stdlib>
        using namespace metal;

        struct VertexOut {
            float4 position [[position]];
            float2 uv;
        };

        vertex VertexOut vertex_main(uint vertexID [[vertex_id]]) {
            float2 positions[3] = {
                float2(-1.0, -1.0),
                float2( 3.0, -1.0),
                float2(-1.0,  3.0)
            };
            VertexOut out;
            out.position = float4(positions[vertexID], 0.0, 1.0);
            out.uv = positions[vertexID] * 0.5 + 0.5;
            return out;
        }

        // Ordered 8x8 Bayer matrix, normalised to [0,1).
        float bayer8(int2 p) {
            const int M[64] = {
                 0, 32,  8, 40,  2, 34, 10, 42,
                48, 16, 56, 24, 50, 18, 58, 26,
                12, 44,  4, 36, 14, 46,  6, 38,
                60, 28, 52, 20, 62, 30, 54, 22,
                 3, 35, 11, 43,  1, 33,  9, 41,
                51, 19, 59, 27, 49, 17, 57, 25,
                15, 47,  7, 39, 13, 45,  5, 37,
                63, 31, 55, 23, 61, 29, 53, 21
            };
            int x = ((p.x % 8) + 8) % 8;
            int y = ((p.y % 8) + 8) % 8;
            return float(M[y * 8 + x]) / 64.0;
        }

        // Matches the dashboard's <Dither + SineWave> composition:
        //   colorB="#c2c2c2"  pattern="bayer8"  pixelSize=2
        //   spread=0.8  threshold=0.59
        //   SineWave amplitude=0.1 angle=162 frequency=0.5 softness=1 speed=-0.4
        fragment float4 fragment_main(VertexOut in [[stage_in]], constant float &time [[buffer(0)]]) {
            const float PI = 3.14159265;
            float2 uv = in.uv;

            // SineWave field across the canvas. Angle 162° from horizontal.
            float ang = 162.0 * PI / 180.0;
            float2 dir = float2(cos(ang), sin(ang));
            float frequency = 0.5;
            float amplitude = 0.10;
            float softness  = 1.0;
            float speed     = -0.4;

            float coord = dot(uv - 0.5, dir) * frequency * 6.28318 + time * speed * 3.0;
            float wave  = 0.5 + 0.5 * sin(coord);          // 0..1
            // softness=1 → broad, gentle band; softness<1 would sharpen.
            wave = pow(wave, 1.0 / max(softness, 0.001));
            // amplitude=0.1 modulates a small swing around 0.5.
            float sineValue = 0.5 + (wave - 0.5) * (amplitude * 4.0);

            // Bayer-ordered dither at pixelSize=2.
            int2 pix = int2(floor(in.position.xy * 0.5));
            float b = bayer8(pix);
            float spread    = 0.80;
            float threshold = 0.59;

            // Standard ordered-dither comparison.
            float mask = step(threshold, sineValue + (b - 0.5) * spread);

            float3 white = float3(1.0, 1.0, 1.0);
            float3 grey  = float3(0.7607, 0.7607, 0.7607); // #c2c2c2

            float3 color = mix(grey, white, mask);
            return float4(color, 1.0);
        }
        """

        do {
            let library = try device.makeLibrary(source: source, options: nil)
            let descriptor = MTLRenderPipelineDescriptor()
            descriptor.vertexFunction = library.makeFunction(name: "vertex_main")
            descriptor.fragmentFunction = library.makeFunction(name: "fragment_main")
            descriptor.colorAttachments[0].pixelFormat = pixelFormat
            descriptor.colorAttachments[0].isBlendingEnabled = false
            self.pipelineState = try device.makeRenderPipelineState(descriptor: descriptor)
        } catch {
            fputs("Failed to compile Metal shader: \(error)\n", stderr)
            return nil
        }

        super.init()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard
            let descriptor = view.currentRenderPassDescriptor,
            let drawable = view.currentDrawable,
            let commandBuffer = commandQueue.makeCommandBuffer(),
            let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: descriptor)
        else { return }

        var elapsed = Float(CACurrentMediaTime() - startTime)
        encoder.setRenderPipelineState(pipelineState)
        encoder.setFragmentBytes(&elapsed, length: MemoryLayout<Float>.stride, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()
        commandBuffer.present(drawable)
        commandBuffer.commit()
    }
}

@MainActor
final class MetalBackgroundView: MTKView {
    private var shaderRenderer: ShaderRenderer?

    init(frame: CGRect) {
        let device = MTLCreateSystemDefaultDevice()
        super.init(frame: frame, device: device)

        wantsLayer = true
        layer?.isOpaque = true
        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        isPaused = false
        enableSetNeedsDisplay = false
        preferredFramesPerSecond = 60
        clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)

        if let device, let renderer = ShaderRenderer(device: device, pixelFormat: colorPixelFormat) {
            shaderRenderer = renderer
            delegate = renderer
        }
    }

    required init(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

// MARK: - Tokens

// SVG logos for each caller agent — embedded so the sidecar remains a
// single binary with no asset bundle. macOS NSImage decodes SVG directly.

struct Agent {
    let id: String
    let displayName: String
    let svg: String

    func makeImage() -> NSImage? {
        if svg.hasPrefix("data:image/png;base64,") {
            let encoded = String(svg.dropFirst("data:image/png;base64,".count))
            guard let data = Data(base64Encoded: encoded),
                  let image = NSImage(data: data) else { return nil }
            return image
        }

        guard let data = svg.data(using: .utf8),
              let image = NSImage(data: data) else { return nil }
        return image
    }
}

enum Agents {
    static let composioSVG = #"""
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_2367_5)">
    <path d="M91.7032 28.1801L35.3611 16.6572C31.6669 15.8988 28.1929 18.7367 28.1929 22.5043V49.1954V50.6144V77.3052C28.1929 81.0729 31.6669 83.9112 35.3611 83.1526L91.7032 71.6296" stroke="black" stroke-width="2.8556" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M48.1992 7.38531C48.1993 2.09223 53.6097 -1.44765 58.4546 0.57874L58.6851 0.679333L58.6902 0.68227L88.8308 14.6023C91.4759 15.7947 93.1338 18.4366 93.1346 21.3053V33.0975C93.1346 37.3994 89.4707 40.797 85.1902 40.4658L51.0547 37.918V61.8914L85.185 59.3435L85.585 59.323C89.6842 59.2231 93.1331 62.5334 93.109 66.6876V78.4797C93.109 81.3707 91.4075 83.9737 88.8105 85.1812L88.806 85.1827L58.691 99.0774L58.6917 99.0782C53.7808 101.351 48.1992 97.7714 48.1992 92.3759V81.1383C47.9779 81.2256 47.741 81.2834 47.4921 81.3015L30.8347 82.5007C29.4429 82.6007 28.2584 81.4977 28.2582 80.1023V67.7354C28.2583 67.256 28.4014 66.8063 28.6474 66.4277L14.9439 67.4513H14.9388C10.6701 67.7539 7.00001 64.3671 7 60.0823V39.7271C7.00031 35.4239 10.6671 32.0248 14.9491 32.3589H14.9483L28.3486 33.3589C28.2905 33.152 28.2583 32.9345 28.2582 32.7099V19.6826C28.2582 17.7807 29.9597 16.3299 31.8377 16.6304L47.6992 19.168C47.8735 19.1959 48.0404 19.2435 48.1992 19.3059V7.38531ZM85.4075 62.191H85.4023L51.0547 64.755V79.6601L90.2541 71.4669V66.6774L90.2496 66.435C90.1323 63.9438 87.9489 61.9928 85.4075 62.191ZM27.7075 36.1748C27.9471 36.5495 28.0863 36.9936 28.0864 37.4678V62.7813C28.0864 63.0748 28.0314 63.3559 27.9344 63.6169L48.1992 62.1044V37.7043L27.7075 36.1748ZM51.0547 35.0544L85.4023 37.6183L85.4075 37.6191L85.6511 37.6316C88.1632 37.6928 90.279 35.6595 90.279 33.0975V28.1405L51.0547 19.9411V35.0544Z" fill="black"/>
    </g>
    <defs>
    <clipPath id="clip0_2367_5">
    <rect width="86.4662" height="100" fill="white" transform="translate(7)"/>
    </clipPath>
    </defs>
    </svg>
    """#

    static let claudeSVG = #"""
    <svg preserveAspectRatio="xMidYMid" viewBox="0 0 256 257" xmlns="http://www.w3.org/2000/svg"><path fill="#D97757" d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/></svg>
    """#

    // Codex icon from the dashboard asset, with the white app-tile background removed
    // so it renders cleanly on the native permission card.
    static let codexSVG = #"""
    <svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z" fill="url(#lobe-icons-codex-_R_0_)"></path><defs><linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-codex-_R_0_" x1="12" x2="12" y1="3" y2="21"><stop stop-color="#B1A7FF"></stop><stop offset=".5" stop-color="#7A9DFF"></stop><stop offset="1" stop-color="#3941FF"></stop></linearGradient></defs></svg>
    """#

    static let openclawSVG = #"""
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="openclaw__lobster-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff4d4d"/><stop offset="100%" stop-color="#991b1b"/></linearGradient></defs><path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#openclaw__lobster-gradient)"/><path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#openclaw__lobster-gradient)"/><path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#openclaw__lobster-gradient)"/><path d="M45 15 Q35 5 30 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/><path d="M75 15 Q85 5 90 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/><circle cx="45" cy="35" r="6" fill="#050810"/><circle cx="75" cy="35" r="6" fill="#050810"/><circle cx="46" cy="34" r="2.5" fill="#00e5cc"/><circle cx="76" cy="34" r="2.5" fill="#00e5cc"/></svg>
    """#

    static let composio = Agent(id: "composio", displayName: "Composio", svg: composioSVG)
    static let claude   = Agent(id: "claude",   displayName: "Claude",   svg: claudeSVG)
    static let codex    = Agent(id: "codex",    displayName: "Codex",    svg: codexSVG)
    static let openclaw = Agent(id: "openclaw", displayName: "OpenClaw", svg: openclawSVG)

    static func resolve(_ id: String) -> Agent {
        switch id.lowercased() {
        case "claude", "claude-code", "claudecode": return claude
        case "codex": return codex
        case "openclaw", "open-claw": return openclaw
        case "composio", "": return composio
        default: return composio
        }
    }
}

// Matches the dashboard's light theme (oklch tokens flattened to sRGB).
enum Palette {
    static let cardBg = NSColor.white.withAlphaComponent(0.86)   // bg-card/80
    static let border = NSColor(white: 0.0, alpha: 0.10)         // border-border
    static let divider = NSColor(white: 0.0, alpha: 0.08)
    static let textPrimary = NSColor(white: 0.07, alpha: 1.0)    // near-black
    static let textSecondary = NSColor(white: 0.40, alpha: 1.0)  // text-muted-foreground
    static let textMuted = NSColor(white: 0.55, alpha: 1.0)
    static let primary = NSColor(white: 0.09, alpha: 1.0)        // primary button
    static let primaryHover = NSColor(white: 0.18, alpha: 1.0)
    static let onPrimary = NSColor.white
}

// MARK: - Card chrome

// Light-theme card: rounded-2xl + border + subtle inner stroke, like
// `border-border bg-card/80 rounded-2xl shadow-* backdrop-blur-md`.
@MainActor
final class CardView: NSView {
    private let innerStroke = CAShapeLayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.cornerRadius = 16
        layer?.cornerCurve = .continuous
        layer?.masksToBounds = true

        innerStroke.fillColor = NSColor.clear.cgColor
        innerStroke.strokeColor = Palette.border.cgColor
        innerStroke.lineWidth = 1
        layer?.addSublayer(innerStroke)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        innerStroke.frame = bounds
        innerStroke.path = CGPath(
            roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
            cornerWidth: 15.5, cornerHeight: 15.5, transform: nil
        )
    }
}

enum AccentStyle {
    case primary    // dark filled, white text
    case secondary  // transparent w/ border, dark text
}

@MainActor
final class AccentButton: NSButton {
    private let action_: () -> Void
    private let style: AccentStyle
    private let fill = CALayer()
    private let stroke = CAShapeLayer()
    private let glow = CALayer()
    private var isHovering = false
    private var isPressed = false

    init(title: String, style: AccentStyle = .primary, action: @escaping () -> Void) {
        self.action_ = action
        self.style = style
        super.init(frame: .zero)
        self.title = ""
        isBordered = false
        wantsLayer = true
        layer?.masksToBounds = false
        focusRingType = .none

        glow.backgroundColor = NSColor.clear.cgColor
        glow.shadowColor = NSColor.black.cgColor
        glow.shadowOpacity = 0.0
        glow.shadowRadius = 12
        glow.shadowOffset = CGSize(width: 0, height: 2)
        layer?.addSublayer(glow)

        fill.cornerRadius = 8
        fill.cornerCurve = .continuous
        layer?.addSublayer(fill)

        stroke.fillColor = NSColor.clear.cgColor
        stroke.lineWidth = 1
        layer?.addSublayer(stroke)

        let textColor: NSColor
        switch style {
        case .primary:
            fill.backgroundColor = Palette.primary.cgColor
            stroke.strokeColor = NSColor.clear.cgColor
            textColor = Palette.onPrimary
        case .secondary:
            fill.backgroundColor = NSColor.white.withAlphaComponent(0.55).cgColor
            stroke.strokeColor = Palette.border.cgColor
            textColor = Palette.textPrimary
        }

        let attr = NSMutableAttributedString(string: title, attributes: [
            .font: NSFont.systemFont(ofSize: 12.5, weight: .medium),
            .foregroundColor: textColor,
            .kern: 0.1,
        ])
        attributedTitle = attr

        target = self
        self.action = #selector(invoke)

        let tracking = NSTrackingArea(rect: .zero,
                                      options: [.mouseEnteredAndExited, .inVisibleRect, .activeInActiveApp],
                                      owner: self, userInfo: nil)
        addTrackingArea(tracking)
    }

    required init?(coder: NSCoder) { fatalError() }

    override var intrinsicContentSize: NSSize {
        let base = super.intrinsicContentSize
        return NSSize(width: base.width + 22, height: 30)
    }

    override func layout() {
        super.layout()
        fill.frame = bounds
        glow.frame = bounds
        glow.shadowPath = CGPath(roundedRect: bounds, cornerWidth: 8, cornerHeight: 8, transform: nil)
        stroke.frame = bounds
        stroke.path = CGPath(
            roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
            cornerWidth: 7.5, cornerHeight: 7.5, transform: nil
        )
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    override func mouseEntered(with event: NSEvent) {
        isHovering = true
        setState(hover: true, pressed: isPressed)
    }

    override func mouseExited(with event: NSEvent) {
        isHovering = false
        setState(hover: false, pressed: false)
    }

    override func mouseDown(with event: NSEvent) {
        isPressed = true
        setState(hover: isHovering, pressed: true)
        super.mouseDown(with: event)
        isPressed = false
        setState(hover: isHovering, pressed: false)
    }

    private func setState(hover: Bool, pressed: Bool) {
        CATransaction.begin()
        CATransaction.setAnimationDuration(0.14)
        let scale: CGFloat = pressed ? 0.97 : 1.0
        layer?.transform = CATransform3DMakeScale(scale, scale, 1)
        switch style {
        case .primary:
            glow.shadowOpacity = hover ? 0.18 : 0.0
            fill.backgroundColor = (hover ? Palette.primaryHover : Palette.primary).cgColor
        case .secondary:
            glow.shadowOpacity = 0.0
            fill.backgroundColor = (hover
                ? NSColor.white.withAlphaComponent(0.85)
                : NSColor.white.withAlphaComponent(0.55)).cgColor
        }
        CATransaction.commit()
    }

    @objc private func invoke() { action_() }
}

// MARK: - Decision callback

enum Decision: String {
    case deny = "deny"
    case allowOnce = "allow_once"
    case allowSession = "allow_session"
    case dismissed = "dismissed"
}

@MainActor
final class DecisionSink {
    static let shared = DecisionSink()
    private var hasEmitted = false
    private var configuration: Configuration?

    func configure(_ config: Configuration) {
        self.configuration = config
    }

    func emitAndExit(_ decision: Decision) {
        guard !hasEmitted, let config = configuration else {
            Foundation.exit(decision == .dismissed ? 1 : 0)
        }
        hasEmitted = true

        let payload: [String: Any] = [
            "decision": decision.rawValue,
            "tool": config.tool,
            "account": config.account,
        ]
        let line: String
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
           let json = String(data: data, encoding: .utf8) {
            line = json + "\n"
        } else {
            line = "{\"decision\":\"\(decision.rawValue)\"}\n"
        }

        if let path = config.callbackFile {
            try? line.write(toFile: path, atomically: true, encoding: .utf8)
        } else {
            FileHandle.standardOutput.write(Data(line.utf8))
        }

        Foundation.exit(decision == .dismissed ? 1 : 0)
    }
}

// MARK: - App

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let configuration: Configuration
    private var window: NSWindow?

    init(configuration: Configuration) {
        self.configuration = configuration
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        DecisionSink.shared.configure(configuration)
        createWindow()

        if let timeoutSeconds = configuration.timeoutSeconds {
            Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { _ in
                Task { @MainActor in
                    DecisionSink.shared.emitAndExit(.dismissed)
                }
            }
        }
    }

    func windowWillClose(_ notification: Notification) {
        DecisionSink.shared.emitAndExit(.dismissed)
    }

    private func createWindow() {
        let frame = bottomRightFrame()

        let panel = NSPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = false
        panel.isMovableByWindowBackground = true
        panel.isFloatingPanel = true
        panel.animationBehavior = .none
        panel.level = .floating
        panel.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
        panel.delegate = self
        panel.contentView = makeContentView()
        panel.setFrame(frame, display: true, animate: false)
        panel.orderFrontRegardless()

        DispatchQueue.main.async { [weak panel] in
            panel?.setFrame(self.bottomRightFrame(), display: true, animate: false)
        }

        window = panel
    }

    private func bottomRightFrame() -> NSRect {
        let screen = screenForPlacement()
        let visibleFrame = screen.visibleFrame
        let size = NSSize(width: configuration.width, height: configuration.height)
        let origin = NSPoint(
            x: visibleFrame.maxX - size.width - configuration.margin,
            y: visibleFrame.minY + configuration.margin
        )
        return NSRect(origin: origin, size: size)
    }

    private func screenForPlacement() -> NSScreen {
        let mouseLocation = NSEvent.mouseLocation
        if let containingMouse = NSScreen.screens.first(where: { NSMouseInRect(mouseLocation, $0.frame, false) }) {
            return containingMouse
        }
        return NSScreen.main ?? NSScreen.screens.first ?? NSScreen()
    }

    private func makeContentView() -> NSView {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: configuration.width, height: configuration.height))
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.clear.cgColor
        root.layer?.masksToBounds = false

        // Soft drop shadow behind the card.
        let shadowHost = NSView()
        shadowHost.wantsLayer = true
        shadowHost.translatesAutoresizingMaskIntoConstraints = false
        if let l = shadowHost.layer {
            l.shadowColor = NSColor.black.cgColor
            l.shadowOpacity = 0.18
            l.shadowRadius = 30
            l.shadowOffset = CGSize(width: 0, height: -12)
            l.masksToBounds = false
        }
        root.addSubview(shadowHost)

        let card = CardView()
        card.translatesAutoresizingMaskIntoConstraints = false
        shadowHost.addSubview(card)

        // Dithered sine-wave shader — fills the card.
        let background = MetalBackgroundView(frame: .zero)
        background.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(background)

        // Translucent white wash so the dither reads more softly under text.
        let wash = NSView()
        wash.wantsLayer = true
        wash.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.55).cgColor
        wash.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(wash)

        // --- Bottom-left brand mark is always Composio.
        let logoView = NSImageView()
        logoView.image = Agents.composio.makeImage()
        logoView.imageScaling = .scaleProportionallyUpOrDown
        logoView.imageAlignment = .alignCenter
        logoView.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(logoView)

        // --- Title: "[agent-icon]  wants to use TOOL with ACCOUNT".
        // Agent logo is inlined into the attributed string via NSTextAttachment,
        // so it sits on the same baseline as the rest of the title.
        let toolSlug = configuration.tool
        let account = configuration.account
        let titleFont = NSFont.systemFont(ofSize: 15, weight: .semibold)
        let monoFont  = NSFont.monospacedSystemFont(ofSize: 13, weight: .semibold)
        let textAttrs: [NSAttributedString.Key: Any] = [
            .font: titleFont,
            .foregroundColor: Palette.textPrimary,
            .kern: -0.2,
        ]
        let monoAttrs: [NSAttributedString.Key: Any] = [
            .font: monoFont,
            .foregroundColor: Palette.textPrimary,
        ]

        let titleAttr = NSMutableAttributedString()
        if let customTitle = configuration.title, !customTitle.isEmpty {
            // Caller supplied a verbatim title — render as-is, still
            // monospacing the tool/account if they appear.
            titleAttr.append(NSAttributedString(string: customTitle, attributes: textAttrs))
            if let r = customTitle.range(of: toolSlug) {
                titleAttr.addAttribute(.font, value: monoFont,
                                       range: NSRange(r, in: customTitle))
            }
            if let r = customTitle.range(of: account) {
                titleAttr.addAttribute(.font, value: monoFont,
                                       range: NSRange(r, in: customTitle))
            }
        } else if let agent = configuration.resolvedAgent {
            // Inline agent logo as the subject of the sentence.
            if let agentImage = agent.makeImage() {
                let attachment = NSTextAttachment()
                attachment.image = agentImage
                attachment.bounds = CGRect(x: 0, y: -7, width: 28, height: 28)
                titleAttr.append(NSAttributedString(attachment: attachment))
                titleAttr.append(NSAttributedString(string: "  ", attributes: textAttrs))
            }
            titleAttr.append(NSAttributedString(string: "wants to use ", attributes: textAttrs))
            titleAttr.append(NSAttributedString(string: toolSlug, attributes: monoAttrs))
        } else {
            // No caller agent — plain CLI-mode sentence, no inline logo.
            titleAttr.append(NSAttributedString(string: "The composio cli wants to execute ", attributes: textAttrs))
            titleAttr.append(NSAttributedString(string: toolSlug, attributes: monoAttrs))
        }

        let title = NSTextField(labelWithAttributedString: titleAttr)
        title.lineBreakMode = .byTruncatingTail
        title.maximumNumberOfLines = 2
        title.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(title)

        // --- Account line: "Account: <account>"
        let accountAttr = NSMutableAttributedString()
        accountAttr.append(NSAttributedString(string: "Account: ", attributes: [
            .font: NSFont.systemFont(ofSize: 12, weight: .regular),
            .foregroundColor: Palette.textSecondary,
        ]))
        accountAttr.append(NSAttributedString(string: account, attributes: [
            .font: NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold),
            .foregroundColor: Palette.textPrimary,
        ]))
        let accountField = NSTextField(labelWithAttributedString: accountAttr)
        accountField.lineBreakMode = .byTruncatingTail
        accountField.maximumNumberOfLines = 1
        accountField.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(accountField)

        // --- Three actions matching the elicitation oneOf decisions.
        let denyButton = AccentButton(title: configuration.denyLabel, style: .secondary) {
            DecisionSink.shared.emitAndExit(.deny)
        }
        let allowSessionButton = AccentButton(title: configuration.allowSessionLabel, style: .secondary) {
            DecisionSink.shared.emitAndExit(.allowSession)
        }
        let allowOnceButton = AccentButton(title: configuration.allowOnceLabel, style: .primary) {
            DecisionSink.shared.emitAndExit(.allowOnce)
        }
        // Enter triggers the default action.
        allowOnceButton.keyEquivalent = "\r"

        let buttonRow = NSStackView(views: [denyButton, allowSessionButton, allowOnceButton])
        buttonRow.orientation = .horizontal
        buttonRow.alignment = .centerY
        buttonRow.spacing = 8
        buttonRow.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(buttonRow)

        let hPad: CGFloat = 22
        let headerTop: CGFloat = 20
        let bodyBottom: CGFloat = 18
        let logoSize: CGFloat = 32

        NSLayoutConstraint.activate([
            shadowHost.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            shadowHost.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            shadowHost.topAnchor.constraint(equalTo: root.topAnchor),
            shadowHost.bottomAnchor.constraint(equalTo: root.bottomAnchor),

            card.leadingAnchor.constraint(equalTo: shadowHost.leadingAnchor),
            card.trailingAnchor.constraint(equalTo: shadowHost.trailingAnchor),
            card.topAnchor.constraint(equalTo: shadowHost.topAnchor),
            card.bottomAnchor.constraint(equalTo: shadowHost.bottomAnchor),

            background.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            background.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            background.topAnchor.constraint(equalTo: card.topAnchor),
            background.bottomAnchor.constraint(equalTo: card.bottomAnchor),

            wash.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            wash.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            wash.topAnchor.constraint(equalTo: card.topAnchor),
            wash.bottomAnchor.constraint(equalTo: card.bottomAnchor),

            // Logo anchored to the bottom-left, aligned with button row baseline.
            logoView.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: hPad),
            logoView.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -bodyBottom - 4),
            logoView.widthAnchor.constraint(equalToConstant: logoSize),
            logoView.heightAnchor.constraint(equalToConstant: logoSize),

            title.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: hPad),
            title.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -hPad),
            title.topAnchor.constraint(equalTo: card.topAnchor, constant: headerTop),

            accountField.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            accountField.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -hPad),
            accountField.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 6),

            buttonRow.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -hPad),
            buttonRow.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -bodyBottom),
        ])

        return root
    }
}

let configuration = Configuration(arguments: Array(CommandLine.arguments.dropFirst()))
let application = NSApplication.shared
let delegate = AppDelegate(configuration: configuration)
application.delegate = delegate
application.run()
