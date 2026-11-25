// Prints browserstack.yml for the SDK: node real-devices/configure.mjs "<build name>" > crates/beelot-server/web/browserstack.yml
import { browserstackConfig } from "./lib.mjs";

process.stdout.write(browserstackConfig({ build: process.argv[2] ?? "local" }));
