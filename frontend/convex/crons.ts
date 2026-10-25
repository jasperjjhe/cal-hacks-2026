import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "buyer retention",
  { hours: 6 },
  internal.buyerMaintenance.retain,
  {},
);
crons.interval(
  "recover interrupted buyer executions",
  { minutes: 1 },
  internal.buyerExecution.recoverStalledAttempts,
  {},
);
export default crons;
