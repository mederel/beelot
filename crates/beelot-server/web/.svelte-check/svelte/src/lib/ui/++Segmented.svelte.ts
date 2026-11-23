///<reference types="svelte" />
;// A choice of a few options as a row of pills (radio inputs, so the arrow keys move between them and a screen reader reads
// a radio group). The selected pill is honey; with many options the row wraps.

import type { Snippet } from "svelte";
import { sfx } from "$lib/audio/sfx";
function $$render<T extends string | number>() {

  
  
  
  

  interface Option {
    value: T;
    label: string;
    disabled?: boolean;
    hidden?: boolean;
    hint?: string;
    class?: string;
  }

  interface Props {
    name: string;
    label: string;
    options: Option[];
    value: T;
    visibleLabel?: boolean;
    size?: "md" | "sm";
    onchange?: (value: T) => void;
    option?: Snippet<[Option]>;
  }

  let { name, label, options, value = $bindable(), visibleLabel = true, size = "md", onchange, option }: Props = $props()/*Ωignore_startΩ*/;value;/*Ωignore_endΩ*/;
  const labelId = `seg-${Math.random().toString(36).slice(2, 9)}`;

  function choose(next: T) {
    value = next;
    sfx.play("tap");
    onchange?.(next);
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`segmented ${size}`,});
   { svelteHTML.createElement("span", {    "id":labelId,"class":`label`,});!visibleLabel;label; }
   { svelteHTML.createElement("div", {     "class":`group`,"role":`radiogroup`,"aria-labelledby":labelId,});
       for(let item of __sveltets_2_ensureArray(options)){item.value;
      if(!item.hidden){
         { svelteHTML.createElement("label", {   "class":`pill ${item.class ?? ''}`,});item.value === value;item.disabled;
           { svelteHTML.createElement("input", {           "type":`radio`,name,"value":item.value,"checked":item.value === value,"disabled":item.disabled,"onchange":() => choose(item.value),});}
          if(option){;__sveltets_2_ensureSnippet(option(item));}else{ { svelteHTML.createElement("span", {});item.label; }}
          if(item.hint){ { svelteHTML.createElement("small", {});item.hint; }}
         }
      }
    }
   }
 }


};
return { props: {} as any as Props, exports: {}, bindings: __sveltets_$$bindings('value'), slots: {}, events: {} }}
class __sveltets_Render<T extends string | number> {
    props(): ReturnType<typeof $$render<T>>['props'] { return null as any; }
    events(): ReturnType<typeof $$render<T>>['events'] { return null as any; }
    slots(): ReturnType<typeof $$render<T>>['slots'] { return null as any; }
    bindings() { return __sveltets_$$bindings('value'); }
    exports() { return {}; }
}

interface $$IsomorphicComponent {
    new <T extends string | number>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<T>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<T>['props']>, ReturnType<__sveltets_Render<T>['events']>, ReturnType<__sveltets_Render<T>['slots']>> & { $$bindings?: ReturnType<__sveltets_Render<T>['bindings']> } & ReturnType<__sveltets_Render<T>['exports']>;
    <T extends string | number>(internal: unknown, props: ReturnType<__sveltets_Render<T>['props']> & {}): ReturnType<__sveltets_Render<T>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
const Segmented__SvelteComponent_: $$IsomorphicComponent = null as any;
/*Ωignore_startΩ*/type Segmented__SvelteComponent_<T extends string | number> = InstanceType<typeof Segmented__SvelteComponent_<T>>;
/*Ωignore_endΩ*/export default Segmented__SvelteComponent_;