import net from "node:net";
import { parseArgs } from "node:util";

/**
 * A TCP proxy that makes a fast local link behave like a mobile one. Every chunk, in each
 * direction, waits half the round trip plus up to `jitter` ms more, and with probability `loss`
 * a further retransmission timeout, the way TCP recovers a lost segment. Order is kept, so a
 * late chunk holds back the ones behind it exactly as head-of-line blocking does on a real link.
 * Works for the HTTP matchmaking call and the WebSocket alike, since it never parses either.
 */
export interface Link {
  /** Round trip, in ms, before jitter. */
  readonly latency: number;
  /** Extra one-way delay drawn evenly from [0, jitter] ms per chunk. */
  readonly jitter: number;
  /** Chance a chunk is lost once and resent. */
  readonly loss: number;
}

/** Retransmission timeout for a lost chunk: TCP's floor of 200 ms or one round trip. */
const rto = (link: Link) => Math.max(200, link.latency);

/**
 * Carries one direction: chunks, then the close, each after its own delay and strictly in order.
 * One queue with one timer on its head, since separate timers with close deadlines can fire out
 * of order and would scramble the byte stream.
 */
function delayed(link: Link, to: net.Socket) {
  const queue: { at: number; run: () => void }[] = [];
  let last = 0;
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    timer = undefined;
    const now = performance.now();
    while (queue.length > 0 && (queue[0] as { at: number }).at <= now + 0.5) {
      const next = queue.shift() as { run: () => void };
      if (!to.destroyed) next.run();
    }
    arm();
  };
  const arm = () => {
    const head = queue[0];
    if (head && !timer) timer = setTimeout(flush, Math.max(0, head.at - performance.now()));
  };
  const later = (run: () => void, lossy: boolean) => {
    let delay = link.latency / 2 + Math.random() * link.jitter;
    if (lossy && Math.random() < link.loss) delay += rto(link);
    last = Math.max(last, performance.now() + delay);
    queue.push({ at: last, run });
    arm();
  };
  return {
    data: (chunk: Buffer) => later(() => to.write(chunk), true),
    end: () => later(() => to.end(), false),
  };
}

/** Starts a proxy on `port` in front of `target`; resolves once it listens. */
export function startNetsim(port: number, target: { host: string; port: number }, link: Link) {
  const server = net.createServer((down) => {
    const up = net.connect(target.port, target.host);
    down.setNoDelay(true);
    up.setNoDelay(true);
    const toUp = delayed(link, up);
    const toDown = delayed(link, down);
    down.on("data", toUp.data);
    up.on("data", toDown.data);
    down.on("end", toUp.end);
    up.on("end", toDown.end);
    down.on("error", () => up.destroy());
    up.on("error", () => down.destroy());
  });
  return new Promise<net.Server>((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "2602" },
      target: { type: "string", default: "localhost:2601" },
      latency: { type: "string", default: "150" },
      jitter: { type: "string", default: "30" },
      loss: { type: "string", default: "0" },
    },
  });
  const [host = "localhost", targetPort = "2601"] = values.target.split(":");
  const link = {
    latency: Number(values.latency),
    jitter: Number(values.jitter),
    loss: Number(values.loss),
  };
  await startNetsim(Number(values.port), { host, port: Number(targetPort) }, link);
  console.log(
    `netsim :${values.port} -> ${values.target}, round trip ${link.latency} ms + up to ${link.jitter * 2} ms jitter, loss ${link.loss}`,
  );
}
