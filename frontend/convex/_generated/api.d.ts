/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as buyer from "../buyer.js";
import type * as buyer_checkout from "../buyer/checkout.js";
import type * as buyer_core from "../buyer/core.js";
import type * as buyer_council from "../buyer/council.js";
import type * as buyer_eligibility from "../buyer/eligibility.js";
import type * as buyer_highlights from "../buyer/highlights.js";
import type * as buyer_intake from "../buyer/intake.js";
import type * as buyer_inventory from "../buyer/inventory.js";
import type * as buyer_projection from "../buyer/projection.js";
import type * as buyer_timing from "../buyer/timing.js";
import type * as buyer_validation from "../buyer/validation.js";
import type * as buyerAdmin from "../buyerAdmin.js";
import type * as buyerCommands from "../buyerCommands.js";
import type * as buyerEvidence from "../buyerEvidence.js";
import type * as buyerExecution from "../buyerExecution.js";
import type * as buyerJobs from "../buyerJobs.js";
import type * as buyerMaintenance from "../buyerMaintenance.js";
import type * as buyerMutations from "../buyerMutations.js";
import type * as buyerRoles from "../buyerRoles.js";
import type * as buyerWorkflow from "../buyerWorkflow.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as integrations_agentProvider from "../integrations/agentProvider.js";
import type * as integrations_apifyBuyer from "../integrations/apifyBuyer.js";
import type * as integrations_buyerHttp from "../integrations/buyerHttp.js";
import type * as integrations_buyerTools from "../integrations/buyerTools.js";
import type * as integrations_creaoAdapter from "../integrations/creaoAdapter.js";
import type * as integrations_creaoBuyer from "../integrations/creaoBuyer.js";
import type * as integrations_fetchAdapter from "../integrations/fetchAdapter.js";
import type * as integrations_fixtureAgentPort from "../integrations/fixtureAgentPort.js";
import type * as integrations_httpAgentPort from "../integrations/httpAgentPort.js";
import type * as integrations_redditBuyer from "../integrations/redditBuyer.js";
import type * as lib_sellerContracts from "../lib/sellerContracts.js";
import type * as lib_sellerFixtures from "../lib/sellerFixtures.js";
import type * as lib_sellerInventory from "../lib/sellerInventory.js";
import type * as lib_sellerOperator from "../lib/sellerOperator.js";
import type * as lib_sellerValidation from "../lib/sellerValidation.js";
import type * as seller from "../seller.js";
import type * as sellerAgent from "../sellerAgent.js";
import type * as sellerAuth from "../sellerAuth.js";
import type * as sellerInternal from "../sellerInternal.js";
import type * as sellerSeed from "../sellerSeed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  buyer: typeof buyer;
  "buyer/checkout": typeof buyer_checkout;
  "buyer/core": typeof buyer_core;
  "buyer/council": typeof buyer_council;
  "buyer/eligibility": typeof buyer_eligibility;
  "buyer/highlights": typeof buyer_highlights;
  "buyer/intake": typeof buyer_intake;
  "buyer/inventory": typeof buyer_inventory;
  "buyer/projection": typeof buyer_projection;
  "buyer/timing": typeof buyer_timing;
  "buyer/validation": typeof buyer_validation;
  buyerAdmin: typeof buyerAdmin;
  buyerCommands: typeof buyerCommands;
  buyerEvidence: typeof buyerEvidence;
  buyerExecution: typeof buyerExecution;
  buyerJobs: typeof buyerJobs;
  buyerMaintenance: typeof buyerMaintenance;
  buyerMutations: typeof buyerMutations;
  buyerRoles: typeof buyerRoles;
  buyerWorkflow: typeof buyerWorkflow;
  crons: typeof crons;
  http: typeof http;
  "integrations/agentProvider": typeof integrations_agentProvider;
  "integrations/apifyBuyer": typeof integrations_apifyBuyer;
  "integrations/buyerHttp": typeof integrations_buyerHttp;
  "integrations/buyerTools": typeof integrations_buyerTools;
  "integrations/creaoAdapter": typeof integrations_creaoAdapter;
  "integrations/creaoBuyer": typeof integrations_creaoBuyer;
  "integrations/fetchAdapter": typeof integrations_fetchAdapter;
  "integrations/fixtureAgentPort": typeof integrations_fixtureAgentPort;
  "integrations/httpAgentPort": typeof integrations_httpAgentPort;
  "integrations/redditBuyer": typeof integrations_redditBuyer;
  "lib/sellerContracts": typeof lib_sellerContracts;
  "lib/sellerFixtures": typeof lib_sellerFixtures;
  "lib/sellerInventory": typeof lib_sellerInventory;
  "lib/sellerOperator": typeof lib_sellerOperator;
  "lib/sellerValidation": typeof lib_sellerValidation;
  seller: typeof seller;
  sellerAgent: typeof sellerAgent;
  sellerAuth: typeof sellerAuth;
  sellerInternal: typeof sellerInternal;
  sellerSeed: typeof sellerSeed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
