plugins {
    id("com.android.application")
}

val beeloHost = providers.gradleProperty("beeloHost").get()
val beeloApplicationId = providers.gradleProperty("beeloApplicationId").get()

android {
    namespace = "fr.beelot.app"
    compileSdk = 35

    // The Android Gradle plugin 9 turns generated resource values off by default; defaultConfig uses resValue.
    buildFeatures {
        resValues = true
    }

    defaultConfig {
        applicationId = beeloApplicationId
        // Android 8.0 (API 26) or later, as the README says.
        minSdk = 26
        targetSdk = 35
        // Release builds take both from the release tag (US-128); this is the debug build's.
        versionCode = providers.gradleProperty("beeloVersionCode").map(String::toInt).getOrElse(1)
        versionName = providers.gradleProperty("beeloVersionName").getOrElse("0.0.0-dev")
        manifestPlaceholders["hostName"] = beeloHost
        manifestPlaceholders["launchUrl"] = "https://$beeloHost/"
        // Links the app to the website for the browser and for passkeys; the site links back with its assetlinks.json.
        val statements = """[{"relation": ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"], "target": {"namespace": "web", "site": "https://$beeloHost"}}]"""
        resValue("string", "asset_statements", statements.replace("\"", "\\\""))
    }

    // The upload key (US-128) comes from the environment of the release job, never from the repository: with
    // BEELOT_UPLOAD_KEYSTORE set the release is signed with it, without it the release stays unsigned.
    val uploadKeystore = providers.environmentVariable("BEELOT_UPLOAD_KEYSTORE").orNull
    if (uploadKeystore != null) {
        signingConfigs {
            create("upload") {
                storeFile = file(uploadKeystore)
                storePassword = providers.environmentVariable("BEELOT_UPLOAD_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("BEELOT_UPLOAD_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("BEELOT_UPLOAD_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("upload")?.let { signingConfig = it }
        }
    }
}

dependencies {
    // One Kotlin standard library: androidbrowserhelper still asks for the split jdk7 and jdk8 ones at 1.6.21.
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:2.4.21"))
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
