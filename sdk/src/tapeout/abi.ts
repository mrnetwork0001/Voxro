/** Minimal ABIs for the TapeOut processor factory, transistors (ERC-1155) and circuits (ERC-721). */
import { parseAbi } from 'viem';

export const NAND_TOKEN_ID = 0n;
export const LATCH_TOKEN_ID = 1n;

export const factoryAbi = parseAbi([
  'function cpuCount() view returns (uint256)',
  'function cpuAt(uint256 i) view returns (address circuits)',
  'function isCPU(address cpu) view returns (bool)',
  'function deployFee() view returns (uint256)',
  'function createCPU(string name, string symbol, string story, uint256 transistorSupply, uint256 mintPrice) payable returns (address transistors, address circuits)',
]);

export const transistorsAbi = parseAbi([
  'function mint(uint256 id, uint256 amount) payable',
  'function mintPrice() view returns (uint256)',
  'function protocolFee() view returns (uint256)',
  'function supplyCap() view returns (uint256)',
  'function minted() view returns (uint256)',
  'function owed(address creator) view returns (uint256)',
  'function withdraw()',
  'function creator() view returns (address)',
  'function cpuName() view returns (string)',
  'function cpuSymbol() view returns (string)',
  'function story() view returns (string)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
]);

export const circuitsAbi = parseAbi([
  'function tapeout(bytes nl, uint32 nIn, uint32 nOut) payable returns (uint256 id)',
  'function TAPEOUT_FEE() view returns (uint256)',
  'function nextId() view returns (uint256)',
  'function circuitInfo(uint256 id) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)',
  'function netlist(uint256 id) view returns (bytes)',
  'function eval(uint256 id, bytes inputs) view returns (bytes outputs)',
  'function step(uint256 id, bytes state, bytes inputs) view returns (bytes newState, bytes outputs)',
  'function transistors() view returns (address)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]);
