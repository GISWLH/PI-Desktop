import assert from "node:assert/strict";
import test from "node:test";
import {
  appendTokenSample,
  calculateWindowedTokenRate,
  resolveStreamingOutputTokens,
} from "../src/lib/streaming-token-rate.ts";

test("windowed rate ignores growth outside the sliding window", () => {
  const samples = [
    { atMs: 0, tokens: 0 },
    { atMs: 1_000, tokens: 100 },
    { atMs: 3_000, tokens: 120 },
  ];
  // Window [1000, 3000]: start tokens at t=1000 → 100, end → 120 ⇒ 20 / 2s = 10.
  assert.equal(
    calculateWindowedTokenRate(samples, 3_000, {
      windowMs: 2_000,
      minDurationMs: 200,
    }),
    10,
  );
});

test("zero duration returns undefined", () => {
  assert.equal(
    calculateWindowedTokenRate([{ atMs: 1_000, tokens: 50 }], 1_000, {
      minDurationMs: 200,
    }),
    undefined,
  );
  assert.equal(
    calculateWindowedTokenRate(
      [
        { atMs: 1_000, tokens: 0 },
        { atMs: 1_000, tokens: 80 },
      ],
      1_000,
      { minDurationMs: 0 },
    ),
    undefined,
  );
});

test("burst concentrates rate inside a short recent window", () => {
  const samples = [
    { atMs: 0, tokens: 0 },
    { atMs: 1_800, tokens: 0 },
    { atMs: 2_000, tokens: 400 },
  ];
  // Window [0, 2000] but growth is only in the last 200ms: 400 / 2s = 200
  // when measuring against now with a 2s window that includes the quiet prefix.
  assert.equal(
    calculateWindowedTokenRate(samples, 2_000, {
      windowMs: 2_000,
      minDurationMs: 100,
    }),
    200,
  );
  // Narrower window that starts at the quiet sample: 400 / 0.2s = 2000.
  assert.equal(
    calculateWindowedTokenRate(samples, 2_000, {
      windowMs: 200,
      minDurationMs: 100,
    }),
    2_000,
  );
});

test("stall reports zero after the window advances without growth", () => {
  const samples = [
    { atMs: 0, tokens: 0 },
    { atMs: 500, tokens: 100 },
  ];
  assert.equal(
    calculateWindowedTokenRate(samples, 3_000, {
      windowMs: 2_000,
      minDurationMs: 200,
    }),
    0,
  );
});

test("below min duration stays undefined even with tokens", () => {
  assert.equal(
    calculateWindowedTokenRate(
      [
        { atMs: 0, tokens: 0 },
        { atMs: 50, tokens: 40 },
      ],
      50,
      { windowMs: 2_000, minDurationMs: 200 },
    ),
    undefined,
  );
});

test("appendTokenSample keeps tokens monotonic and drops stale entries", () => {
  const first = appendTokenSample([], { atMs: 1_000, tokens: 10 }, 1_000, 1_000);
  assert.deepEqual(first, [{ atMs: 1_000, tokens: 10 }]);
  const second = appendTokenSample(
    first,
    { atMs: 1_500, tokens: 8 },
    1_500,
    1_000,
  );
  assert.deepEqual(second, [
    { atMs: 1_000, tokens: 10 },
    { atMs: 1_500, tokens: 10 },
  ]);
  const trimmed = appendTokenSample(
    second,
    { atMs: 3_000, tokens: 20 },
    3_000,
    1_000,
  );
  assert.deepEqual(trimmed, [{ atMs: 3_000, tokens: 20 }]);
});

test("resolveStreamingOutputTokens prefers provider usage over text estimate", () => {
  assert.deepEqual(
    resolveStreamingOutputTokens({
      outputTokens: 42,
      content: "a long answer that would estimate differently",
    }),
    { tokens: 42, estimated: false },
  );
  assert.deepEqual(
    resolveStreamingOutputTokens({ content: "abcd" }),
    { tokens: 1, estimated: true },
  );
  assert.deepEqual(resolveStreamingOutputTokens({}), {
    tokens: 0,
    estimated: true,
  });
});
