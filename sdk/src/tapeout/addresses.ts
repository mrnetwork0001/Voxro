/**
 * X Layer mainnet (chainId 196) deployments used by Voxro.
 * Every address below was checked for code and behaviour on 2026-11-01 (see docs/upstream/README.md).
 */
import type { Address } from './netlist.js';

export const XLAYER_CHAIN_ID = 196;
/** DeWEB area code for X Layer: names are `<#ID>.2.<processorNumber>.tape`. */
export const XLAYER_AREA_CODE = 2;

export const XLAYER = Object.freeze({
  chainId: XLAYER_CHAIN_ID,
  areaCode: XLAYER_AREA_CODE,
  rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com', 'https://xlayer.drpc.org'] as readonly string[],
  explorer: 'https://www.okx.com/web3/explorer/xlayer',

  factory: '0x1f09DAeFA827f02CBb40967cc91b259763760761' as Address,
  factoryImplementation: '0xb41c1e7602eb5734be2430b72178ccb814a5293d' as Address,
  transistorBeacon: '0x1059Ad62cAbB6a6925bb65aA617300556c60A51B' as Address,
  circuitBeacon: '0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C' as Address,
  circuitImplementation: '0x977f217887E085D298Cb3819cDAD5A0ee35F29B2' as Address,
  opener: '0x536adD8F30f03b69f6fbF29d425A816A0dC50106' as Address,
  erc6551Registry: '0x000000006551c19487814612e58FE06813775758' as Address,
  accountImplementation: '0xac4f791353ee9f06e2c50ae4c34680d28ea52a57' as Address,

  deWebHub: '0xe61A9C7213a6Aa616C246a2B569e555B417b25ee' as Address,
  deWebHubImplementation: '0xdcc57797089ebd9f26e686379a4323f353a3f9c6' as Address,
  siteRegistry: '0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6' as Address,
  domainBinding: '0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9' as Address,
  circuitMarket: '0xd89f358c48a7B632c9845af2a02A32eB90DD75DB' as Address,
  transistorDrops: '0xf037a5543f19619a2291009ae1542b71d50ff9b9' as Address,
  multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11' as Address,

  usdt0: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' as Address,
  usdt: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d' as Address,
});

/** ERC-1967 implementation slot. */
export const ERC1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const;

/** Canonical DeWEB name of circuit `tokenId` on the processor with factory index `cpuNumber`. */
export function deWebName(tokenId: bigint | number, cpuNumber: bigint | number, areaCode = XLAYER_AREA_CODE): string {
  return `${tokenId}.${areaCode}.${cpuNumber}.tape`;
}

/** Short display form used by TapeKit address bars: `#<id>@<area>.<cpu>`. */
export function shortName(tokenId: bigint | number, cpuNumber: bigint | number, areaCode = XLAYER_AREA_CODE): string {
  return `#${tokenId}@${areaCode}.${cpuNumber}`;
}
