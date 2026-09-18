// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        // 8.5.0, não 8.5.1: downgrade deliberado do commit 087b852. `npx cap
        // sync ios` RODADO NO WINDOWS reescreve este arquivo sozinho toda vez
        // — e sempre volta para 8.5.1 (lê do @capacitor/ios instalado) e troca
        // os separadores de caminho abaixo por `\`, que quebram o build no
        // Mac. Corrigido à mão; qualquer novo sync feito nesta máquina exige
        // reaplicar as duas correções antes de comitar.
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"),
        // Caminhos com `/`, não `\`: o Swift Package Manager roda no Xcode, no
        // Mac, onde `\` não separa diretório — é caractere literal.
        .package(name: "AparajitaCapacitorSecureStorage", path: "../../../node_modules/@aparajita/capacitor-secure-storage"),
        .package(name: "CapacitorPreferences", path: "../../../node_modules/@capacitor/preferences"),
        .package(name: "CapgoCapacitorNativeBiometric", path: "../../../node_modules/@capgo/capacitor-native-biometric"),
        .package(name: "CapgoCapacitorSocialLogin", path: "../../../node_modules/@capgo/capacitor-social-login"),
        .package(name: "OnesignalCapacitorPlugin", path: "../../../node_modules/@onesignal/capacitor-plugin")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "AparajitaCapacitorSecureStorage", package: "AparajitaCapacitorSecureStorage"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapgoCapacitorNativeBiometric", package: "CapgoCapacitorNativeBiometric"),
                .product(name: "CapgoCapacitorSocialLogin", package: "CapgoCapacitorSocialLogin"),
                .product(name: "OnesignalCapacitorPlugin", package: "OnesignalCapacitorPlugin")
            ]
        )
    ]
)
