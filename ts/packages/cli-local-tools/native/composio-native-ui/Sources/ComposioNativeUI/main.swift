import AppKit
import MetalKit
import QuartzCore

struct Configuration {
    var title = "Composio"
    var message = "Native UI sidecar scaffold"
    var detail = "This window is rendered by a Swift sidecar bundled with the CLI."
    var width: CGFloat = 560
    var height: CGFloat = 320
    var margin: CGFloat = 24
    var timeoutSeconds: TimeInterval?

    init(arguments: [String]) {
        var index = 0
        while index < arguments.count {
            let argument = arguments[index]
            let value = index + 1 < arguments.count ? arguments[index + 1] : nil

            switch argument {
            case "--title":
                if let value {
                    title = value
                    index += 1
                }
            case "--message":
                if let value {
                    message = value
                    index += 1
                }
            case "--detail":
                if let value {
                    detail = value
                    index += 1
                }
            case "--width":
                if let value, let parsed = Double(value) {
                    width = CGFloat(parsed)
                    index += 1
                }
            case "--height":
                if let value, let parsed = Double(value) {
                    height = CGFloat(parsed)
                    index += 1
                }
            case "--margin":
                if let value, let parsed = Double(value) {
                    margin = CGFloat(parsed)
                    index += 1
                }
            case "--timeout":
                if let value, let parsed = Double(value), parsed > 0 {
                    timeoutSeconds = parsed
                    index += 1
                }
            case "--help", "-h":
                print("""
                Usage: composio-native-ui [options]

                Options:
                  --title <text>     Window title. Default: Composio
                  --message <text>   Primary text. Default: Native UI sidecar scaffold
                  --detail <text>    Secondary text.
                  --width <points>   Window width. Default: 560
                  --height <points>  Window height. Default: 320
                  --margin <points>  Margin from visible screen edges. Default: 24
                  --timeout <secs>   Auto-close after the given number of seconds.
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

        // -- hash / value-noise / fbm --------------------------------
        float hash21(float2 p) {
            p = fract(p * float2(234.34, 435.345));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
        }

        float vnoise(float2 p) {
            float2 i = floor(p);
            float2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + float2(1.0, 0.0));
            float c = hash21(i + float2(0.0, 1.0));
            float d = hash21(i + float2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        // Rotated-octave FBM — kills the obvious axis-aligned grid.
        float fbm(float2 p) {
            const float2x2 rot = float2x2(0.80, 0.60, -0.60, 0.80);
            float v = 0.0;
            float a = 0.55;
            for (int i = 0; i < 6; ++i) {
                v += a * vnoise(p);
                p = rot * p * 2.05;
                a *= 0.5;
            }
            return v;
        }

        // IQ cosine palette — iridescent, smooth.
        float3 palette(float t, float3 a, float3 b, float3 c, float3 d) {
            return a + b * cos(6.28318 * (c * t + d));
        }

        // Per-channel soft-light blend (Photoshop formula).
        float softLight1(float s, float d) {
            return (s < 0.5)
                ? d - (1.0 - 2.0 * s) * d * (1.0 - d)
                : ((d < 0.25)
                    ? d + (2.0 * s - 1.0) * d * ((16.0 * d - 12.0) * d + 3.0)
                    : d + (2.0 * s - 1.0) * (sqrt(d) - d));
        }
        float3 softLight(float3 s, float3 d) {
            return float3(softLight1(s.x, d.x),
                          softLight1(s.y, d.y),
                          softLight1(s.z, d.z));
        }

        // Built using Shadertoy idioms: aspect-corrected coords,
        // domain-warped FBM ("warp the warp"), IQ palette, soft-light
        // blend over an ink base, vignette, dither, gamma.
        fragment float4 fragment_main(VertexOut in [[stage_in]], constant float &time [[buffer(0)]]) {
            // Aspect-corrected, centered coords. 560x320 ≈ 1.75 aspect.
            float2 uv = in.uv;
            float aspect = 1.75;
            float2 p = (uv - 0.5) * float2(aspect, 1.0);

            float t = time * 0.085;

            // -- Warp-the-warp: two layers of vector FBM, then a final field.
            float2 q = float2(
                fbm(p * 1.4 + float2(0.0, t * 1.3)),
                fbm(p * 1.4 + float2(5.2, -t * 1.1))
            );
            float2 r = float2(
                fbm(p * 1.9 + 3.4 * q + float2(1.7, 9.2) + t * 0.7),
                fbm(p * 1.9 + 3.4 * q + float2(8.3, 2.8) - t * 0.6)
            );
            float f = fbm(p * 2.4 + 4.0 * r);

            // Wisp highlights — narrow ridges where the field crests.
            float wisps = smoothstep(0.55, 0.92, f);
            wisps = wisps * wisps;

            // Two IQ palettes layered: a hot magenta/amber and a cool teal/indigo.
            float3 hot  = palette(0.15 + 0.65 * f + 0.12 * sin(t * 1.7),
                                  float3(0.55, 0.35, 0.45),
                                  float3(0.45, 0.32, 0.42),
                                  float3(1.00, 0.90, 0.85),
                                  float3(0.00, 0.18, 0.38));
            float3 cold = palette(0.25 + 0.50 * length(r) - 0.08 * cos(t * 1.1),
                                  float3(0.20, 0.32, 0.45),
                                  float3(0.18, 0.28, 0.40),
                                  float3(1.00, 1.00, 1.10),
                                  float3(0.55, 0.40, 0.20));

            float mixFactor = smoothstep(0.25, 0.85, f + 0.2 * r.x);
            float3 plasma = mix(cold, hot, mixFactor);

            // Wisp specular highlight — soft white-warm.
            plasma += wisps * float3(1.05, 0.86, 0.62) * 0.45;

            // -- Composition mask: push energy toward the right side
            //    so the left-aligned text stays readable.
            float2 c = uv - float2(0.62, 0.45);
            float radial = exp(-dot(c * float2(0.9, 1.25), c * float2(0.9, 1.25)) * 4.2);
            float leftFade = smoothstep(-0.35, 0.55, p.x);  // dim left edge
            float intensity = radial * (0.35 + 0.65 * leftFade);

            // Deep warm ink base — slightly violet so the cool wisps separate.
            float3 ink = float3(0.030, 0.032, 0.050);

            // Soft-light compose: plasma tints the ink instead of replacing it.
            float3 color = softLight(plasma * intensity, ink);
            color = mix(ink, color, 0.55 + 0.45 * intensity);

            // Additive wisp bloom on top — the "spark" highlights.
            color += wisps * intensity * float3(1.0, 0.78, 0.52) * 0.35;

            // Vignette (Shadertoy idiom, but aspect aware).
            float2 vv = uv * (1.0 - uv.yx);
            float vig = pow(clamp(vv.x * vv.y * 16.0, 0.0, 1.0), 0.32);
            color *= 0.55 + 0.50 * vig;

            // Dither + grain — kills banding, adds film-tooth.
            float n = hash21(in.position.xy + time * 60.0);
            color += (n - 0.5) * 0.022;

            // Gentle gamma — preserves blacks for UI readability.
            color = pow(max(color, 0.0), float3(0.94));

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

enum Palette {
    static let amber = NSColor(srgbRed: 0.95, green: 0.71, blue: 0.31, alpha: 1.0)
    static let amberDeep = NSColor(srgbRed: 0.78, green: 0.50, blue: 0.18, alpha: 1.0)
    static let inkDeep = NSColor(srgbRed: 0.04, green: 0.04, blue: 0.055, alpha: 1.0)
    static let textPrimary = NSColor.white
    static let textSecondary = NSColor.white.withAlphaComponent(0.62)
    static let textMuted = NSColor.white.withAlphaComponent(0.38)
    static let hairline = NSColor.white.withAlphaComponent(0.08)
}

// MARK: - Card chrome

@MainActor
final class CardView: NSView {
    private let topHairline = CALayer()
    private let innerStroke = CAShapeLayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.cornerRadius = 18
        layer?.cornerCurve = .continuous
        layer?.masksToBounds = true

        topHairline.backgroundColor = NSColor.white.withAlphaComponent(0.14).cgColor
        layer?.addSublayer(topHairline)

        innerStroke.fillColor = NSColor.clear.cgColor
        innerStroke.strokeColor = NSColor.white.withAlphaComponent(0.06).cgColor
        innerStroke.lineWidth = 1
        layer?.addSublayer(innerStroke)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        topHairline.frame = NSRect(x: 0, y: bounds.height - 1, width: bounds.width, height: 1)
        innerStroke.frame = bounds
        innerStroke.path = CGPath(
            roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
            cornerWidth: 17.5, cornerHeight: 17.5, transform: nil
        )
    }
}

@MainActor
final class PulsingDot: NSView {
    private let core = CALayer()
    private let halo = CALayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true

        halo.backgroundColor = Palette.amber.withAlphaComponent(0.35).cgColor
        halo.cornerRadius = 6
        layer?.addSublayer(halo)

        core.backgroundColor = Palette.amber.cgColor
        core.cornerRadius = 3
        core.shadowColor = Palette.amber.cgColor
        core.shadowOpacity = 0.9
        core.shadowRadius = 4
        core.shadowOffset = .zero
        layer?.addSublayer(core)
    }

    required init?(coder: NSCoder) { fatalError() }

    override var intrinsicContentSize: NSSize { NSSize(width: 12, height: 12) }

    override func layout() {
        super.layout()
        let cx = bounds.midX, cy = bounds.midY
        core.frame = NSRect(x: cx - 3, y: cy - 3, width: 6, height: 6)
        halo.frame = NSRect(x: cx - 6, y: cy - 6, width: 12, height: 12)
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard window != nil else { return }
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 0.50
        pulse.toValue = 0.10
        pulse.duration = 1.6
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        halo.add(pulse, forKey: "pulse")
    }
}

@MainActor
final class AccentButton: NSButton {
    private let action_: () -> Void
    private let fill = CALayer()
    private let topGloss = CAGradientLayer()
    private let glow = CALayer()
    private var isHovering = false
    private var isPressed = false

    init(title: String, action: @escaping () -> Void) {
        self.action_ = action
        super.init(frame: .zero)
        self.title = ""
        isBordered = false
        wantsLayer = true
        layer?.masksToBounds = false
        focusRingType = .none

        glow.backgroundColor = Palette.amber.withAlphaComponent(0.0).cgColor
        glow.shadowColor = Palette.amber.cgColor
        glow.shadowOpacity = 0.0
        glow.shadowRadius = 18
        glow.shadowOffset = .zero
        layer?.addSublayer(glow)

        fill.backgroundColor = Palette.amber.cgColor
        fill.cornerRadius = 11
        fill.cornerCurve = .continuous
        layer?.addSublayer(fill)

        topGloss.colors = [
            NSColor.white.withAlphaComponent(0.28).cgColor,
            NSColor.white.withAlphaComponent(0.0).cgColor,
        ]
        topGloss.startPoint = CGPoint(x: 0.5, y: 1.0)
        topGloss.endPoint = CGPoint(x: 0.5, y: 0.0)
        topGloss.cornerRadius = 11
        topGloss.cornerCurve = .continuous
        layer?.addSublayer(topGloss)

        let arrow = "\u{2197}"
        let attr = NSMutableAttributedString(string: title + "  " + arrow, attributes: [
            .font: NSFont.systemFont(ofSize: 12.5, weight: .semibold),
            .foregroundColor: NSColor(srgbRed: 0.10, green: 0.07, blue: 0.04, alpha: 1.0),
            .kern: 0.4,
        ])
        attr.addAttribute(.font,
                          value: NSFont.systemFont(ofSize: 12.5, weight: .medium),
                          range: NSRange(location: title.count + 2, length: 1))
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
        return NSSize(width: base.width + 36, height: 34)
    }

    override func layout() {
        super.layout()
        fill.frame = bounds
        topGloss.frame = NSRect(x: 0, y: bounds.height * 0.5, width: bounds.width, height: bounds.height * 0.5)
        glow.frame = bounds
        glow.shadowPath = CGPath(roundedRect: bounds, cornerWidth: 11, cornerHeight: 11, transform: nil)
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
        glow.shadowOpacity = hover ? 0.55 : 0.0
        fill.backgroundColor = (hover
            ? NSColor(srgbRed: 0.98, green: 0.76, blue: 0.36, alpha: 1.0)
            : Palette.amber).cgColor
        CATransaction.commit()
    }

    @objc private func invoke() { action_() }
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
        createWindow()

        if let timeoutSeconds = configuration.timeoutSeconds {
            Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { _ in
                Task { @MainActor in
                    NSApp.terminate(nil)
                }
            }
        }
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.terminate(nil)
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

        let background = MetalBackgroundView(frame: .zero)
        background.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(background)

        // Small label.
        let kicker = NSTextField(labelWithString: "COMPOSIO WANTS TO RUN")
        let kickerAttr = NSMutableAttributedString(string: kicker.stringValue, attributes: [
            .font: NSFont.monospacedSystemFont(ofSize: 10.5, weight: .semibold),
            .foregroundColor: Palette.textSecondary,
            .kern: 3.0,
        ])
        kicker.attributedStringValue = kickerAttr
        kicker.alignment = .center
        kicker.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(kicker)

        // Big headline.
        let headline = NSTextField(labelWithString: "Read Email")
        let headlineAttr = NSMutableAttributedString(string: "Read Email", attributes: [
            .font: NSFont.systemFont(ofSize: 38, weight: .semibold),
            .foregroundColor: Palette.textPrimary,
            .kern: -0.6,
        ])
        headline.attributedStringValue = headlineAttr
        headline.alignment = .center
        headline.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(headline)

        let button = AccentButton(title: "Continue") {
            fputs("button:continue\n", stdout)
            fflush(stdout)
            NSApp.terminate(nil)
        }
        button.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(button)

        NSLayoutConstraint.activate([
            background.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            background.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            background.topAnchor.constraint(equalTo: root.topAnchor),
            background.bottomAnchor.constraint(equalTo: root.bottomAnchor),

            kicker.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            headline.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            button.centerXAnchor.constraint(equalTo: root.centerXAnchor),

            headline.centerYAnchor.constraint(equalTo: root.centerYAnchor, constant: -10),
            kicker.bottomAnchor.constraint(equalTo: headline.topAnchor, constant: -14),
            button.topAnchor.constraint(equalTo: headline.bottomAnchor, constant: 26),
        ])

        return root
    }
}

let configuration = Configuration(arguments: Array(CommandLine.arguments.dropFirst()))
let application = NSApplication.shared
let delegate = AppDelegate(configuration: configuration)
application.delegate = delegate
application.run()
