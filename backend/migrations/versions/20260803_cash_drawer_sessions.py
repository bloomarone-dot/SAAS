"""Sessions de caisse : fond d'ouverture et clôture.

Revision ID: 20260803_cash_drawer
Revises: 20260731_menu_item_money
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa


revision = "20260803_cash_drawer"
down_revision = "20260731_menu_item_money"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cash_drawer_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("restaurant_id", sa.String(36), sa.ForeignKey("restaurants.id"), nullable=False, index=True),
        sa.Column("business_date", sa.Date(), nullable=False, index=True),
        sa.Column("opened_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("closed_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("opening_float", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("closing_counted", sa.Numeric(14, 2), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN", index=True),
        sa.Column("opening_notes", sa.String(255), nullable=True),
        sa.Column("closing_notes", sa.String(255), nullable=True),
        sa.Column("opened_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("cash_drawer_sessions")
