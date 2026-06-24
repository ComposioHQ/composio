// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ComposioNativeUI",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "composio-native-ui", targets: ["ComposioNativeUI"])
    ],
    targets: [
        .executableTarget(
            name: "ComposioNativeUI",
            path: "Sources/ComposioNativeUI"
        )
    ]
)
