import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function makeWebSocketClass(calls) {
  return class MockWebSocket {
    static get OPEN() { return 1; }
    constructor(url) {
      this.url = url;
      this.readyState = 1; // OPEN
      this.sent = [];
      calls.push(this);
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    triggerOpen() { this.onopen?.(); }
    triggerMessage(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    triggerClose() { this.onclose?.(); }
  };
}

function loadClient(MockWebSocket) {
  const wsSockets = [];
  const WS = MockWebSocket || makeWebSocketClass(wsSockets);
  const window = {
    WebSocket: WS,
    WebCommentApiClient: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    },
  };
  const context = { window, setInterval, clearInterval, setTimeout };
  vm.runInNewContext(fs.readFileSync('src/shared/realtime-client.js', 'utf8'), context);
  return { client: window.WebCommentRealtimeClient, sockets: wsSockets, WS };
}

test('subscribe connects websocket and sends phx_join on open', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  client.subscribe('session-1');
  assert.equal(sockets.length, 1);
  sockets[0].triggerOpen();
  const join = sockets[0].sent.find((f) => f.event === 'phx_join');
  assert.ok(join, 'phx_join not sent');
  assert.equal(join.topic, 'realtime:session:session-1');
});

test('on handler receives broadcast events from other clients', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  const received = [];
  client.subscribe('session-2').on('COMMENT_CREATED', (p) => received.push(p));
  sockets[0].triggerOpen();
  sockets[0].triggerMessage({
    topic: 'realtime:session:session-2',
    event: 'broadcast',
    payload: { event: 'COMMENT_CREATED', payload: { body: 'hello' } },
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].body, 'hello');
});

test('broadcast sends a broadcast frame to the channel', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  client.subscribe('session-3');
  sockets[0].triggerOpen();
  client.broadcast('session-3', 'PIN_CREATED', { pinId: 'p1' });
  const frame = sockets[0].sent.find((f) => f.event === 'broadcast');
  assert.ok(frame, 'broadcast frame not sent');
  assert.equal(frame.payload.event, 'PIN_CREATED');
  assert.equal(frame.payload.payload.pinId, 'p1');
});

test('unsubscribe sends phx_leave and removes handlers', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  const received = [];
  const sub = client.subscribe('session-4').on('COMMENT_CREATED', (p) => received.push(p));
  sockets[0].triggerOpen();
  sub.unsubscribe();
  const leave = sockets[0].sent.find((f) => f.event === 'phx_leave');
  assert.ok(leave, 'phx_leave not sent');
  sockets[0].triggerMessage({
    topic: 'realtime:session:session-4',
    event: 'broadcast',
    payload: { event: 'COMMENT_CREATED', payload: { body: 'after unsub' } },
  });
  assert.equal(received.length, 0);
});
