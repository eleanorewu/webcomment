(function attachWebCommentRealtimeClient(global) {
  const apiClient = global.WebCommentApiClient || {};
  const SUPABASE_URL = apiClient.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = apiClient.SUPABASE_ANON_KEY || '';
  const WS_URL = `${SUPABASE_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

  const WS = global.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);

  let ws = null;
  let ref = 0;
  let currentJoinRef = '1';
  let heartbeatTimer = null;
  const channels = new Map();
  const joined = new Set();

  function nextRef() { return String(++ref); }

  function send(frame) {
    if (ws && ws.readyState === WS.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }

  function doJoin(topic) {
    const r = nextRef();
    currentJoinRef = r;
    send({ topic, event: 'phx_join', payload: { config: { broadcast: { ack: false, self: false } } }, ref: r, join_ref: r });
    joined.add(topic);
  }

  function connect() {
    if (!WS) return;
    ws = new WS(WS_URL);
    ws.onopen = () => {
      heartbeatTimer = setInterval(() => {
        send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
      }, 30000);
      channels.forEach((_, topic) => doJoin(topic));
    };
    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      joined.clear();
      setTimeout(connect, 5000);
    };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.event !== 'broadcast') return;
      const eventName = msg.payload && msg.payload.event;
      const payload = msg.payload && msg.payload.payload;
      const handlers = channels.get(msg.topic);
      if (handlers && eventName) {
        const fns = handlers.get(eventName);
        if (fns) fns.forEach((fn) => fn(payload));
      }
    };
  }

  const realtimeClient = {
    subscribe(sessionId) {
      const topic = `realtime:session:${sessionId}`;
      if (!channels.has(topic)) channels.set(topic, new Map());
      if (!ws) {
        connect();
      } else if (ws.readyState === WS.OPEN && !joined.has(topic)) {
        doJoin(topic);
      }
      return {
        on(event, fn) {
          const handlers = channels.get(topic);
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(fn);
          return this;
        },
        unsubscribe() { realtimeClient.unsubscribe(sessionId); },
      };
    },

    broadcast(sessionId, event, payload) {
      send({
        topic: `realtime:session:${sessionId}`,
        event: 'broadcast',
        payload: { type: 'broadcast', event, payload },
        ref: nextRef(),
        join_ref: currentJoinRef,
      });
    },

    unsubscribe(sessionId) {
      const topic = `realtime:session:${sessionId}`;
      if (joined.has(topic)) {
        send({ topic, event: 'phx_leave', payload: {}, ref: nextRef(), join_ref: currentJoinRef });
      }
      channels.delete(topic);
      joined.delete(topic);
    },

    disconnect() {
      clearInterval(heartbeatTimer);
      if (ws) { ws.close(); ws = null; }
      channels.clear();
      joined.clear();
    },
  };

  global.WebCommentRealtimeClient = realtimeClient;
})(window);
