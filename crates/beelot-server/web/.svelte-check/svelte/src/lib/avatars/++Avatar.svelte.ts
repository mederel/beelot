///<reference types="svelte" />
;// A seat's face. A bot has its character, drawn flat for the redesign, with one of five expressions (US-088): neutral,
// thinking, pleased, annoyed and celebrating; a change of expression bounces. A human has the initial of their name on
// their team's colour.

import { botCharacter } from "$lib/models/bots";
import { playerName } from "$lib/i18n/i18n.svelte";

;type $$ComponentProps =  { name: string; expression?: string; team?: number; size?: string };function $$render() {

  
  
  
  
  

  let { name, expression = "neutral", team = 0, size = "3rem" }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

  const character = $derived(botCharacter(name)?.key ?? null);
  const initial = $derived(playerName(name).trim().slice(0, 1).toUpperCase() || "?");

  const LOOKS: Record<string, { bg: [string, string]; skin: string; hair: string }> = {
    camille: { bg: ["#ff9db5", "#ff5c7a"], skin: "#f6c7a5", hair: "#5b2a1d" },
    luc: { bg: ["#7ee8c8", "#22b58a"], skin: "#e7b48f", hair: "#2a1d14" },
    manon: { bg: ["#b9a6ff", "#6d4dff"], skin: "#c98f6b", hair: "#15121f" },
    hugo: { bg: ["#ffd88a", "#ff9f1c"], skin: "#f0c09a", hair: "#8a5a2b" }
  };
  const look = $derived(character ? LOOKS[character] : null);
;
async () => {

if(character && look){
   { svelteHTML.createElement("svg", {        "class":`avatar`,"viewBox":`0 0 64 64`,"aria-hidden":`true`,...__sveltets_2_empty({"data-expression":expression}),});__sveltets_2_ensureType(String, Number, size);
     { svelteHTML.createElement("defs", {});
       { svelteHTML.createElement("linearGradient", {         "id":`bg-${character}`,"x1":`0`,"y1":`0`,"x2":`1`,"y2":`1`,});
         { svelteHTML.createElement("stop", {    "offset":`0`,"stop-color":look.bg[0],});}
         { svelteHTML.createElement("stop", {    "offset":`1`,"stop-color":look.bg[1],});}
       }
       { svelteHTML.createElement("clipPath", { "id":`clip-${character}`,}); { svelteHTML.createElement("circle", {      "cx":`32`,"cy":`32`,"r":`32`,});} }
     }
     { svelteHTML.createElement("g", { "clip-path":`url(#clip-${character})`,});
       { svelteHTML.createElement("rect", {      "width":`64`,"height":`64`,"fill":`url(#bg-${character})`,});}
       { svelteHTML.createElement("path", {      "d":`M10 64c2-12 11-18 22-18s20 6 22 18z`,"fill":`#fff`,"opacity":`.9`,});}
      if(character === "camille"){
         { svelteHTML.createElement("circle", {        "cx":`32`,"cy":`27`,"r":`19`,"fill":look.hair,});}
         { svelteHTML.createElement("circle", {        "cx":`16`,"cy":`34`,"r":`8`,"fill":look.hair,});}
         { svelteHTML.createElement("circle", {        "cx":`48`,"cy":`34`,"r":`8`,"fill":look.hair,});}
      } else if (character === "manon"){
         { svelteHTML.createElement("path", {    "d":`M13 40V27a19 19 0 0 1 38 0v13z`,"fill":look.hair,});}
      }
       { svelteHTML.createElement("ellipse", {          "cx":`32`,"cy":`31`,"rx":`13.5`,"ry":`15`,"fill":look.skin,});}
      if(character === "camille"){
         { svelteHTML.createElement("path", {    "d":`M18 26c3-8 9-11 14-11s11 3 14 11c-6-3-12-4-14-8-3 4-8 6-14 8z`,"fill":look.hair,});}
         { svelteHTML.createElement("rect", {                "x":`21`,"y":`27.5`,"width":`9`,"height":`6`,"rx":`3`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`1.6`,});}
         { svelteHTML.createElement("rect", {                "x":`34`,"y":`27.5`,"width":`9`,"height":`6`,"rx":`3`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`1.6`,});}
         { svelteHTML.createElement("path", {      "d":`M30 30h4`,"stroke":`#241a05`,"stroke-width":`1.6`,});}
      } else if (character === "luc"){
         { svelteHTML.createElement("path", {    "d":`M17 25c0-8 7-13 15-13s15 5 15 13z`,"fill":`#ff5c7a`,});}
         { svelteHTML.createElement("path", {    "d":`M30 24h22c1 0 1 3-1 3H31z`,"fill":`#e0243c`,});}
         { svelteHTML.createElement("circle", {        "cx":`32`,"cy":`12.5`,"r":`2`,"fill":`#fff`,});}
      } else if (character === "manon"){
         { svelteHTML.createElement("path", {    "d":`M18.5 30c0-10 6-15 13.5-15s13.5 5 13.5 15c-4-6-9-8-13.5-8s-9.5 2-13.5 8z`,"fill":look.hair,});}
      }else{
         { svelteHTML.createElement("path", {    "d":`M18.5 27c1-8 7-12 13.5-12s12.5 4 13.5 12c-3-3-7-5-13.5-5s-10.5 2-13.5 5z`,"fill":look.hair,});}
         { svelteHTML.createElement("path", {    "d":`M19 33c1 9 6 13 13 13s12-4 13-13c-2 3-5 5-7 5h-12c-2 0-5-2-7-5z`,"fill":look.hair,});}
      }
      expression; {
       { svelteHTML.createElement("g", { "class":`face`,});
        if(expression === "pleased" || expression === "celebrating"){
           { svelteHTML.createElement("path", {          "d":`M22.5 31q3-3 6 0M35.5 31q3-3 6 0`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`2`,"stroke-linecap":`round`,});}
        } else if (expression === "annoyed"){
           { svelteHTML.createElement("path", {        "d":`M22.5 29.5l6 1.5M41.5 29.5l-6 1.5`,"stroke":`#241a05`,"stroke-width":`2`,"stroke-linecap":`round`,});}
           { svelteHTML.createElement("circle", {        "cx":`25.5`,"cy":`32.5`,"r":`1.6`,"fill":`#241a05`,});}
           { svelteHTML.createElement("circle", {        "cx":`38.5`,"cy":`32.5`,"r":`1.6`,"fill":`#241a05`,});}
        } else if (expression === "thinking"){
           { svelteHTML.createElement("circle", {        "cx":`26.5`,"cy":`30`,"r":`1.8`,"fill":`#241a05`,});}
           { svelteHTML.createElement("circle", {        "cx":`39.5`,"cy":`30`,"r":`1.8`,"fill":`#241a05`,});}
           { svelteHTML.createElement("path", {          "d":`M35.5 26.5q3-1.5 6 0`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`1.6`,"stroke-linecap":`round`,});}
        }else{
           { svelteHTML.createElement("circle", {        "cx":`25.5`,"cy":`31`,"r":`1.9`,"fill":`#241a05`,});}
           { svelteHTML.createElement("circle", {        "cx":`38.5`,"cy":`31`,"r":`1.9`,"fill":`#241a05`,});}
        }
        if(expression === "pleased"){
           { svelteHTML.createElement("path", {          "d":`M27 38q5 4 10 0`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`2`,"stroke-linecap":`round`,});}
        } else if (expression === "celebrating"){
           { svelteHTML.createElement("path", {          "d":`M26 37h12q-1 7-6 7t-6-7z`,"fill":`#7a1f2b`,"stroke":`#241a05`,"stroke-width":`1.6`,"stroke-linejoin":`round`,});}
        } else if (expression === "annoyed"){
           { svelteHTML.createElement("path", {          "d":`M27.5 40q4.5-3 9 0`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`2`,"stroke-linecap":`round`,});}
        } else if (expression === "thinking"){
           { svelteHTML.createElement("circle", {            "cx":`35`,"cy":`39`,"r":`1.8`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`1.6`,});}
        }else{
           { svelteHTML.createElement("path", {        "d":`M28.5 38.5h7`,"stroke":`#241a05`,"stroke-width":`2`,"stroke-linecap":`round`,});}
        }
         { svelteHTML.createElement("ellipse", {            "cx":`21`,"cy":`36`,"rx":`2.4`,"ry":`1.4`,"fill":`#ff5c7a`,"opacity":`.35`,});}
         { svelteHTML.createElement("ellipse", {            "cx":`43`,"cy":`36`,"rx":`2.4`,"ry":`1.4`,"fill":`#ff5c7a`,"opacity":`.35`,});}
       }
      }
     }
   }
}else{
   { svelteHTML.createElement("span", {     "class":`avatar human`,"aria-hidden":`true`,});team === 1;__sveltets_2_ensureType(String, Number, size);initial; }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Avatar__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Avatar__SvelteComponent_ = ReturnType<typeof Avatar__SvelteComponent_>;
/*Ωignore_endΩ*/export default Avatar__SvelteComponent_;