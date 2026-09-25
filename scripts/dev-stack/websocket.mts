// 최소 WebSocket 서버 (RFC 6455): 핸드셰이크 + 텍스트 프레임 + ping/pong/close. 라이브러리 없이 개발 스택 전용.
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODE = { continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa } as const;

export interface WebSocketConnection {
  send: (text: string) => void;
  close: () => void;
  onMessage: (handler: (text: string) => void) => void;
  onClose: (handler: () => void) => void;
}

function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

export function acceptWebSocket(req: IncomingMessage, socket: Duplex): WebSocketConnection | null {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string') {
    socket.destroy();
    return null;
  }
  const accept = createHash('sha1')
    .update(key + GUID)
    .digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  const messageHandlers: ((text: string) => void)[] = [];
  const closeHandlers: (() => void)[] = [];
  let buffer = Buffer.alloc(0);
  let fragments: Buffer[] = [];
  let closed = false;

  const write = (opcode: number, payload: Buffer) => {
    if (!closed) socket.write(frame(opcode, payload));
  };
  const finish = () => {
    if (closed) return;
    closed = true;
    socket.end();
    for (const handler of closeHandlers) handler();
  };

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const first = buffer[0]!;
      const second = buffer[1]!;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = (second & 0x80) !== 0;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (mask) for (let index = 0; index < payload.length; index += 1) payload[index]! ^= mask[index % 4]!;
      buffer = buffer.subarray(offset + length);

      const opcode = first & 0x0f;
      if (opcode === OPCODE.close) {
        write(OPCODE.close, Buffer.alloc(0));
        finish();
        return;
      }
      if (opcode === OPCODE.ping) write(OPCODE.pong, payload);
      if (opcode === OPCODE.text || opcode === OPCODE.continuation) {
        fragments.push(payload);
        if ((first & 0x80) !== 0) {
          const text = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          for (const handler of messageHandlers) handler(text);
        }
      }
      // 바이너리(broadcast)는 쓰지 않으므로 무시한다
    }
  });
  socket.on('close', finish);
  socket.on('error', finish);

  return {
    send: (text) => write(OPCODE.text, Buffer.from(text, 'utf8')),
    close: () => {
      write(OPCODE.close, Buffer.alloc(0));
      finish();
    },
    onMessage: (handler) => void messageHandlers.push(handler),
    onClose: (handler) => void closeHandlers.push(handler),
  };
}
