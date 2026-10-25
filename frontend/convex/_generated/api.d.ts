/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as integrations_agentProvider from "../integrations/agentProvider.js";
import type * as integrations_creaoAdapter from "../integrations/creaoAdapter.js";
import type * as integrations_fetchAdapter from "../integrations/fetchAdapter.js";
import type * as integrations_fixtureAgentPort from "../integrations/fixtureAgentPort.js";
import type * as integrations_httpAgentPort from "../integrations/httpAgentPort.js";
import type * as lib_sellerContracts from "../lib/sellerContracts.js";
import type * as lib_sellerFixtures from "../lib/sellerFixtures.js";
import type * as lib_sellerInventory from "../lib/sellerInventory.js";
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
  "integrations/agentProvider": typeof integrations_agentProvider;
  "integrations/creaoAdapter": typeof integrations_creaoAdapter;
  "integrations/fetchAdapter": typeof integrations_fetchAdapter;
  "integrations/fixtureAgentPort": typeof integrations_fixtureAgentPort;
  "integrations/httpAgentPort": typeof integrations_httpAgentPort;
  "lib/sellerContracts": typeof lib_sellerContracts;
  "lib/sellerFixtures": typeof lib_sellerFixtures;
  "lib/sellerInventory": typeof lib_sellerInventory;
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

export declare const components: {};
