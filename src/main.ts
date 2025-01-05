import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import "jsr:@std/dotenv/load";
import { v3, NAMESPACE_DNS } from "jsr:@std/uuid";
import { supabase } from "./db/supabase.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import {
  sessionUUIDValidator,
  chatsCreateValidator,
  rulesCreateValidator,
  contextCreateValidator,
} from "./middlewares.ts";

const genAI = new GoogleGenerativeAI(
  Deno.env.get("GEMIMIW_GEMINI_API_KEY") ?? ""
);

const API_VERSION = "1.0";
const PORT = 6969;

let TIMES_ABOUT_OPENED_SINCE_RUN = 0;

const app = new Hono();

app.use(cors());

app.get(`/${API_VERSION}/about`, (c: Context) => {
  const status = 200;

  return c.json(
    {
      status: status,
      author: "Richard Erwin Manampiring",
      times_called: (TIMES_ABOUT_OPENED_SINCE_RUN += 1),
    },
    status
  );
});

app.post(`/${API_VERSION}/sessions/create`, async (c: Context) => {
  const data = new TextEncoder().encode(performance.now().toString());

  try {
    const session_uuid = await v3.generate(NAMESPACE_DNS, data);

    const { data: sessionData, error: sessionsError } = await supabase
      .from("sessions")
      .insert({ uuid: session_uuid })
      .select()
      .single();

    if (sessionsError) {
      throw sessionsError;
    }

    const status = 201;
    return c.json(
      {
        status: status,
        data: sessionData,
      },
      status
    );
  } catch (error) {
    const status = 500;
    return c.json(
      {
        status: status,
        error: error,
      },
      status
    );
  }
});

app.get(
  `/${API_VERSION}/sessions/:session_uuid`,
  sessionUUIDValidator,
  async (c: Context) => {
    try {
      const session_uuid = c.get("session_uuid");

      const { data, error } = await supabase
        .from("chats")
        .select("id, chat, created_at, responses(id, response, created_at)")
        .eq("session_uuid", session_uuid);

      if (error) {
        throw error;
      }

      const result = data.map((chat) => ({
        chat_id: chat.id,
        chat: chat.chat,
        chat_created_at: chat.created_at,
        response_id: chat.responses[0].id ?? null,
        response: chat.responses[0].response ?? null,
        response_created_at: chat.responses[0].created_at ?? null,
      }));

      const status = 200;
      return c.json(
        {
          status: status,
          data: result,
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.post(
  `/${API_VERSION}/sessions/:session_uuid/chats/create`,
  sessionUUIDValidator,
  chatsCreateValidator,
  async (c: Context) => {
    try {
      const body = c.get("body");
      const session_uuid = c.get("session_uuid");
      const { chat } = body;

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("rules")
        .eq("uuid", session_uuid)
        .single();

      if (sessionError) {
        throw sessionError;
      }

      const rules = sessionData.rules;

      const { data: contextsData, error: contextsError } = await supabase
        .from("contexts")
        .select("context")
        .eq("session_uuid", session_uuid);

      if (contextsError) {
        throw contextsError;
      }

      const contexts = contextsData.map((c) => c.context).join("; ");

      const { data: chatData, error: chatError } = await supabase
        .from("chats")
        .insert({ session_uuid: session_uuid, chat: chat })
        .select("id, chat")
        .single();

      if (chatError) {
        throw chatError;
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: `
        - You are a language expert fluent in Bahasa Indonesia and English. Respond to all questions in Bahasa Indonesia or English. If the user is giving Englih prompt respond it in English, if the user is giving Indonesia prompt respond it in Bahasa Indonesia. 
        - Always follow the rules defined here: ${rules} and give response based on the context here: ${contexts}. 
        - If there are no context, give response based on rules only and say that no context found. Always answer based on the latest context and do not generate your own context or speculate. Do not respond like "based on the contexts", just say "based on the information i have"`,
      });

      const generationConfig = {
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
      };

      const chatSession = model.startChat({
        generationConfig,
      });

      const prompt = chatData.chat;

      const geminiResponse = await chatSession.sendMessage(prompt);

      const { data: responseData, error: responseError } = await supabase
        .from("responses")
        .insert({
          response: geminiResponse.response.text(),
          chat_id: chatData.id,
        })
        .select("response")
        .single();

      if (responseError) {
        throw responseError;
      }

      const status = 201;
      return c.json(
        {
          status: status,
          data: {
            chat: chatData.chat,
            response: responseData.response,
          },
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.get(
  `/${API_VERSION}/sessions/:session_uuid/rules`,
  sessionUUIDValidator,
  async (c: Context) => {
    try {
      const session_uuid = c.get("session_uuid");

      const { data, error } = await supabase
        .from("sessions")
        .select()
        .eq("uuid", session_uuid)
        .single();

      if (error) {
        throw error;
      }

      const status = 200;
      return c.json(
        {
          status: status,
          data: {
            uuid: data.uuid,
            rules: data.rules,
          },
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.post(
  `/${API_VERSION}/sessions/:session_uuid/rules/create`,
  sessionUUIDValidator,
  rulesCreateValidator,
  async (c: Context) => {
    try {
      const body = await c.get("body");
      const session_uuid = c.get("session_uuid");
      const { rules } = body;

      const { data, error } = await supabase
        .from("sessions")
        .update({ rules: rules })
        .eq("uuid", session_uuid)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const status = 201;
      return c.json(
        {
          status: status,
          data: {
            uuid: data.uuid,
            rules: data.rules,
          },
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.get(
  `/${API_VERSION}/sessions/:session_uuid/contexts`,
  sessionUUIDValidator,
  async (c: Context) => {
    try {
      const session_uuid = c.get("session_uuid");

      const { data, error } = await supabase
        .from("contexts")
        .select()
        .eq("session_uuid", session_uuid);

      if (error) {
        throw error;
      }

      const status = 200;
      return c.json(
        {
          status: status,
          data: {
            contexts: data,
          },
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.post(
  `/${API_VERSION}/sessions/:session_uuid/contexts/create`,
  sessionUUIDValidator,
  contextCreateValidator,
  async (c: Context) => {
    try {
      const body = await c.get("body");
      const session_uuid = c.get("session_uuid");
      const { context } = body;

      const { data, error } = await supabase
        .from("contexts")
        .insert({ session_uuid: session_uuid, context: context })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const status = 201;
      return c.json(
        {
          status: status,
          data: {
            context: data,
          },
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.put(
  `/${API_VERSION}/sessions/:session_uuid/rules/edit`,
  sessionUUIDValidator,
  rulesCreateValidator,
  async (c: Context) => {
    try {
      const body = await c.get("body");
      const session_uuid = c.get("session_uuid");
      const { rules } = body;

      const { data, error } = await supabase
        .from("sessions")
        .update({ rules: rules })
        .eq("uuid", session_uuid)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const status = 201;
      return c.json(
        {
          status: status,
          data: {
            uuid: data.uuid,
            rules: data.rules,
          },
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.patch(
  `/${API_VERSION}/sessions/:session_uuid/contexts/:context_id/edit`,
  sessionUUIDValidator,
  contextCreateValidator,
  async (c: Context) => {
    try {
      const body = await c.get("body");
      const session_uuid = c.get("session_uuid");
      const context_id = c.req.param("context_id");
      const parsed_context_id = Number(context_id);
      const { context } = body;

      const { data, error } = await supabase
        .from("contexts")
        .update({ session_uuid: session_uuid, context: context })
        .eq("id", parsed_context_id)
        .eq("session_uuid", session_uuid)
        .select()
        .single();

      if (!data || data.length === 0) {
        const status = 404;
        return c.json(
          {
            status: status,
          },
          status
        );
      }

      if (error) {
        throw error;
      }

      const status = 201;
      return c.json(
        {
          status: status,
          data: {
            context: data,
          },
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.delete(
  `/${API_VERSION}/sessions/:session_uuid/contexts/:context_id/delete`,
  sessionUUIDValidator,
  async (c: Context) => {
    try {
      const session_uuid = c.get("session_uuid");
      const context_id = c.req.param("context_id");
      const parsed_context_id = Number(context_id);

      const { data, error } = await supabase
        .from("contexts")
        .delete()
        .eq("id", parsed_context_id)
        .eq("session_uuid", session_uuid)
        .select();

      if (!data || data.length === 0) {
        const status = 404;
        return c.json(
          {
            status: status,
          },
          status
        );
      }

      if (error) {
        console.log(error);
        throw error;
      }

      const status = 200;
      return c.json(
        {
          status: status,
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.delete(
  `/${API_VERSION}/sessions/:session_uuid/delete`,
  sessionUUIDValidator,
  async (c: Context) => {
    try {
      const session_uuid = c.get("session_uuid");

      const { data, error } = await supabase
        .from("sessions")
        .delete()
        .eq("uuid", session_uuid)
        .select();

      if (!data || data.length === 0) {
        const status = 404;
        return c.json(
          {
            status: status,
          },
          status
        );
      }

      if (error) {
        throw error;
      }

      const status = 200;
      return c.json(
        {
          status: status,
        },
        status
      );
    } catch (error) {
      const status = 500;
      return c.json(
        {
          status: status,
          error: error,
        },
        status
      );
    }
  }
);

app.notFound((c) => {
  const status = 404;

  return c.json(
    {
      status: status,
      message: "Not Found",
    },
    status
  );
});

Deno.serve({ port: PORT }, app.fetch);
