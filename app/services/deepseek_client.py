import asyncio

from openai import OpenAI


class DeepSeekClient:
    def __init__(self, api_key: str, model: str, base_url: str) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def translate(self, system_prompt: str, user_prompt: str, api_key: str | None = None) -> str:
        token = (api_key or self.api_key or "").strip()
        if not token:
            raise ValueError("缺少 DEEPSEEK_API_KEY 环境变量")

        def _call() -> str:
            client = OpenAI(api_key=token, base_url=self.base_url)
            resp = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
            )
            content = resp.choices[0].message.content or ""
            return content.strip()

        return await asyncio.to_thread(_call)
