import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as jb } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as ser } from "@remotion/google-fonts/InstrumentSerif";
export const sans = inter("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const mono = jb("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;
export const serif = ser("italic", { weights: ["400"], subsets: ["latin"] }).fontFamily;
export const C = { navy: "#0a0e17", ink: "#f0f2f5", dim: "#8892a6", green: "#33ff00", greenInk: "#04140a", red: "#ff3b30", paper: "#f3f5f1", black: "#05070c" };
