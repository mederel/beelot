///<reference types="svelte" />
;// Me (US-117): the account and its passkey (US-084), the display name (US-072), every setting of the device, the
// leaderboard visibility, and "Your data": download it or delete the account (US-081, US-082).

import { BarChart3, Download, LogOut, Trash2, Trophy, UserRound, Lock } from "@lucide/svelte";
import { slide } from "svelte/transition";
import { apiResponse } from "$lib/api/client";
import { sfx } from "$lib/audio/sfx";
import { vibrationSupported } from "$lib/fx/haptics";
import { LANGUAGES, language, setLanguage, t, type Language } from "$lib/i18n/i18n.svelte";
import { checkDisplayName } from "$lib/models/small";
import { ALL_THEMES, LOCKED_THEMES, THEME_NAMES } from "$lib/models/prefs";
import { account, loadAccount, saveDisplayName, setBoardVisible, signInRequest, signInWithPasskey, ceremonyFailure, signOut } from "$lib/stores/account.svelte";
import { navigate } from "$lib/stores/router.svelte";
import { setBotComments, setEffects, setMusic, setMusicVolume, setPace, setReactions, setSound, setTheme, setVibrationSetting, settings } from "$lib/stores/settings.svelte";
import Button from "$lib/ui/Button.svelte";
import Segmented from "$lib/ui/Segmented.svelte";
import Switch from "$lib/ui/Switch.svelte";
import CardBack from "$lib/cards/CardBack.svelte";
import SignInPanel from "./SignInPanel.svelte";
function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  let signInOpen = $state(signInRequest.open);
  let signUpWarning = $state(signInRequest.signUp);
  signInRequest.open = false;
  signInRequest.signUp = false;

  let displayName = $state(account.name ?? "");
  let nameStatus = $state("");
  let exportMessage = $state("");
  let deleting = $state(false);
  let deleteWord = $state("");
  let deleteMessage = $state("");
  let deleteBusy = $state(false);

  $effect(() => {
    if (account.name) displayName = account.name;
  });

  const languageNames: Record<Language, string> = { en: "English", fr: "Français", nl: "Nederlands" };

  async function saveName(event: SubmitEvent) {
    event.preventDefault();
    const checked = checkDisplayName(displayName);
    if (!checked.ok) {
      nameStatus = t(checked.message);
      return;
    }
    try {
      await saveDisplayName(checked.name);
      nameStatus = t("Name saved.");
    } catch (error) {
      nameStatus = (error as Error).message;
    }
  }

  function attachmentName(response: Response): string {
    const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
    return match ? match[1] : "beelot-data.json";
  }

  async function exportData(event: MouseEvent) {
    event.preventDefault();
    exportMessage = "";
    try {
      const response = await apiResponse("/api/account/export");
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        exportMessage = t("You can download your data again in {0} minutes.", body.minutesLeft ?? 60);
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachmentName(response);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      exportMessage = t("Something went wrong. Please try again.");
    }
  }

  async function deleteAccount() {
    deleteMessage = "";
    deleteBusy = true;
    try {
      const response = await apiResponse("/api/account", { method: "DELETE" });
      if (response.status === 204) {
        deleting = false;
        navigate("/");
        await loadAccount();
        account.notice = t("Your account has been deleted.");
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (response.status === 403 && body.reason === "reauthenticate") {
        deleteMessage = t("For your safety, sign in again to delete your account.");
        try {
          await signInWithPasskey();
        } catch (error) {
          deleteMessage = t(ceremonyFailure(error));
          return;
        }
        await loadAccount();
        deleteWord = "";
        return;
      }
      throw new Error(String(response.status));
    } catch {
      deleteMessage = t("Something went wrong. Please try again.");
    } finally {
      deleteBusy = false;
    }
  }

  const themeOptions = $derived(
    ALL_THEMES.map((theme) => {
      const locked = Object.hasOwn(LOCKED_THEMES, theme) && !settings.unlocked.includes(theme);
      return { value: theme, label: t(THEME_NAMES[theme]), disabled: locked, hint: locked ? t("Locked: {0}", t(LOCKED_THEMES[theme].hint)) : undefined };
    })
  );
;
async () => {

 { svelteHTML.createElement("div", { "class":`page settings`,});
   { svelteHTML.createElement("header", { "class":`head`,});
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Preferences"); }
     { svelteHTML.createElement("h1", { "class":`page-title`,});t("Settings"); }
   }

  if(account.notice){ { svelteHTML.createElement("p", {   "class":`notice`,"role":`status`,});account.notice; }}

  if(account.loaded){
     { svelteHTML.createElement("section", { "class":`card glass account`,});
      if(account.signedIn){
         { svelteHTML.createElement("div", { "class":`who`,});
           { svelteHTML.createElement("span", { "class":`avatar`,}); { const $$_dnuoRresU4C = __sveltets_2_ensureComponent(UserRound); new $$_dnuoRresU4C({ target: __sveltets_2_any(), props: {    "size":24,"aria-hidden":`true`,}});} }
           { svelteHTML.createElement("div", {}); { svelteHTML.createElement("strong", {});t("Signed in as {0}", account.name ?? ""); } }
         }
         { svelteHTML.createElement("form", {   "class":`name-form`,"onsubmit":saveName,});
           { svelteHTML.createElement("label", {});
             { svelteHTML.createElement("span", { "class":`label`,});t("Display name"); }
             { svelteHTML.createElement("small", { "class":`hint`,});t("The name other players see at tables, in your history and on the leaderboard."); }
             { svelteHTML.createElement("span", { "class":`name-row`,});
               { svelteHTML.createElement("input", {        "class":`field`,"maxlength":60,"autocomplete":`nickname`,"bind:value":displayName,});/*Ωignore_startΩ*/() => displayName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
               { const $$_nottuB5C = __sveltets_2_ensureComponent(Button); new $$_nottuB5C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"type":`submit`,"variant":`secondary`,}});t("Save name"); Button}
             }
           }
           { svelteHTML.createElement("p", {   "class":`hint`,"role":`status`,});nameStatus; }
         }
         { svelteHTML.createElement("div", { "class":`links`,});
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"size":`sm`,"href":`/stats`,}}); { const $$_3trahCraB4C = __sveltets_2_ensureComponent(BarChart3); new $$_3trahCraB4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("My statistics"); Button}
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"size":`sm`,"href":`/leaderboard`,}}); { const $$_yhporT4C = __sveltets_2_ensureComponent(Trophy); new $$_yhporT4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Leaderboard"); Button}
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`ghost`,"size":`sm`,"onclick":signOut,}}); { const $$_tuOgoL4C = __sveltets_2_ensureComponent(LogOut); new $$_tuOgoL4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Sign out"); Button}
         }
      }else{
         { svelteHTML.createElement("div", { "class":`who`,});
           { svelteHTML.createElement("span", { "class":`avatar guest`,}); { const $$_dnuoRresU4C = __sveltets_2_ensureComponent(UserRound); new $$_dnuoRresU4C({ target: __sveltets_2_any(), props: {    "size":24,"aria-hidden":`true`,}});} }
           { svelteHTML.createElement("div", {});
             { svelteHTML.createElement("strong", {});t("Sign in to keep track of your matches."); }
           }
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {         children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"size":`sm`,"onclick":() => (signInOpen = !signInOpen),"aria-expanded":signInOpen,"aria-controls":`sign-in-panel`,}});t("Sign in"); Button}
         }
        if(signInOpen){
           { svelteHTML.createElement("div", {   "id":`sign-in-panel`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 220 }))); { const $$_lenaPnIngiS3C = __sveltets_2_ensureComponent(SignInPanel); const $$_lenaPnIngiS3 = new $$_lenaPnIngiS3C({ target: __sveltets_2_any(), props: {     warning:signUpWarning,"ondone":() => (signInOpen = false),}});/*Ωignore_startΩ*/() => signUpWarning = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_lenaPnIngiS3.$$bindings = 'warning';} }
        }
      }
     }
  }

   { svelteHTML.createElement("section", { "class":`card glass`,});
     { svelteHTML.createElement("h2", {});t("Look and feel"); }
     { const $$_detnemgeS2C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS2C({ target: __sveltets_2_any(), props: {          "name":`language`,"label":t("Language"),"value":language(),"onchange":(value) => setLanguage(value as Language),"options":LANGUAGES.map((lang) => ({ value: lang, label: languageNames[lang] })),}});}
     { svelteHTML.createElement("div", { "class":`themes`,});
       { svelteHTML.createElement("span", {   "class":`label`,"id":`theme-label`,});t("Table theme"); }
       { svelteHTML.createElement("small", { "class":`hint`,});t("Choose the colours of the table and the card back."); }
       { svelteHTML.createElement("div", {     "class":`theme-grid`,"role":`radiogroup`,"aria-labelledby":`theme-label`,});
           for(let option of __sveltets_2_ensureArray(themeOptions)){option.value;
           { svelteHTML.createElement("label", {     "class":`theme`,...__sveltets_2_empty({"data-theme":option.value}),});settings.theme === option.value;option.disabled;
             { svelteHTML.createElement("input", {            "type":`radio`,"name":`theme`,"value":option.value,"checked":settings.theme === option.value,"disabled":option.disabled,"onchange":() => { setTheme(option.value); sfx.play("tap"); },});}
             { svelteHTML.createElement("span", { "class":`swatch`,}); { const $$_kcaBdraC6C = __sveltets_2_ensureComponent(CardBack); new $$_kcaBdraC6C({ target: __sveltets_2_any(), props: {}});} }
             { svelteHTML.createElement("strong", {});option.label; }
            if(option.hint){ { svelteHTML.createElement("small", {}); { const $$_kcoL6C = __sveltets_2_ensureComponent(Lock); new $$_kcoL6C({ target: __sveltets_2_any(), props: {    "size":12,"aria-hidden":`true`,}});} option.hint; }}
           }
        }
       }
     }
     { const $$_detnemgeS2C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS2C({ target: __sveltets_2_any(), props: {          "name":`effects`,"label":t("Effects"),"value":settings.effects,"onchange":setEffects,"options":[{ value: "full", label: t("Full") }, { value: "reduced", label: t("Reduced") }, { value: "off", label: t("No effects") }],}});}
     { const $$_detnemgeS2C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS2C({ target: __sveltets_2_any(), props: {          "name":`pace`,"label":t("Pace"),"value":settings.pace,"onchange":setPace,"options":[{ value: "relaxed", label: t("Relaxed") }, { value: "normal", label: t("Normal") }, { value: "quick", label: t("Quick") }],}});}
     { svelteHTML.createElement("small", { "class":`hint`,});t("Choose how fast the bots play and the table moves."); }
   }

   { svelteHTML.createElement("section", { "class":`card glass`,});
     { svelteHTML.createElement("h2", {});t("Sound"); }
     { const $$_hctiwS2C = __sveltets_2_ensureComponent(Switch); new $$_hctiwS2C({ target: __sveltets_2_any(), props: {        "label":t("Sound effects"),"hint":t("Enable optional game sounds."),"checked":settings.sound,"onchange":(on) => { setSound(on); if (on) sfx.play("bid"); },}});}
     { const $$_hctiwS2C = __sveltets_2_ensureComponent(Switch); new $$_hctiwS2C({ target: __sveltets_2_any(), props: {        "label":t("Music"),"hint":t("Play a tune that matches the table theme while you play."),"checked":settings.music,"onchange":setMusic,}});}
    if(settings.music){
       { svelteHTML.createElement("div", {  });__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 200 })));
         { const $$_detnemgeS3C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS3C({ target: __sveltets_2_any(), props: {            "name":`music-volume`,"label":t("Music volume"),"size":`sm`,"value":settings.musicVolume,"onchange":setMusicVolume,"options":[{ value: "low", label: t("Low") }, { value: "medium", label: t("Medium") }, { value: "high", label: t("High") }],}});}
       }
    }
    if(vibrationSupported){
       { const $$_hctiwS2C = __sveltets_2_ensureComponent(Switch); new $$_hctiwS2C({ target: __sveltets_2_any(), props: {        "label":t("Vibration"),"hint":t("A short buzz when a card is played or a trick is won."),"checked":settings.vibration,"onchange":setVibrationSetting,}});}
    }
   }

   { svelteHTML.createElement("section", { "class":`card glass`,});
     { svelteHTML.createElement("h2", {});t("At the table"); }
     { const $$_hctiwS2C = __sveltets_2_ensureComponent(Switch); new $$_hctiwS2C({ target: __sveltets_2_any(), props: {        "label":t("Reactions"),"hint":t("Send and see quick reactions at online tables."),"checked":settings.reactions,"onchange":setReactions,}});}
     { const $$_hctiwS2C = __sveltets_2_ensureComponent(Switch); new $$_hctiwS2C({ target: __sveltets_2_any(), props: {        "label":t("Bot comments"),"hint":t("Bots comment on the game."),"checked":settings.botComments,"onchange":setBotComments,}});}
    if(account.signedIn && account.boardVisible !== null){
       { const $$_hctiwS2C = __sveltets_2_ensureComponent(Switch); new $$_hctiwS2C({ target: __sveltets_2_any(), props: {        "label":t("Show me on the leaderboard"),"hint":t("Other players can see your name, rating and rank."),"checked":account.boardVisible,"onchange":setBoardVisible,}});}
    }
     { svelteHTML.createElement("p", { "class":`hint`,});t("Cards always use both a suit symbol and colour. Controls support touch and keyboard use."); }
   }

  if(account.signedIn){
     { svelteHTML.createElement("section", { "class":`card glass`,});
       { svelteHTML.createElement("h2", {});t("Your data"); }
       { svelteHTML.createElement("p", { "class":`hint`,});t("Download a copy of what Beelot keeps about you, or delete your account."); }
       { svelteHTML.createElement("div", { "class":`links`,});
         { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"href":`/api/account/export`,"download":true,"onclick":exportData,}}); { const $$_daolnwoD4C = __sveltets_2_ensureComponent(Download); new $$_daolnwoD4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Download my data"); Button}
         { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`ghost`,"onclick":() => { deleting = true; deleteWord = ""; deleteMessage = ""; },}}); { const $$_2hsarT4C = __sveltets_2_ensureComponent(Trash2); new $$_2hsarT4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Delete my account"); Button}
       }
       { svelteHTML.createElement("p", {   "class":`hint`,"role":`status`,});exportMessage; }
      if(deleting){
         { svelteHTML.createElement("div", {   "class":`danger`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 220 })));
           { svelteHTML.createElement("p", {});t("Your account, your passkey and your sign-in history will be deleted. Finished matches stay in other players' history, shown as “Deleted player”."); }
           { svelteHTML.createElement("label", {});
             { svelteHTML.createElement("span", {});t("Type this word to confirm:");  { svelteHTML.createElement("strong", {});t("DELETE"); } }
             { svelteHTML.createElement("input", {          "class":`field`,"autocapitalize":`characters`,"autocomplete":`off`,"spellcheck":`false`,"bind:value":deleteWord,});/*Ωignore_startΩ*/() => deleteWord = __sveltets_2_any(null);/*Ωignore_endΩ*/}
           }
           { svelteHTML.createElement("div", { "class":`links`,});
             { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {       children:() => { return __sveltets_2_any(0); },"variant":`danger`,"disabled":deleteWord.trim().toLocaleUpperCase() !== t("DELETE"),"busy":deleteBusy,"onclick":deleteAccount,}});t("Delete my account for good"); Button}
             { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`ghost`,"onclick":() => (deleting = false),}});t("Cancel"); Button}
           }
         }
      }
       { svelteHTML.createElement("p", {   "class":`message`,"role":`alert`,});deleteMessage; }
     }
  }

   { svelteHTML.createElement("p", { "class":`footer`,}); { svelteHTML.createElement("a", {   "class":`link`,"href":`/privacy`,});t("Privacy policy"); } }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Settings__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Settings__SvelteComponent_ = ReturnType<typeof Settings__SvelteComponent_>;
/*Ωignore_endΩ*/export default Settings__SvelteComponent_;