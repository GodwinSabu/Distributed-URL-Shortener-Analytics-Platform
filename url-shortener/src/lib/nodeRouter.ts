import { ring } from "./hashRing";

// Map logical node IDs to their actual addresses.
// In K8s these will be pod IPs from service discovery.
// In development, all 3 point to localhost (same process, different logical identity).
const NODE_ADDRESSES: Record<string, string> = {
  "node-1": process.env.NODE_1_URL ?? "http://localhost:3000",
  "node-2": process.env.NODE_2_URL ?? "http://localhost:3000",
  "node-3": process.env.NODE_3_URL ?? "http://localhost:3000",
};

// Which node is THIS process? Set via env var when deploying multiple instances.
const CURRENT_NODE = process.env.NODE_ID ?? "node-1";

export interface RoutingDecision {
  nodeId:    string;   // logical node that owns this key
  address:   string;   // HTTP address of that node
  isCurrent: boolean;  // true if this process IS the owner
}

/**
 * Determine which node should handle a given short code.
 * The same short code always maps to the same node (deterministic).
 */
export function getOwnerNode(shortCode: string): RoutingDecision {
  const nodeId  = ring.getNode(shortCode) ?? CURRENT_NODE;
  const address = NODE_ADDRESSES[nodeId] ?? NODE_ADDRESSES[CURRENT_NODE];

  return {
    nodeId,
    address,
    isCurrent: nodeId === CURRENT_NODE,
  };
}

/**
 * In a real multi-process setup, if isCurrent is false you would
 * forward the request to the owner node. This function simulates that.
 *
 * For now it just logs — in Phase 6 this becomes an actual HTTP proxy call.
 */
export async function forwardToOwner(
  shortCode: string,
  originalRequest: Request
): Promise<Response | null> {
  const decision = getOwnerNode(shortCode);

  if (decision.isCurrent) {
    return null; // Handle locally — no forwarding needed
  }

  console.log(
    `[Router] Forwarding /${shortCode} → ${decision.nodeId} (${decision.address})`
  );

  // In Phase 6 (K8s), this becomes:
  // return fetch(`${decision.address}/${shortCode}`, { headers: originalRequest.headers });

  // For now: handle locally but log the routing decision
  return null;
}

/** For the /health and /debug endpoints */
export function getRingStatus() {
  return {
    currentNode:  CURRENT_NODE,
    nodes:        ring.getNodeList(),
    distribution: ring.getDistribution(),
  };
}