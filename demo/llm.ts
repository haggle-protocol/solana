declare const fetch: any;

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMClient {
  chat(messages: LLMMessage[]): Promise<string>;
}

export class OpenRouterClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://openrouter.ai/api/v1/chat/completions";

  constructor(apiKey: string, model: string = "openrouter/free") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/haggle-protocol",
        "X-Title": "Haggle Protocol Demo",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error: ${res.status} ${err}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "(no response)";
  }
}

export class MockLLMClient implements LLMClient {
  async chat(_messages: LLMMessage[]): Promise<string> {
    return "(LLM disabled - scripted mode)";
  }
}
