///<reference types="svelte" />
;function $$render() {

  // The back of a card: a honeycomb in the table theme's colours with the bee in a hexagon. The size comes from `--cw`.
;
async () => {

 { svelteHTML.createElement("div", {   "class":`back`,"aria-hidden":`true`,});
   { svelteHTML.createElement("span", { "class":`emblem`,});
     { svelteHTML.createElement("svg", { "viewBox":`0 0 40 40`,});
       { svelteHTML.createElement("path", {    "class":`hexagon`,"d":`M20 2l15.6 9v18L20 38 4.4 29V11z`,});}
       { svelteHTML.createElement("ellipse", {            "class":`wing`,"cx":`14`,"cy":`15`,"rx":`5`,"ry":`7`,"transform":`rotate(-30 14 15)`,});}
       { svelteHTML.createElement("ellipse", {            "class":`wing`,"cx":`26`,"cy":`15`,"rx":`5`,"ry":`7`,"transform":`rotate(30 26 15)`,});}
       { svelteHTML.createElement("ellipse", {          "class":`body`,"cx":`20`,"cy":`23`,"rx":`7`,"ry":`8.5`,});}
       { svelteHTML.createElement("path", {    "class":`stripe`,"d":`M13.4 21h13.2M13.6 26h12.8`,});}
     }
   }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {} }}
const CardBack__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type CardBack__SvelteComponent_ = InstanceType<typeof CardBack__SvelteComponent_>;
/*Ωignore_endΩ*/export default CardBack__SvelteComponent_;