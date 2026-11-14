#!/usr/bin/env bash
# Builds the Android app (US-127): ./android/build.sh [gradle task, default assembleDebug].
# Needs Java 17, Gradle and the Android SDK (ANDROID_HOME). The installed Gradle only generates the wrapper, in an
# empty directory because it would otherwise configure this project with its own, possibly newer, version; the
# wrapper then pins the Gradle version of the build. Options: -PbeeloHost=example.org -PbeeloApplicationId=org.example.app
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
if [ ! -x "$here/gradlew" ]; then
  scratch=$(mktemp -d)
  trap 'rm -rf "$scratch"' EXIT
  : > "$scratch/settings.gradle"
  gradle --no-daemon -p "$scratch" wrapper --gradle-version 9.9.1
  cp -r "$scratch/gradlew" "$scratch/gradlew.bat" "$scratch/gradle" "$here/"
fi
exec "$here/gradlew" --no-daemon -p "$here" "${@:-assembleDebug}"
