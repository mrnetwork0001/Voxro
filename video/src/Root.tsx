import React from "react";
import { Composition, Still } from "remotion";
import { Film } from "./Film";
import { Poster } from "./Poster";
import { Flier } from "./Flier";
import { Countdown } from "./Countdown";
import { FPS, TM } from "./lib";
export const Root: React.FC = () => (<>
  <Composition id="Teaser" component={Film} width={1920} height={1080} fps={FPS} durationInFrames={Math.round(TM.total * FPS)} />
  <Still id="Poster" component={Poster} width={1920} height={1080} />
  <Still id="Flier" component={Flier} width={1920} height={1080} />
  <Still id="Countdown" component={Countdown} width={1920} height={1080} />
</>);
