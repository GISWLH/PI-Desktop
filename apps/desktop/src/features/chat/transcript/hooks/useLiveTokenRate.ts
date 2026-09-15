import { useEffect, useRef, useState } from "react";
import {
  appendTokenSample,
  calculateWindowedTokenRate,
  resolveStreamingOutputTokens,
  type TokenRateSample,
} from "../../../../lib/streaming-token-rate";

export type LiveTokenRate = {
  tokensPerSecond: number | undefined;
  estimated: boolean;
};

const IDLE_RATE: LiveTokenRate = {
  tokensPerSecond: undefined,
  estimated: false,
};

/**
 * Sample the active turn's output tokens on a short interval and expose a
 * sliding-window tok/s reading for the transcript stream-health strip.
 */
export function useLiveTokenRate(input: {
  active: boolean;
  content?: string;
  thinking?: string;
  outputTokens?: number;
  tickMs?: number;
}): LiveTokenRate {
  const [rate, setRate] = useState<LiveTokenRate>(IDLE_RATE);
  const samplesRef = useRef<TokenRateSample[]>([]);

  useEffect(() => {
    if (!input.active) {
      samplesRef.current = [];
      setRate(IDLE_RATE);
      return;
    }

    const sample = () => {
      const nowMs = Date.now();
      const resolved = resolveStreamingOutputTokens({
        outputTokens: input.outputTokens,
        content: input.content,
        thinking: input.thinking,
      });
      samplesRef.current = appendTokenSample(
        samplesRef.current,
        { atMs: nowMs, tokens: resolved.tokens },
        nowMs,
      );
      setRate({
        tokensPerSecond: calculateWindowedTokenRate(
          samplesRef.current,
          nowMs,
        ),
        estimated: resolved.estimated,
      });
    };

    sample();
    const timer = window.setInterval(sample, input.tickMs ?? 250);
    return () => window.clearInterval(timer);
  }, [
    input.active,
    input.content,
    input.thinking,
    input.outputTokens,
    input.tickMs,
  ]);

  return input.active ? rate : IDLE_RATE;
}
