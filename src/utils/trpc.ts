// src/utils/trpc.ts
import type { AppRouter } from "../server/router";
import { createReactQueryHooks, TRPCClientErrorLike, UseTRPCQueryOptions } from "@trpc/react";
import type { inferProcedureOutput, inferProcedureInput } from "@trpc/server";

export const trpc = createReactQueryHooks<AppRouter>();

/**
 * Enum containing all api query paths
 */
export type TQuery = keyof AppRouter["_def"]["queries"]
/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = inferQueryOutput<'hello'>
 */
export type inferQueryOutput<
  TRouteKey extends keyof AppRouter["_def"]["queries"],
> = inferProcedureOutput<AppRouter["_def"]["queries"][TRouteKey]>;

export type inferQueryInput<
  TRouteKey extends keyof AppRouter["_def"]["queries"],
> = inferProcedureInput<AppRouter["_def"]["queries"][TRouteKey]>;

export type inferMutationOutput<
  TRouteKey extends keyof AppRouter["_def"]["mutations"],
> = inferProcedureOutput<AppRouter["_def"]["mutations"][TRouteKey]>;

export type inferMutationInput<
  TRouteKey extends keyof AppRouter["_def"]["mutations"],
> = inferProcedureInput<AppRouter["_def"]["mutations"][TRouteKey]>;

type ClientError = TRPCClientErrorLike<AppRouter>

export type inferUseTRPCQueryOptions<
  TRouteKey extends keyof AppRouter['_def']['queries'],
> = UseTRPCQueryOptions<
  TRouteKey,
  inferQueryInput<TRouteKey>,
  inferQueryOutput<TRouteKey>,
  inferQueryOutput<TRouteKey>,
  ClientError
>