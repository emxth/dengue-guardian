"""Validated H411-inspired dengue investigation and environmental report models."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


CaseStatus = Literal["Suspected", "Confirmed", "Not confirmed", "Pending verification", "Not applicable"]
Assessment = Literal["Yes", "No", "Not assessed"]
Severity = Literal["Low", "Medium", "High", "Not assessed"]


class ContactFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    contact_type: Literal["Household", "Other relevant"] = "Household"
    contact_reference: str = Field(default="", max_length=100)
    age_years: int | None = Field(default=None, ge=0, le=120)
    date_seen: date | None = None
    observation: str = Field(default="", max_length=1000)
    fever_reported: bool | None = None
    symptoms: str = Field(default="", max_length=500)

    @field_validator("date_seen", mode="before")
    @classmethod
    def blank_date_is_missing(cls, value):
        return None if value == "" else value


class BreedingSiteFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    site_type: Literal[
        "Water storage", "Discarded container", "Tire", "Coconut shell",
        "Drain or gutter", "Waste area", "Other",
    ]
    location_description: str = Field(min_length=1, max_length=300)
    standing_water: Assessment = "Not assessed"
    count: int | None = Field(default=None, ge=0, le=10000)
    larvae_pupae: Assessment = "Not assessed"
    severity: Severity = "Not assessed"
    source_corrected: bool | None = None
    waste_or_blockage: bool | None = None
    observation: str = Field(default="", max_length=1000)


class CaseInvestigation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    investigation_status: CaseStatus
    disease_onset_date: date | None = None
    hospital_name: str = Field(default="", max_length=200)
    discharge_date: date | None = None
    laboratory_findings: str = Field(default="", max_length=1000)
    case_outcome: Literal[
        "Ongoing", "Recovered", "Deceased", "Unknown", "Not applicable",
    ] = "Unknown"
    isolation_or_advice: str = Field(default="", max_length=1000)

    @field_validator("disease_onset_date", "discharge_date", mode="before")
    @classmethod
    def blank_dates_are_missing(cls, value):
        return None if value == "" else value


class InspectionReportInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    client_submission_id: UUID
    inspection_date: date | None = None
    inspection_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    patient_case_reference: str = Field(default="", max_length=100)
    case_investigation: CaseInvestigation = Field(default_factory=CaseInvestigation)
    household_contacts_investigated: bool | None = None
    other_contacts_investigated: bool | None = None
    contacts: list[ContactFinding] = Field(default_factory=list, max_length=100)
    environmental_assessment_complete: bool = False
    breeding_sites: list[BreedingSiteFinding] = Field(default_factory=list, max_length=100)
    waste_or_storage_observations: str = Field(default="", max_length=2000)
    actions_taken: str = Field(default="", max_length=2000)
    breeding_sources_corrected: bool | None = None
    prevention_education_provided: bool | None = None
    follow_up_required: bool = False
    follow_up_date: date | None = None
    follow_up_notes: str = Field(default="", max_length=2000)
    additional_notes: str = Field(default="", max_length=3000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("inspection_date", "follow_up_date", mode="before")
    @classmethod
    def blank_dates_are_missing(cls, value):
        return None if value == "" else value

    @field_validator("inspection_time", mode="before")
    @classmethod
    def blank_time_is_missing(cls, value):
        return None if value == "" else value


