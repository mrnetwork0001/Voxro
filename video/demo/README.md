# Voxro demo film

A 2:33 demo film of Voxro for the X Layer TapeOut judges. It is made with Remotion 4.0.530, with narration, music and sound effects from ElevenLabs.

## What is real

- **Narration:** ElevenLabs `eleven_multilingual_v2`, voice George (`JBFqnCBsd6RMkjVDRZzb`), from `script.json`. Each line is normalised to -16 LUFS, and the final mix to -14 LUFS with a true peak of -1.5 dBTP. Respelled words are in `say`: "Vox-roh", "Tape Send", "Dee Web" and "Earn dot com".
- **Music and sound effects:** ElevenLabs Music (`scripts/music.mjs`, two cues in D minor at 108 BPM) and Sound Effects (`scripts/sfx.mjs`, 14 effects).
- **Footage:** the live production site https://voxro.shieldsuite.xyz, recorded by headless Chrome on 2026-11-25 at 1600×900, device scale 2 (`scripts/capture.mjs`). Clips: landing, pulse, directory, studio, gallery, prover, and the OKLink page of the registerInbox transaction.
  - The capture is read-only. No wallet was connected, nothing was sent, and the message typed in the Directory was never submitted.
  - Gate access used a beta code, and only its hashed cookie was set.
- **On-chain facts:** every hash, block and time comes from `data/onchain.json`. `scripts/onchain.mjs` reads it back from X Layer (chain 196) over public RPC, using the Foundry broadcast of the launch.
  - Launch: 20 transactions, 2026-11-21T13:12:30.000Z to 2026-11-21T13:13:11.000Z , blocks 76497714 to 76497755.
  - VOXR processor `0xd47C1A47d809438d66fd472cd2A30392ace4e581` is Factory index 438, read with `cpuAt`. It has 8 tapeouts.
  - VoxroEscrow `0xd463a83b572AC72C8bE328069d61d2B19Cdf73D5` and VoxroLens `0xc994Cd83C3eA571d38Ed7EbDa8f30c05D06F5640`.
  - @voxro was registered as inbox #1 by `registerInbox` at block 76497755.
- **Figures read from the live app on 2026-11-25:**
  - @voxro's quote of 10 USD₮0 and its price ladder: 10, 15, 15, 25, 25, 40, 40, 40.
  - 451 TapeOut processors.
  - 157 NAND and 3 LATCH in the catalog.
  - 2,656 transitions proven with 0 mismatches, from Pulse.
  - VOXR #4 at 512 out of 512 transitions, matching on-chain in 2,831 ms, from the Prover.
- **Settlement scene:** real. Ticket #1 was locked, answered and claimed on mainnet on 2026-11-25 (`data/ticket.json`, from `scripts/ticket.mjs`): lock `0x3f521d0d…` 18:19:40 UTC, reply `0x82498fec…` 18:24:07, claim `0x424a42b6…` 18:24:17. The footage is the live receipt page `#/receipt/1`. It was a team smoke test (both wallets are ours), labelled on screen. Only the refund outcome that follows is an illustration, since no ticket has expired yet.
  - The three checks on screen are the labels from `VoxroLens.receipt()`.
- **Outside fact:** Coinbase acquired Earn.com in 2018 for a reported $100M. The "20–50% fees" figure is from Voxro's own landing page.
- **Logos:** X Layer (`xlayer-icon.svg`), TapeOut (`tapeout-mark.svg`), OKX (`okx.svg`) and ShieldSuite, all unaltered.

## Build it

The ElevenLabs key is read at runtime from `~/.config/elevenlabs/.env` (`ELEVENLABS_API_KEY`).

```bash
node scripts/onchain.mjs                                # data/onchain.json
BETA_CODE=… node scripts/capture.mjs && node scripts/encode.mjs   # footage (read-only)
node scripts/voiceover.mjs && node scripts/timing.mjs   # narration + src/timing.json
node scripts/music.mjs && node scripts/sfx.mjs
node scripts/stills.mjs                                 # out/sheet.png
npm run draft                                           # out/draft.mp4 (half scale)
npm run render4k && npm run finish                      # out/voxro-demo-4k.mp4
npx remotion still src/index.ts Poster out/voxro-demo-thumbnail.png
```
