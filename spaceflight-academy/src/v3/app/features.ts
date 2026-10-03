/**
 * The Blueprint Studio is an internal tool: only local development builds
 * (`npm run dev`) show it. Production builds leave out its building, menu
 * button, screen and scene. Node tests see `import.meta.env` as undefined.
 */
export const STUDIO_ENABLED: boolean = import.meta.env?.DEV === true;
