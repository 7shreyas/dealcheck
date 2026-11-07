// Persistence. Supabase (Postgres) when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set; otherwise an in-memory store (mock mode)
// that lives for the life of the dev server. Schema: supabase/migrations/.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isOffline } from "./http";
import type { CheckRecord, CoachMessage, OrderRecord } from "./types";

export interface Store {
  saveCheck(check: CheckRecord): Promise<void>;
  getCheck(id: string): Promise<CheckRecord | null>;

  createOrder(order: OrderRecord): Promise<void>;
  getOrder(id: string): Promise<OrderRecord | null>;
  updateOrder(id: string, patch: Partial<Omit<OrderRecord, "id">>): Promise<void>;
  /** Marks paid only if still pending. Returns true if this call changed it. */
  markOrderPaid(id: string, fields: { email: string | null; stripeSessionId: string | null; paidAt: string }): Promise<boolean>;

  /** Saves the report only if none is saved yet. Returns true if this call saved it. */
  saveReportIfMissing(id: string, report: OrderRecord["report"], cost: OrderRecord["cost"]): Promise<boolean>;

  /** Records a webhook event id. Returns false if it was already processed. */
  claimEvent(eventId: string): Promise<boolean>;

  /** Atomically increments a per-day counter and returns the new count. */
  incrementDaily(key: string, day: string): Promise<number>;

  getCache<T>(key: string): Promise<T | null>;
  setCache(key: string, value: unknown, ttlMs: number): Promise<void>;

  addCoachMessage(msg: CoachMessage): Promise<void>;
  listCoachMessages(orderId: string): Promise<CoachMessage[]>;
}

// ---------------------------------------------------------------------------

export class MemoryStore implements Store {
  checks = new Map<string, CheckRecord>();
  orders = new Map<string, OrderRecord>();
  events = new Set<string>();
  counters = new Map<string, number>();
  cache = new Map<string, { value: unknown; expiresAt: number }>();
  coach: CoachMessage[] = [];

  async saveCheck(check: CheckRecord) {
    this.checks.set(check.id, structuredClone(check));
  }
  async getCheck(id: string) {
    const c = this.checks.get(id);
    return c ? structuredClone(c) : null;
  }
  async createOrder(order: OrderRecord) {
    this.orders.set(order.id, structuredClone(order));
  }
  async getOrder(id: string) {
    const o = this.orders.get(id);
    return o ? structuredClone(o) : null;
  }
  async updateOrder(id: string, patch: Partial<Omit<OrderRecord, "id">>) {
    const o = this.orders.get(id);
    if (o) this.orders.set(id, { ...o, ...structuredClone(patch) });
  }
  async markOrderPaid(id: string, fields: { email: string | null; stripeSessionId: string | null; paidAt: string }) {
    const o = this.orders.get(id);
    if (!o || o.status === "paid") return false;
    this.orders.set(id, { ...o, ...fields, status: "paid" });
    return true;
  }
  async saveReportIfMissing(id: string, report: OrderRecord["report"], cost: OrderRecord["cost"]) {
    const o = this.orders.get(id);
    if (!o || o.report) return false;
    this.orders.set(id, { ...o, report: structuredClone(report), cost: structuredClone(cost) });
    return true;
  }
  async claimEvent(eventId: string) {
    if (this.events.has(eventId)) return false;
    this.events.add(eventId);
    return true;
  }
  async incrementDaily(key: string, day: string) {
    const k = `${day}:${key}`;
    const n = (this.counters.get(k) ?? 0) + 1;
    this.counters.set(k, n);
    return n;
  }
  async getCache<T>(key: string) {
    const hit = this.cache.get(key);
    if (!hit || hit.expiresAt <= Date.now()) return null;
    return structuredClone(hit.value) as T;
  }
  async setCache(key: string, value: unknown, ttlMs: number) {
    this.cache.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttlMs });
  }
  async addCoachMessage(msg: CoachMessage) {
    this.coach.push({ ...msg });
  }
  async listCoachMessages(orderId: string) {
    return this.coach.filter((m) => m.orderId === orderId).map((m) => ({ ...m }));
  }
}

// ---------------------------------------------------------------------------

type OrderRow = {
  id: string;
  check_id: string;
  status: OrderRecord["status"];
  created_at: string;
  paid_at: string | null;
  email: string | null;
  stripe_session_id: string | null;
  report: OrderRecord["report"];
  cost: OrderRecord["cost"];
  emailed_at: string | null;
};

const toOrder = (r: OrderRow): OrderRecord => ({
  id: r.id,
  checkId: r.check_id,
  status: r.status,
  createdAt: r.created_at,
  paidAt: r.paid_at,
  email: r.email,
  stripeSessionId: r.stripe_session_id,
  report: r.report,
  cost: r.cost,
  emailedAt: r.emailed_at,
});

function toOrderRow(patch: Partial<OrderRecord>): Partial<OrderRow> {
  const map: Record<string, keyof OrderRow> = {
    id: "id",
    checkId: "check_id",
    status: "status",
    createdAt: "created_at",
    paidAt: "paid_at",
    email: "email",
    stripeSessionId: "stripe_session_id",
    report: "report",
    cost: "cost",
    emailedAt: "emailed_at",
  };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (k in map) row[map[k]] = v;
  return row as Partial<OrderRow>;
}

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}

  async saveCheck(check: CheckRecord) {
    must(await this.db.from("checks").insert({ id: check.id, data: check, created_at: check.createdAt }));
  }
  async getCheck(id: string) {
    const row = must(await this.db.from("checks").select("data").eq("id", id).maybeSingle());
    return (row?.data as CheckRecord | undefined) ?? null;
  }
  async createOrder(order: OrderRecord) {
    must(await this.db.from("orders").insert(toOrderRow(order)));
  }
  async getOrder(id: string) {
    const row = must(await this.db.from("orders").select("*").eq("id", id).maybeSingle());
    return row ? toOrder(row as OrderRow) : null;
  }
  async updateOrder(id: string, patch: Partial<Omit<OrderRecord, "id">>) {
    must(await this.db.from("orders").update(toOrderRow(patch)).eq("id", id));
  }
  async markOrderPaid(id: string, fields: { email: string | null; stripeSessionId: string | null; paidAt: string }) {
    const rows = must(
      await this.db
        .from("orders")
        .update({ ...toOrderRow(fields), status: "paid" })
        .eq("id", id)
        .eq("status", "pending")
        .select("id"),
    );
    return (rows?.length ?? 0) > 0;
  }
  async saveReportIfMissing(id: string, report: OrderRecord["report"], cost: OrderRecord["cost"]) {
    const rows = must(
      await this.db.from("orders").update({ report, cost }).eq("id", id).is("report", null).select("id"),
    );
    return (rows?.length ?? 0) > 0;
  }
  async claimEvent(eventId: string) {
    const res = await this.db.from("webhook_events").insert({ id: eventId });
    if (res.error?.code === "23505") return false; // unique violation: already processed
    must(res);
    return true;
  }
  async incrementDaily(key: string, day: string) {
    return must(await this.db.rpc("increment_daily_counter", { p_key: key, p_day: day })) as number;
  }
  async getCache<T>(key: string) {
    const row = must(
      await this.db.from("api_cache").select("value").eq("key", key).gt("expires_at", new Date().toISOString()).maybeSingle(),
    );
    return (row?.value as T | undefined) ?? null;
  }
  async setCache(key: string, value: unknown, ttlMs: number) {
    must(
      await this.db
        .from("api_cache")
        .upsert({ key, value, expires_at: new Date(Date.now() + ttlMs).toISOString() }),
    );
  }
  async addCoachMessage(msg: CoachMessage) {
    must(
      await this.db.from("coach_messages").insert({
        order_id: msg.orderId,
        role: msg.role,
        text: msg.text,
        stop: msg.stop,
        created_at: msg.createdAt,
      }),
    );
  }
  async listCoachMessages(orderId: string) {
    const rows = must(
      await this.db
        .from("coach_messages")
        .select("order_id, role, text, stop, created_at")
        .eq("order_id", orderId)
        .order("id", { ascending: true }),
    ) as { order_id: string; role: CoachMessage["role"]; text: string; stop: boolean; created_at: string }[];
    return rows.map((r) => ({ orderId: r.order_id, role: r.role, text: r.text, stop: r.stop, createdAt: r.created_at }));
  }
}

// ---------------------------------------------------------------------------

const globalForStore = globalThis as unknown as { __dealcheckStore?: Store };

export function hasSupabase(): boolean {
  return !isOffline() && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** One store per server process (survives dev hot reloads). */
export function getStore(): Store {
  if (!globalForStore.__dealcheckStore) {
    globalForStore.__dealcheckStore = hasSupabase()
      ? new SupabaseStore(
          createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
            auth: { persistSession: false },
          }),
        )
      : new MemoryStore();
  }
  return globalForStore.__dealcheckStore;
}

/** Tests swap in a fresh store. */
export function setStore(store: Store | undefined): void {
  globalForStore.__dealcheckStore = store;
}
