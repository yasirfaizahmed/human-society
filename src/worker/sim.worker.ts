// Web Worker entry: the simulation runs here, off the UI thread.

import { createSimHost } from './host';
import type { ToWorker } from './protocol';

const scope = self as unknown as {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

const handle = createSimHost((msg, transfer) => scope.postMessage(msg, transfer));
scope.onmessage = (e) => handle(e.data);
// announce that the worker script loaded, so the UI knows background threads work here
scope.postMessage({ type: 'hello' });
