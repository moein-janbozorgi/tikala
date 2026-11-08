import type { Instrumentation } from "next";

// Server errors (pages, routes, actions) also go to <data folder>/errors.log, so they survive a restart (lib/error-log.ts).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("./lib/error-log");
  await logError(err, request.method, request.path, context.routeType);
};