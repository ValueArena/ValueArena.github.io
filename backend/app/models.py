from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, SecretStr, StringConstraints, model_validator

from .advanced import AdvancedSpec

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
Criterion = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
ModelID = Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_-]{1,64}$')]


class CustomModel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: ModelID
    provider: Literal['openrouter', 'huggingface']
    repo_id: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.:-]+$', max_length=200)]
    kind: Literal['base', 'lora'] = 'base'
    revision: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]{1,100}$')] = 'main'
    subfolder: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_./-]{0,200}$')] = ''
    base_model_id: Annotated[str, StringConstraints(pattern=r'^([a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+)?$')] = ''
    base_revision: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]{1,100}$')] = 'main'

    @model_validator(mode='after')
    def valid_adapter(self):
        if self.subfolder and any(p in {'', '.', '..'} for p in self.subfolder.split('/')):
            raise ValueError('Invalid adapter subfolder')
        if self.provider == 'huggingface' and self.kind == 'lora' and not self.base_model_id:
            raise ValueError('LoRA adapters need a base model repository')
        return self


class EvaluationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    advanced_spec: AdvancedSpec = Field(default_factory=AdvancedSpec)
    funding: Literal['service', 'own_keys'] = 'service'
    openrouter_key: SecretStr = Field(default=SecretStr(''), max_length=512)
    hf_token: SecretStr = Field(default=SecretStr(''), max_length=512, exclude=True)
    runpod_key: SecretStr = Field(default=SecretStr(''), max_length=512)
    gpu_type: Literal['NVIDIA A40', 'NVIDIA RTX A6000', 'NVIDIA GeForce RTX 4090', 'NVIDIA A100 80GB PCIe', 'NVIDIA H100 80GB HBM3'] = 'NVIDIA A40'
    disk_gb: int = Field(default=100, ge=50, le=1000)
    engine: Literal['native', 'inspect'] = 'native'
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    models: list[ModelID] = Field(min_length=2)
    criteria: list[Criterion] = Field(min_length=1)
    constitution_name: Annotated[str, StringConstraints(max_length=100)] = 'Custom'
    custom_models: list[CustomModel] = Field(default_factory=list)
    scenario_source: Literal['airiskdilemmas', 'custom'] = 'airiskdilemmas'
    scenario_count: int = Field(default=200, ge=1, le=3000)
    visibility: Literal['private', 'public'] = 'private'
    scenarios: list[Text] = Field(default_factory=list)
    max_runtime_seconds: int | None = Field(default=None, ge=300)
    response_tokens: int | None = Field(default=None, ge=1)
    seed: int = Field(default=42, ge=0, le=2**31-1)

    @model_validator(mode='after')
    def unique_inputs(self):
        if self.scenarios:
            self.scenario_source = 'custom'
        if self.scenario_source == 'custom' and not self.scenarios:
            raise ValueError('Supply at least one custom scenario')
        ids = [m.id for m in self.custom_models]
        if len(set(ids)) != len(ids) or not set(ids).issubset(self.models):
            raise ValueError('Custom model IDs must be unique and selected')
        for key in ('models', 'scenarios', 'criteria'):
            values = getattr(self, key)
            if len(values) != len(set(values)):
                raise ValueError(f'{key} must be unique')
        if sum(map(len, self.scenarios)) > 400_000:
            raise ValueError('Total scenario text exceeds 400,000 characters')
        self.advanced_spec.validate_panel(self.models, self.scenarios, self.scenario_count, self.criteria)
        return self


class VisibilityUpdate(BaseModel):
    visibility: Literal['private', 'public']


class WorkerUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    log: Annotated[str, StringConstraints(max_length=64000)] = ''
    stage: Annotated[str, StringConstraints(pattern=r'^(starting|collecting|analyzing|uploading)$')]


class WorkerFinish(BaseModel):
    model_config = ConfigDict(extra='forbid')
    success: bool
    # Generic codes, never provider errors or traces that could contain credentials.
    error_code: Annotated[str, StringConstraints(pattern=r'^[a-z_]{1,64}$')] | None = None
