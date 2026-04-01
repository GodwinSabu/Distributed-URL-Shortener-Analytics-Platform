import { createHash } from "crypto";

// How many virtual positions each physical node gets on the ring.
// Higher = more even distribution. 150 is a solid production default.
const VNODES_PER_NODE = 150;

interface RingEntry {
  hash: number;      // position on the ring (0 → 2^32)
  nodeId: string;    // which physical node owns this position
}

export class HashRing {
  private ring: RingEntry[] = [];        // sorted by hash ascending
  private nodes: Set<string> = new Set();

  // ── Public API ──────────────────────────────────────────────────────────────

  addNode(nodeId: string): void {
    if (this.nodes.has(nodeId)) return;
    this.nodes.add(nodeId);

    for (let i = 0; i < VNODES_PER_NODE; i++) {
      const hash = this.hashKey(`${nodeId}:vnode:${i}`);
      this.ring.push({ hash, nodeId });
    }

    // Keep ring sorted so binary search works
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  removeNode(nodeId: string): void {
    if (!this.nodes.has(nodeId)) return;
    this.nodes.delete(nodeId);
    this.ring = this.ring.filter((entry) => entry.nodeId !== nodeId);
    // No re-sort needed — filter preserves order
  }

  /**
   * Given any string key (short code, IP, user ID),
   * find which node owns it.
   * Returns null only if the ring is empty.
   */
  getNode(key: string): string | null {
    if (this.ring.length === 0) return null;

    const keyHash = this.hashKey(key);

    // Binary search: find the first ring entry with hash >= keyHash
    let lo = 0;
    let hi = this.ring.length - 1;

    // If keyHash is beyond the last entry, wrap around to the first node
    if (keyHash > this.ring[hi].hash) {
      return this.ring[0].nodeId;
    }

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.ring[mid].hash < keyHash) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return this.ring[lo].nodeId;
  }

  /** Get N replica nodes for a key (useful for replication later). */
  getNodes(key: string, count: number): string[] {
    if (this.ring.length === 0) return [];

    const keyHash = this.hashKey(key);
    const seen = new Set<string>();
    const result: string[] = [];

    // Find start position
    let idx = this.ring.findIndex((e) => e.hash >= keyHash);
    if (idx === -1) idx = 0;

    // Walk clockwise collecting unique physical nodes
    for (let i = 0; i < this.ring.length && result.length < count; i++) {
      const entry = this.ring[(idx + i) % this.ring.length];
      if (!seen.has(entry.nodeId)) {
        seen.add(entry.nodeId);
        result.push(entry.nodeId);
      }
    }

    return result;
  }

  getNodeList(): string[] {
    return Array.from(this.nodes);
  }

  /** Show how many vnodes each physical node owns — should be roughly equal. */
  getDistribution(): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const entry of this.ring) {
      dist[entry.nodeId] = (dist[entry.nodeId] ?? 0) + 1;
    }
    return dist;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Hash a string into a 32-bit unsigned integer.
   * MD5 is fast and has good distribution — cryptographic strength not needed here.
   */
  private hashKey(key: string): number {
    const hex = createHash("md5").update(key).digest("hex");
    // Take first 8 hex chars = 32 bits, parse as unsigned int
    return parseInt(hex.substring(0, 8), 16);
  }
}

// ── Singleton ring — shared across the whole app ──────────────────────────────
export const ring = new HashRing();

// Register the nodes your app knows about.
// In production these come from service discovery (K8s, Consul).
// For now, 3 local nodes on different ports.
ring.addNode("node-1"); // http://localhost:3001
ring.addNode("node-2"); // http://localhost:3002
ring.addNode("node-3"); // http://localhost:3003

console.log("Hash ring distribution:", ring.getDistribution());