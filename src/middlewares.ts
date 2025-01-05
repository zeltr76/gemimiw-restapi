import { createMiddleware } from "hono/factory";
import { v3 } from "jsr:@std/uuid";
import { supabase } from "./db/supabase.ts";
import { chatsSchema, rulesSchema, contextsSchema } from "./zod/schemas.ts";

export const sessionUUIDValidator = createMiddleware(async (c, next) => {
  const session_uuid = c.req.param("session_uuid");

  if (!session_uuid) {
    const status = 400;
    return c.json(
      {
        status: status,
        message: "Session UUID is required",
      },
      status
    );
  }

  if (!v3.validate(session_uuid)) {
    const status = 400;
    return c.json(
      {
        status: status,
        message: "Invalid session",
      },
      status
    );
  }

  const { data: sessionData, error: sessionsError } = await supabase
    .from("sessions")
    .select()
    .eq("uuid", session_uuid)
    .single();

  if (!sessionData || sessionData.length === 0) {
    const status = 404;
    return c.json(
      {
        status: status,
        message: "Session not found",
      },
      status
    );
  }

  if (sessionsError) {
    const status = 500;
    return c.json(
      {
        status: status,
        error: sessionsError,
      },
      status
    );
  }

  c.set("session_uuid", session_uuid);

  await next();
});

export const chatsCreateValidator = createMiddleware(async (c, next) => {
  try {
    const body = await c.req.json();

    const parsed = chatsSchema.safeParse(body);
    if (!parsed.success) {
      const status = 400;
      return c.json(
        {
          status: status,
          message: parsed.error.issues
            .map(
              (issue) =>
                `"${issue.path.join(".")}": ${issue.message.toLowerCase()}`
            )
            .join(", "),
        },
        status
      );
    }

    c.set("body", parsed.data);
  } catch (_error) {
    const status = 400;
    return c.json(
      {
        status: status,
        message: '"body" must be an object',
      },
      status
    );
  }

  await next();
});

export const rulesCreateValidator = createMiddleware(async (c, next) => {
  try {
    const body = await c.req.json();

    const parsed = rulesSchema.safeParse(body);
    if (!parsed.success) {
      const status = 400;
      return c.json(
        {
          status: status,
          message: parsed.error.issues
            .map(
              (issue) =>
                `"${issue.path.join(".")}": ${issue.message.toLowerCase()}`
            )
            .join(", "),
        },
        status
      );
    }

    c.set("body", parsed.data);
  } catch (_error) {
    const status = 400;
    return c.json(
      {
        status: status,
        message: '"body" must be an object',
      },
      status
    );
  }

  await next();
});

export const contextCreateValidator = createMiddleware(async (c, next) => {
  try {
    const body = await c.req.json();

    const parsed = contextsSchema.safeParse(body);
    if (!parsed.success) {
      const status = 400;
      return c.json(
        {
          status: status,
          message: parsed.error.issues
            .map(
              (issue) =>
                `"${issue.path.join(".")}": ${issue.message.toLowerCase()}`
            )
            .join(", "),
        },
        status
      );
    }

    c.set("body", parsed.data);
  } catch (_error) {
    const status = 400;
    return c.json(
      {
        status: status,
        message: '"body" must be an object',
      },
      status
    );
  }

  await next();
});
