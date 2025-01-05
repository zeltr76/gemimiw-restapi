import { z } from "npm:zod";

export const chatsSchema = z.object({
  chat: z.string().min(1, '"chat" cannot be empty'),
});

export const rulesSchema = z.object({
  rules: z.string(),
});

export const contextsSchema = z.object({
  context: z.string().min(1, '"context" cannot be empty'),
});
