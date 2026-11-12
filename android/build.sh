#!/usr/bin/env bash
# Builds the Android app (US-127): ./android/build.sh [gradle task, default assembleDebug].
# Needs Java 17, Gradle and the Android SDK (ANDROID_HOME). Gradle only generates the wrapper, which then pins the
# Gradle version of the build. Options: -PbeeloHost=example.org -PbeeloApplicationId=org.example.app
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
if [ ! -x "$here/gradlew" ]; then
  gradle --no-daemon -p "$here" wrapper --gradle-version 8.14.3
fi
exec "$here/gradlew" --no-daemon -p "$here" "${@:-assembleDebug}"
