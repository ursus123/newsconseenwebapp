from abc import ABC, abstractmethod
from typing import Optional

from .models import TenantContext, TenantRepositoryResult


class TenantContextRepository(ABC):
    @abstractmethod
    def resolve_context(self, authorization: Optional[str], requested_tenant_id: str, **scope) -> TenantContext:
        raise NotImplementedError

    @abstractmethod
    def list_entities(self, context: TenantContext, entity: str, *, limit: int = 5000) -> TenantRepositoryResult:
        raise NotImplementedError

    @abstractmethod
    def count_entities(self, context: TenantContext, entity: str) -> int:
        raise NotImplementedError

    @abstractmethod
    def get_entity(self, context: TenantContext, entity: str, record_id: str) -> TenantRepositoryResult:
        raise NotImplementedError

    @abstractmethod
    def create_entity(self, context: TenantContext, entity: str, payload: dict) -> TenantRepositoryResult:
        raise NotImplementedError

    @abstractmethod
    def build_operational_snapshot(self, context: TenantContext) -> TenantRepositoryResult:
        raise NotImplementedError

    def build_layered_snapshot(self, context: TenantContext, *, layer: str = "core", family: str | None = None) -> dict:
        raise NotImplementedError
