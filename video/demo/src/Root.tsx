import React from "react";
import { Composition, Still } from "remotion";
import { Film } from "./Film";
import { Poster } from "./Poster";
import { VoteFlier, VoteWide } from "./Vote";
import { FPS, TM } from "./lib";
import { Promo, PROMO_TOTAL, PFPS } from "./promo/Promo";
export const Root: React.FC = () => (<>
  <Composition id="Demo" component={Film} width={1920} height={1080} fps={FPS} durationInFrames={Math.round(TM.total * FPS)} />
  <Composition id="TapeTapePromo" component={Promo} width={1920} height={1080} fps={PFPS} durationInFrames={Math.round(PROMO_TOTAL * PFPS)} />
  <Still id="Poster" component={Poster} width={1920} height={1080} />
      <Still id="VoteFlier" component={VoteFlier} width={1080} height={1350} />
      <Still id="VoteWide" component={VoteWide} width={1920} height={1080} />
</>);
