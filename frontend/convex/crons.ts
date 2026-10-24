import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "buyer retention",
  { hours: 6 },
  internal.buyerMaintenance.retain,
  {},
);
export default crons;
