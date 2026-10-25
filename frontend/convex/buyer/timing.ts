// MVP waits approved for CREAO's default model; provider/tool caps stay unchanged.
export const buyerTiming = {
  creaoMs: 90000,
  runMs: 480000,
  pollMs: 15000,
  councilEndMs: { bidding: 30000, brief: 120000, advocacy: 150000, reply: 180000, adjudication: 270000 },
} as const;
