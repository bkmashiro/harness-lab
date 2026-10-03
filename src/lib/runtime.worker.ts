import { runInProcess } from './runtime';
import type { RuntimeOptions } from './contracts';

let controller: AbortController | undefined;
let queuedSteering: string[] = [];
let internalSteer: (text: string) => void = (text) => queuedSteering.push(text);

self.onmessage = async ({ data }: MessageEvent) => {
  if (data?.type === 'cancel') { controller?.abort(); return; }
  if (data?.type === 'steer' && typeof data.text === 'string') {
    if (controller) internalSteer(data.text);
    else queuedSteering.push(data.text);
    return;
  }
  if (data?.type !== 'start') return;
  controller = new AbortController();
  try {
    const result = await runInProcess(data.options as RuntimeOptions, {
      signal: controller.signal,
      onEvent: (event) => self.postMessage({ type: 'event', event }),
      getSteering: () => queuedSteering.splice(0),
      onAgentReady: (queue) => { for (const text of queuedSteering.splice(0)) queue(text); internalSteer = queue; },
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
