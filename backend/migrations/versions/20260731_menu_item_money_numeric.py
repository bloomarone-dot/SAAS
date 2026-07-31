"""Stocke les prix menu en Numeric pour éviter 15000 -> 14999.

Revision ID: 20260731_menu_item_money
Revises: 20260728_kitchen_stage_times
Create Date: 2026-07-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260731_menu_item_money"
down_revision = "20260728_kitchen_stage_times"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "menu_items",
        "price",
        existing_type=sa.Float(),
        type_=sa.Numeric(14, 2),
        existing_nullable=False,
    )
    op.alter_column(
        "menu_items",
        "cost_per_dish",
        existing_type=sa.Float(),
        type_=sa.Numeric(14, 2),
        existing_nullable=False,
        existing_server_default="0",
    )
    # Corrige les dérives float déjà en base (ex. 14999.xx pour 15000).
    op.execute(
        """
        UPDATE menu_items
        SET price = ROUND(price, 0),
            cost_per_dish = ROUND(cost_per_dish, 0)
        """
    )


def downgrade() -> None:
    op.alter_column(
        "menu_items",
        "cost_per_dish",
        existing_type=sa.Numeric(14, 2),
        type_=sa.Float(),
        existing_nullable=False,
    )
    op.alter_column(
        "menu_items",
        "price",
        existing_type=sa.Numeric(14, 2),
        type_=sa.Float(),
        existing_nullable=False,
    )
