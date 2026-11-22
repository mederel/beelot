import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { language, loadLanguage } from "$lib/i18n/i18n.svelte";

// The dictionary of the language comes first, so the first frame is already translated.
await loadLanguage(language()).catch(() => {});
mount(App, { target: document.getElementById("app")! });
