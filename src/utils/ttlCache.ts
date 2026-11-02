interface Entry<T> {
  value: Promise<T>;
  expiresAt: number;
}

/** Holds what a load answers for a while, and lets everyone who asks for the same thing in the meantime share one load. */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly ttlMs: number, private readonly maxEntries: number) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }

    const value = load();
    // Deleted first so the entry moves to the back, which is where the oldest are dropped from.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) {
        break;
      }
      this.entries.delete(oldest);
    }

    // A failure isn't worth holding: the next ask should try again.
    value.catch(() => {
      if (this.entries.get(key)?.value === value) {
        this.entries.delete(key);
      }
    });

    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}
