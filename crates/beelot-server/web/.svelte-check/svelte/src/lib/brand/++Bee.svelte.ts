///<reference types="svelte" />
;
;type $$ComponentProps =  { size?: string; flutter?: boolean; class?: string };function $$render() {

  // The bee of Beelot, redrawn flat for the redesign: a honey body with ink stripes, glassy wings that flutter at full
  // effects, and a small smile.
  let { size = "3rem", flutter = true, class: extra = "" }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
;
async () => {

 { svelteHTML.createElement("svg", {      "class":`bee ${extra}`,"viewBox":`0 0 64 64`,"aria-hidden":`true`,});flutter;__sveltets_2_ensureType(String, Number, size);
   { svelteHTML.createElement("defs", {});
     { svelteHTML.createElement("linearGradient", {         "id":`bee-body`,"x1":`0`,"y1":`0`,"x2":`0`,"y2":`1`,});
       { svelteHTML.createElement("stop", {    "offset":`0`,"stop-color":`#ffe08a`,});}
       { svelteHTML.createElement("stop", {    "offset":`.55`,"stop-color":`#ffc22e`,});}
       { svelteHTML.createElement("stop", {    "offset":`1`,"stop-color":`#ff9f1c`,});}
     }
     { svelteHTML.createElement("linearGradient", {         "id":`bee-wing`,"x1":`0`,"y1":`0`,"x2":`0`,"y2":`1`,});
       { svelteHTML.createElement("stop", {      "offset":`0`,"stop-color":`#ffffff`,"stop-opacity":`.95`,});}
       { svelteHTML.createElement("stop", {      "offset":`1`,"stop-color":`#c7b8ff`,"stop-opacity":`.55`,});}
     }
   }
   { svelteHTML.createElement("g", { "class":`wings`,});
     { svelteHTML.createElement("ellipse", {              "class":`wing left`,"cx":`21`,"cy":`20`,"rx":`10`,"ry":`14`,"transform":`rotate(-28 21 20)`,"fill":`url(#bee-wing)`,});}
     { svelteHTML.createElement("ellipse", {              "class":`wing right`,"cx":`43`,"cy":`20`,"rx":`10`,"ry":`14`,"transform":`rotate(28 43 20)`,"fill":`url(#bee-wing)`,});}
   }
   { svelteHTML.createElement("path", {          "d":`M26 15c-1-5-4-8-8-9M38 15c1-5 4-8 8-9`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`2.4`,"stroke-linecap":`round`,});}
   { svelteHTML.createElement("circle", {        "cx":`18`,"cy":`6`,"r":`2.6`,"fill":`#241a05`,});}
   { svelteHTML.createElement("circle", {        "cx":`46`,"cy":`6`,"r":`2.6`,"fill":`#241a05`,});}
   { svelteHTML.createElement("ellipse", {          "cx":`32`,"cy":`38`,"rx":`17`,"ry":`19`,"fill":`url(#bee-body)`,});}
   { svelteHTML.createElement("path", {        "d":`M15.6 33h32.8M16 43h32M19.5 52h25`,"stroke":`#241a05`,"stroke-width":`5`,"stroke-linecap":`round`,});}
   { svelteHTML.createElement("circle", {        "cx":`26`,"cy":`25`,"r":`2.4`,"fill":`#241a05`,});}
   { svelteHTML.createElement("circle", {        "cx":`38`,"cy":`25`,"r":`2.4`,"fill":`#241a05`,});}
   { svelteHTML.createElement("path", {          "d":`M28 29.5q4 3 8 0`,"fill":`none`,"stroke":`#241a05`,"stroke-width":`2`,"stroke-linecap":`round`,});}
   { svelteHTML.createElement("ellipse", {            "cx":`22`,"cy":`28`,"rx":`2.6`,"ry":`1.6`,"fill":`#ff8098`,"opacity":`.55`,});}
   { svelteHTML.createElement("ellipse", {            "cx":`42`,"cy":`28`,"rx":`2.6`,"ry":`1.6`,"fill":`#ff8098`,"opacity":`.55`,});}
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Bee__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Bee__SvelteComponent_ = ReturnType<typeof Bee__SvelteComponent_>;
/*Ωignore_endΩ*/export default Bee__SvelteComponent_;