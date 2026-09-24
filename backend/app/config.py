from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    environment: str = 'production'
    admin_user_ids: str = ''
    database_url: str = 'sqlite:///./valuearena.db'
    supabase_url: str = ''
    supabase_publishable_key: str = ''
    supabase_secret_key: str = ''
    storage_bucket: str = 'evaluation-results'
    allowed_origins: str = 'https://valuearena.github.io'
    worker_secret: str = ''
    api_public_url: str = ''
    runpod_api_key: str = ''
    worker_image: str = ''
    runpod_gpu_type: str = 'NVIDIA A40'
    runpod_gpu_count: int = Field(default=1, ge=1, le=1)
    runpod_disk_gb: int = Field(default=100, ge=30, le=1000)
    max_running_jobs: int = Field(default=1, ge=1, le=10)
    scheduler_interval: int = Field(default=10, ge=1, le=60)
    startup_timeout: int = Field(default=900, ge=60)
    heartbeat_timeout: int = Field(default=180, ge=60)
    max_artifact_bytes: int = Field(default=50_000_000, ge=1)
    model_catalog_path: Path = Path('catalog.json')
    local_storage_path: Path = Path('.local-results')
    openrouter_api_key: str = ''
    hf_token: str = ''
    hf_publish_token: str = ''
    hf_results_repo: str = 'invi-bhagyesh/ValueArena'

    @model_validator(mode='after')
    def production_config(self):
        if len(self.worker_secret) < 32:
            raise ValueError('WORKER_SECRET must have at least 32 characters')
        if self.environment not in {'production', 'development', 'test'}:
            raise ValueError('Unknown environment')
        if self.environment == 'production':
            if not self.database_url.startswith('postgresql+psycopg://'):
                raise ValueError('Production requires PostgreSQL')
            if not self.supabase_url.startswith('https://') or not self.supabase_publishable_key or not self.supabase_secret_key:
                raise ValueError('Configure Supabase authentication and storage')
            if not self.api_public_url.startswith('https://'):
                raise ValueError('API_PUBLIC_URL must use HTTPS')
        return self


@lru_cache
def settings():
    return Settings()
