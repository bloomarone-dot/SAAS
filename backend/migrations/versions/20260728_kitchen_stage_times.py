"""Ajoute les horodatages d'etapes cuisine sur kitchen_tickets.

Revision ID: 20260728_kitchen_stage_times
Revises: 20260717_refresh_tokens
Create Date: 2026-07-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260728_kitchen_stage_times"
down_revision = "20260717_refresh_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kitchen_tickets", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("kitchen_tickets", sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("kitchen_tickets", sa.Column("served_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("kitchen_tickets", "served_at")
    op.drop_column("kitchen_tickets", "ready_at")
    op.drop_column("kitchen_tickets", "started_at")
