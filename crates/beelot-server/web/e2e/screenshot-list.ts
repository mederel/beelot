// What the screenshots photograph (US-205): the screens, and the images a size holds. Plain data, so that a unit test can read it.

/** The screens, in the order of the story. Each name is an image file. */
export const SCREENS = ["home", "setup", "auction", "mid-trick", "round-result", "match-end", "lobby", "settings"] as const;
/** The screens that are also photographed in French and in Dutch, one per language. */
export const TRANSLATED = { fr: "auction", nl: "round-result" } as const;
/** Every image a size holds. */
export const IMAGES = [...SCREENS, ...Object.entries(TRANSLATED).map(([language, screen]) => `${screen}-${language}`)];
