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

        float hash21(float2 p) {
            p = fract(p * float2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(float2 p) {
            float2 i = floor(p);
            float2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + float2(1.0, 0.0));
            float c = hash21(i + float2(0.0, 1.0));
            float d = hash21(i + float2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        fragment float4 fragment_main(VertexOut in [[stage_in]], constant float &time [[buffer(0)]]) {
            float2 uv = in.uv;
            float2 centered = uv - 0.5;

            // Make the liquid field broad instead of squashed/ripple-dense.
            float2 p = centered;
            p.x *= 1.10;
            p.y *= 0.74;

            float t = time * 0.38;
            float pulse = 0.5 + 0.5 * sin(time * 0.82);

            // Slow domain warp: this gives the water/glass impression without
            // turning into obvious tight rings.
            float2 warp = p;
            warp += 0.080 * float2(
                sin(p.y * 4.2 + t * 1.7),
                cos(p.x * 3.8 - t * 1.4)
            );
            warp += 0.050 * float2(
                noise(p * 2.0 + t) - 0.5,
                noise(p * 2.0 - t + 4.0) - 0.5
            );

            float sheet = sin((warp.x + warp.y * 0.42) * 8.0 + time * 0.95);
            sheet += 0.55 * sin((warp.x * -0.55 + warp.y) * 6.2 - time * 0.72);
            float caustic = smoothstep(0.70, 1.32, sheet);
            caustic = pow(caustic, 1.8);

            // Extremely soft oval mask. Alpha reaches zero only outside the
            // visible area, so there should be no readable border or bar.
            float r = length(float2(centered.x * 0.78, centered.y * 1.12));
            float edge = smoothstep(1.02, 0.20, r);
            float edgeFeather = smoothstep(0.0, 0.24, uv.x) * smoothstep(1.0, 0.76, uv.x)
                              * smoothstep(0.0, 0.22, uv.y) * smoothstep(1.0, 0.78, uv.y);

            float alpha = edge * edgeFeather * (0.22 + 0.10 * pulse + 0.13 * caustic);

            float3 cyan = float3(0.16, 0.78, 1.0);
            float3 violet = float3(0.55, 0.25, 1.0);
            float3 warm = float3(1.0, 0.42, 0.72);
            float colorMix = 0.5 + 0.5 * sin(warp.x * 3.2 + warp.y * 2.0 + time * 0.32);
            float3 color = mix(violet, cyan, colorMix);
            color = mix(color, warm, 0.18 + 0.18 * pulse);
            color += caustic * float3(0.30, 0.42, 0.55);

            return float4(color * alpha, alpha);
        }
        """

        do {
            let library = try device.makeLibrary(source: source, options: nil)
            let descriptor = MTLRenderPipelineDescriptor()
            descriptor.vertexFunction = library.makeFunction(name: "vertex_main")
            descriptor.fragmentFunction = library.makeFunction(name: "fragment_main")
            descriptor.colorAttachments[0].pixelFormat = pixelFormat
            descriptor.colorAttachments[0].isBlendingEnabled = true
            descriptor.colorAttachments[0].sourceRGBBlendFactor = .one
            descriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
            descriptor.colorAttachments[0].sourceAlphaBlendFactor = .one
            descriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
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
final class SoftGlassView: NSVisualEffectView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        blendingMode = .behindWindow
        material = .hudWindow
        state = .active
        wantsLayer = true
        layer?.opacity = 0.58
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layout() {
        super.layout()

        let mask = CAGradientLayer()
        mask.type = .radial
        mask.frame = bounds
        mask.startPoint = CGPoint(x: 0.5, y: 0.5)
        mask.endPoint = CGPoint(x: 1.0, y: 1.0)
        mask.colors = [
            NSColor.white.withAlphaComponent(0.86).cgColor,
            NSColor.white.withAlphaComponent(0.56).cgColor,
            NSColor.white.withAlphaComponent(0.0).cgColor,
        ]
        mask.locations = [0.0, 0.48, 1.0]
        layer?.mask = mask
    }
}

@MainActor
final class MetalBackgroundView: MTKView {
    private var shaderRenderer: ShaderRenderer?

    init(frame: CGRect) {
        let device = MTLCreateSystemDefaultDevice()
        super.init(frame: frame, device: device)

        wantsLayer = true
        layer?.isOpaque = false
        colorPixelFormat = .bgra8Unorm
        framebufferOnly = false
        isPaused = false
        enableSetNeedsDisplay = false
        preferredFramesPerSecond = 60
        clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)

        if let device, let renderer = ShaderRenderer(device: device, pixelFormat: colorPixelFormat) {
            shaderRenderer = renderer
            delegate = renderer
        }
    }

    required init(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

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
        panel.ignoresMouseEvents = true
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

        let glass = SoftGlassView(frame: root.bounds)
        glass.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(glass)

        let background = MetalBackgroundView(frame: root.bounds)
        background.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(background)

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false

        let badge = NSTextField(labelWithString: "COMPOSIO")
        badge.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .semibold)
        badge.textColor = NSColor.white.withAlphaComponent(0.72)
        badge.alignment = .center

        let title = NSTextField(labelWithString: configuration.message)
        title.font = NSFont.systemFont(ofSize: 19, weight: .semibold)
        title.textColor = NSColor.white
        title.alignment = .center
        title.lineBreakMode = .byWordWrapping
        title.maximumNumberOfLines = 2

        let detail = NSTextField(labelWithString: configuration.detail)
        detail.font = NSFont.systemFont(ofSize: 13, weight: .regular)
        detail.textColor = NSColor.white.withAlphaComponent(0.76)
        detail.alignment = .center
        detail.lineBreakMode = .byWordWrapping
        detail.maximumNumberOfLines = 3

        stack.addArrangedSubview(badge)
        stack.addArrangedSubview(title)
        stack.addArrangedSubview(detail)
        root.addSubview(stack)

        NSLayoutConstraint.activate([
            glass.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            glass.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            glass.topAnchor.constraint(equalTo: root.topAnchor),
            glass.bottomAnchor.constraint(equalTo: root.bottomAnchor),

            background.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            background.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            background.topAnchor.constraint(equalTo: root.topAnchor),
            background.bottomAnchor.constraint(equalTo: root.bottomAnchor),

            stack.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 430),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: root.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: root.trailingAnchor, constant: -32),
        ])

        return root
    }
}

let configuration = Configuration(arguments: Array(CommandLine.arguments.dropFirst()))
let application = NSApplication.shared
let delegate = AppDelegate(configuration: configuration)
application.delegate = delegate
application.run()
