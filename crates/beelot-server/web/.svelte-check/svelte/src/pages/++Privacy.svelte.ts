///<reference types="svelte" />
;// The privacy policy (US-129): one file in the three languages, filled with the operator's values from the server.

import { onMount } from "svelte";
import { apiJson } from "$lib/api/client";
import { language, t } from "$lib/i18n/i18n.svelte";
import { policyView } from "$lib/models/privacy";
function $$render() {

  
  
  
  
  

  let policy = $state<any>(null);
  let info = $state<any>({});

  onMount(async () => {
    // The wrapper shows the connection note when a request fails; the page keeps what it has.
    const [policyAnswer, infoAnswer] = await Promise.allSettled([apiJson("/privacy-policy.json"), apiJson("/api/privacy/policy-info")]);
    if (policyAnswer.status === "fulfilled") policy = policyAnswer.value;
    if (infoAnswer.status === "fulfilled") info = infoAnswer.value;
  });

  const view = $derived(policy ? policyView(policy, info, language(), t("not configured")) : null);
;
async () => {

 { svelteHTML.createElement("div", { "class":`page privacy`,});
   { svelteHTML.createElement("header", { "class":`head`,});
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("How we handle your data"); }
     { svelteHTML.createElement("h1", { "class":`page-title`,});t("Privacy policy"); }
   }
  if(view){
     { svelteHTML.createElement("article", { "class":`glass doc`,});
       { svelteHTML.createElement("p", { "class":`intro`,});view.intro; }
         for(let section of __sveltets_2_ensureArray(view.sections)){section.id;
         { svelteHTML.createElement("section", { "id":`privacy-${section.id}`,});
           { svelteHTML.createElement("h2", {});section.heading; }
              for(let paragraph of __sveltets_2_ensureArray(section.paragraphs)){let index = 1;index; { svelteHTML.createElement("p", {});paragraph; }}
          if(section.items.length){ { svelteHTML.createElement("ul", {});    for(let item of __sveltets_2_ensureArray(section.items)){let index = 1;index; { svelteHTML.createElement("li", {});item; }} }}
         }
      }
     }
  }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Privacy__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Privacy__SvelteComponent_ = ReturnType<typeof Privacy__SvelteComponent_>;
/*Ωignore_endΩ*/export default Privacy__SvelteComponent_;