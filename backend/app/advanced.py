"""The editable configuration supported by the hosted direct-rating runner."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Seed = Annotated[int, Field(ge=0, le=2**31-1)]

class Options(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Decoding(Options):
    max_tokens: int | None = Field(default=None, ge=1)
    temperature: float | None = Field(default=None, ge=0, le=2)

class Phase(Decoding):
    per_model: dict[str, Decoding] = Field(default_factory=dict)

class Generation(Options):
    response: Phase = Field(default_factory=Phase)
    reflection: Phase = Field(default_factory=Phase)
    direct_rating: Phase = Field(default_factory=Phase)

class DirectRating(Options):
    include_self: bool = True
    scale_min: Literal[1] = 1
    scale_max: Literal[10] = 10
    criterion_aggregation: Literal['mean'] = 'mean'
    scenario_aggregation: Literal['mean'] = 'mean'
    normalization: Literal['zscore_softmax', 'rank_softmax', 'raw_l1', 'minmax_l1', 'positive_centered_l1'] = 'zscore_softmax'
    softmax_temperature: float = Field(default=1, gt=0, le=100)
    eigentrust_alpha: float = Field(default=0, ge=0, le=1)

class Evaluation(Options):
    mode: Literal['direct_rating'] = 'direct_rating'
    direct_rating: DirectRating = Field(default_factory=DirectRating)

class Dataset(Options):
    start: int = Field(default=0, ge=0)
    count: int | None = Field(default=None, ge=1)
    shuffle: bool = False
    shuffle_seed: Seed = 42

class Constitution(Options):
    num_criteria: int | None = Field(default=None, ge=1)

class Inspect(Options):
    cache: bool = False
    phased: bool | None = None
    max_connections: int = Field(default=4, ge=1)
    max_samples: int | None = Field(default=None, ge=1)
    retry_on_error: int = Field(default=0, ge=0, le=5)
    display: Literal['plain', 'none'] = 'plain'

class OpenRouter(Options):
    max_attempts: int = Field(default=4, ge=1, le=10)
    timeout_seconds: float = Field(default=300, gt=0, le=600)
    backoff_base_seconds: float = Field(default=2, ge=0, le=60)
    backoff_cap_seconds: float = Field(default=60, ge=0, le=120)
    max_workers: int = Field(default=10, ge=1)

class Collection(Options):
    failure_policy: Literal['strict', 'omit_invalid_judgments'] = 'omit_invalid_judgments'
    enabled: Literal[True] = True
    sampler_mode: Literal['all_to_all', 'partitioned_random_judge', 'balanced_unique_judge'] = 'all_to_all'
    sampler_seed: Seed = 42
    group_size: int = Field(default=4, ge=1)
    response_redundancy: int = Field(default=1, ge=1)
    generation: Generation = Field(default_factory=Generation)
    inspect: Inspect = Field(default_factory=Inspect)
    openrouter: OpenRouter = Field(default_factory=OpenRouter)

class Bootstrap(Options):
    enabled: bool = True
    n_bootstraps: int = Field(default=200, ge=1)
    random_seed: Seed = 42
    save_trust_matrices: bool = True

class Training(Options):
    enabled: Literal[True] = True
    bootstrap: Bootstrap = Field(default_factory=Bootstrap)

class AdvancedSpec(Options):
    verbose: bool = False
    evaluation: Evaluation = Field(default_factory=Evaluation)
    dataset: Dataset = Field(default_factory=Dataset)
    constitution: Constitution = Field(default_factory=Constitution)
    collection: Collection = Field(default_factory=Collection)
    training: Training = Field(default_factory=Training)

    def validate_panel(self, models, scenarios, scenario_count, criteria):
        direct = self.evaluation.direct_rating
        sampling = self.collection
        if sampling.response_redundancy > len(models) - (not direct.include_self):
            raise ValueError('response_redundancy exceeds eligible judges')
        if sampling.sampler_mode == 'partitioned_random_judge' and not direct.include_self and sampling.group_size >= len(models):
            raise ValueError('Without self judgments, partitioned group_size must be smaller than the panel')
        for phase in self.collection.generation.model_dump().values():
            if set(phase['per_model']) - set(models):
                raise ValueError('Generation per_model keys must match selected model IDs')
        size = len(scenarios) if scenarios else 3000
        count = self.dataset.count or (len(scenarios) if scenarios else scenario_count)
        if self.dataset.start + count > size:
            raise ValueError('Dataset start + count exceeds available scenarios')
        if self.constitution.num_criteria and self.constitution.num_criteria > len(criteria):
            raise ValueError('num_criteria exceeds the supplied constitution')


def merge_options(base, override):
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge_options(base[key], value)
        else:
            base[key] = value
    return base
