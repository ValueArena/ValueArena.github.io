"""Validated presentation data. Raw worker logs and configuration are never public."""
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

class RatingRow(BaseModel):
    model_config = ConfigDict(extra='ignore')
    model_index: int
    model_name: str = Field(max_length=200)
    elo_mean: float = Field(allow_inf_nan=False)
    elo_std: float | None = Field(default=None, allow_inf_nan=False)
    elo_ci_lower: float | None = Field(default=None, allow_inf_nan=False)
    elo_ci_upper: float | None = Field(default=None, allow_inf_nan=False)

class TranscriptRow(BaseModel):
    model_config = ConfigDict(extra='ignore')
    scenario: str = Field(max_length=8000)
    scenario_index: int
    model: str = Field(max_length=200)
    judge: str = Field(max_length=200)
    response: str = Field(max_length=100000)
    reflection: str = Field(default='', max_length=100000)
    judgment: str = Field(default='', max_length=100000)

class ResultSummary(BaseModel):
    model_config = ConfigDict(extra='forbid')
    summary: list[RatingRow] = Field(min_length=1)
    record_count: int = Field(ge=0)
    batch_count: int = Field(ge=0)

class ResultBatch(BaseModel):
    records: list[TranscriptRow] = Field(min_length=1, max_length=25)
