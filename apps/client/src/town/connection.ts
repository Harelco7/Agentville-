/**
 * Connects the view to the town. It first tries the live server (WebSocket at /ws). If there is none,
 * for example in the hosted preview, it runs the same simulation right here in the browser with
 * scripted conversations, so the town is always alive.
 */
import { BASE_SPEED, Engine, generateWorld, ScriptedMind, type ClientMessage, type ServerMessage } from '@agentville/core';
import { pushFeed, useTown } from './store';

const DEMO_SEED = 20261115;
const CONNECT_TIMEOUT_MS = 2500;

let socket: WebSocket | null = null;
let started = false;

export function startTown() {
  if (started) return;
  started = true;
  const forceDemo = import.meta.env.MODE === 'artifact' || new URLSearchParams(location.search).has('demo');
  if (forceDemo) return startDemo();
  tryLive().then((ok) => {
    if (!ok) startDemo();
  });
}

function tryLive(): Promise<boolean> {
  return new Promise((resolve) => {
    let opened = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    } catch {
      return resolve(false);
    }
    const timer = setTimeout(() => {
      if (!opened) {
        ws.close();
        resolve(false);
      }
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      opened = true;
      clearTimeout(timer);
      socket = ws;
      useTown.setState({ mode: 'live' });
      resolve(true);
    };
    ws.onerror = () => {
      if (!opened) {
        clearTimeout(timer);
        resolve(false);
      }
    };
    ws.onclose = () => {
      if (!opened) return;
      socket = null;
      // Keep the last picture on screen and try again shortly.
      useTown.setState({ mode: 'connecting' });
      setTimeout(() => tryLive().then((ok) => !ok && setTimeout(() => tryLive(), 3000)), 1500);
    };
    ws.onmessage = (ev) => handle(JSON.parse(ev.data as string) as ServerMessage);
  });
}

function handle(msg: ServerMessage) {
  switch (msg.type) {
    case 'hello':
      useTown.setState({ buildings: msg.buildings, tick: msg.tick, tickAt: performance.now(), feed: msg.feed, status: msg.status });
      // Re-subscribe to the selected agent after a reconnect.
      sendToServer({ type: 'inspect', id: useTown.getState().selected });
      break;
    case 'tick':
      useTown.setState({ tick: msg.tick, tickAt: performance.now() });
      break;
    case 'feed':
      pushFeed(msg.event);
      break;
    case 'agent':
      if (!msg.detail || msg.detail.id === useTown.getState().selected) useTown.setState({ detail: msg.detail });
      break;
    case 'status':
      useTown.setState({ status: msg.status });
      break;
  }
}

function sendToServer(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

// Selecting an agent asks the server for their details.
useTown.subscribe((s, prev) => {
  if (s.selected !== prev.selected && s.mode === 'live') sendToServer({ type: 'inspect', id: s.selected });
});

function startDemo() {
  const engine = new Engine(generateWorld(DEMO_SEED), { mind: new ScriptedMind(), onFeed: pushFeed });
  const status = () => ({
    mind: 'scripted' as const,
    note: 'Demo running in your browser with scripted conversations. The live server writes them with Claude.',
    budget: null,
    speed: useTown.getState().demoSpeed,
  });
  useTown.setState({ mode: 'demo', buildings: engine.world.buildings, tick: engine.view(), tickAt: performance.now(), feed: [...engine.world.feed], status: status() });
  useTown.subscribe((s, prev) => {
    if (s.demoSpeed !== prev.demoSpeed) useTown.setState({ status: status() });
  });

  let last = performance.now();
  let sinceTick = 0;
  let sinceDetail = 0;
  setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    engine.speed = BASE_SPEED * useTown.getState().demoSpeed;
    // At high speed, take smaller steps so walking and talking stay smooth.
    const steps = Math.ceil(useTown.getState().demoSpeed / 20);
    for (let i = 0; i < steps; i++) engine.step(dt / steps);
    sinceTick += dt;
    sinceDetail += dt;
    if (sinceTick >= 0.2) {
      sinceTick = 0;
      useTown.setState({ tick: engine.view(), tickAt: now });
    }
    const { selected } = useTown.getState();
    if (sinceDetail >= 0.5) {
      sinceDetail = 0;
      useTown.setState({ detail: selected ? engine.detail(selected) : null });
    }
  }, 100);
  useTown.subscribe((s, prev) => {
    if (s.selected !== prev.selected) useTown.setState({ detail: s.selected ? engine.detail(s.selected) : null });
  });
}
