import os
from dotenv import load_dotenv

# .env file ko load karne ke liye
load_dotenv()


class Settings:
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")

    # Model ka naam ab .env se aata hai. Code badalne ki zaroorat nahi.
    # Default wohi hai jo aap ke test mein chala tha.
    MODEL_NAME: str = os.getenv("MODEL_NAME", "openai/gpt-4o-mini")


settings = Settings()