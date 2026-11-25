import { getStaticFiles } from "remotion";
/** True if a file exists in public/ (lets the film render before the narration is generated). */
export const existsSync = (p: string) => getStaticFiles().some((f) => f.name === p);
