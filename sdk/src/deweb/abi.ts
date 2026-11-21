/** DeWEB on X Layer: `SiteRegistry` (files, 24,000-byte chunks) and `DomainBinding` (`<#ID>.2.<cpu>.tape` names). */
import { parseAbi } from 'viem';

export const siteRegistryAbi = parseAbi([
  'function CHUNK_MAX() view returns (uint256)',
  'function putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data)',
  'function appendChunk(address container, string path, uint256 expectIndex, bytes data)',
  'function setFallback(address container, string path)',
  'function fileInfo(address container, string path) view returns (uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)',
  'function read(address container, string path) view returns (bytes)',
]);

export const domainBindingAbi = parseAbi([
  'function monthlyFee() view returns (uint256)',
  'function bind(string name, address container, uint256 months) payable',
]);
