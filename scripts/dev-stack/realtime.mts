// Realtime 흉내 (/realtime/v1/websocket): Phoenix 채널 프로토콜로 postgres_changes 만 지원한다.
// DB 트리거가 보낸 NOTIFY(dev_stack_changes)를 구독 조건(event·schema·table·filter eq)에 맞는 채널로 전달한다.
// 개발 전용이라 행 단위 권한(RLS) 검사는 하지 않는다.
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import pg from 'pg';

import { acceptWebSocket, type WebSocketConnection } from './websocket.mts';

interface Binding {
  id: number;
  event: string;
  schema: string;
  table?: string;
  filter?: string;
}

interface Client {
  connection: WebSocketConnection;
  /** realtime-js v2 는 배열, v1 은 객체 형식 */
  format: 'array' | 'object';
  channels: Map<string, { joinRef: unknown; bindings: Binding[] }>;
}

interface Change {
  schema: string;
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
  commit_timestamp: string;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

function matches(binding: Binding, change: Change): boolean {
  if (binding.schema !== change.schema) return false;
  if (binding.table && binding.table !== '*' && binding.table !== change.table) return false;
  if (binding.event !== '*' && binding.event.toUpperCase() !== change.type) return false;
  if (!binding.filter) return true;
  const eq = /^(\w+)=eq\.(.+)$/.exec(binding.filter);
  if (!eq) return true;
  const row = change.record ?? change.old_record ?? {};
  return String(row[eq[1]!]) === eq[2];
}

export async function createRealtime(connectionString: string) {
  const clients = new Set<Client>();
  let nextBindingId = 1;

  const send = (
    client: Client,
    joinRef: unknown,
    ref: unknown,
    topic: unknown,
    event: string,
    payload: unknown,
  ) =>
    client.connection.send(
      JSON.stringify(
        client.format === 'array'
          ? [joinRef, ref, topic, event, payload]
          : { join_ref: joinRef, ref, topic, event, payload },
      ),
    );

  function handle(client: Client, raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    let joinRef: unknown, ref: unknown, topic: unknown, event: unknown, payload: unknown;
    if (Array.isArray(message)) {
      client.format = 'array';
      [joinRef, ref, topic, event, payload] = message;
    } else if (message && typeof message === 'object') {
      client.format = 'object';
      ({ join_ref: joinRef, ref, topic, event, payload } = message as Record<string, unknown>);
    } else return;
    const ok = (response: unknown = {}) =>
      send(client, joinRef, ref, topic, 'phx_reply', { status: 'ok', response });

    if (event === 'phx_join' && typeof topic === 'string') {
      const config = (payload as { config?: { postgres_changes?: unknown } } | null)?.config
        ?.postgres_changes;
      const items = (Array.isArray(config) ? config : []).filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object',
      );
      const bindings: Binding[] = items.map((item) => ({
        id: nextBindingId++,
        event: text(item.event) ?? '*',
        schema: text(item.schema) ?? 'public',
        table: text(item.table),
        filter: text(item.filter),
      }));
      client.channels.set(topic, { joinRef, bindings });
      ok({ postgres_changes: bindings });
      send(client, joinRef, null, topic, 'system', {
        status: 'ok',
        message: 'Subscribed to PostgreSQL',
        extension: 'postgres_changes',
        channel: topic.replace(/^realtime:/, ''),
      });
      return;
    }
    if (event === 'phx_leave' && typeof topic === 'string') client.channels.delete(topic);
    if (ref !== null && ref !== undefined) ok();
  }

  function broadcast(change: Change): void {
    for (const client of clients) {
      for (const [topic, channel] of client.channels) {
        const ids = channel.bindings
          .filter((binding) => matches(binding, change))
          .map((binding) => binding.id);
        if (ids.length === 0) continue;
        send(client, channel.joinRef, null, topic, 'postgres_changes', {
          ids,
          data: { ...change, columns: [], errors: null },
        });
      }
    }
  }

  const listener = new pg.Client({ connectionString });
  await listener.connect();
  await listener.query('listen dev_stack_changes');
  listener.on('notification', (notification) => {
    try {
      if (notification.payload) broadcast(JSON.parse(notification.payload) as Change);
    } catch {
      // 잘못된 알림은 무시
    }
  });

  return {
    upgrade(req: IncomingMessage, socket: Duplex): void {
      const connection = acceptWebSocket(req, socket);
      if (!connection) return;
      const client: Client = { connection, format: 'array', channels: new Map() };
      clients.add(client);
      connection.onMessage((raw) => handle(client, raw));
      connection.onClose(() => clients.delete(client));
    },
    async close(): Promise<void> {
      for (const client of clients) client.connection.close();
      await listener.end().catch(() => undefined);
    },
  };
}
