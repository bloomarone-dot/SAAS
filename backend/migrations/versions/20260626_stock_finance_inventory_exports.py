"""Stock inventory justification, transfer cost, and tax rates.

Revision ID: 20260626_stock_finance
Revises:
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260626_stock_finance"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stock_movements", sa.Column("production_cost", sa.Numeric(14, 2), nullable=True))
    op.add_column("inventory_details", sa.Column("value_gap", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("inventory_details", sa.Column("exceeds_tolerance", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("inventory_details", sa.Column("tolerance_threshold", sa.Numeric(14, 3), nullable=False, server_default="0"))
    op.add_column("inventory_details", sa.Column("justification", sa.Text(), nullable=True))
    op.add_column("expenses", sa.Column("tax_rate", sa.Numeric(6, 3), nullable=False, server_default="0"))
    op.add_column("revenues", sa.Column("tax_rate", sa.Numeric(6, 3), nullable=False, server_default="0"))

    op.create_index("idx_stock_movements_restaurant_date", "stock_movements", ["restaurant_id", "movement_date"])
    op.create_index("idx_stock_movements_product_status", "stock_movements", ["product_id", "status"])
    op.create_index("idx_stock_movements_source_depot", "stock_movements", ["source_depot_id"])
    op.create_index("idx_stock_movements_destination_depot", "stock_movements", ["destination_depot_id"])
    op.create_index("idx_inventory_details_inventory", "inventory_details", ["inventory_id"])
    op.create_index("idx_inventory_details_product", "inventory_details", ["product_id"])
    op.create_index("idx_inventory_details_restaurant_inventory", "inventory_details", ["restaurant_id", "inventory_id"])
    op.create_index("idx_expenses_restaurant_date", "expenses", ["restaurant_id", "expense_date"])
    op.create_index("idx_expenses_restaurant_status", "expenses", ["restaurant_id", "status"])
    op.create_index("idx_expenses_payment_status", "expenses", ["payment_status"])
    op.create_index("idx_payments_restaurant_date", "payments", ["restaurant_id", "payment_date"])
    op.create_index("idx_payments_restaurant_status", "payments", ["restaurant_id", "status"])
    op.create_index("idx_payments_type_status", "payments", ["payment_type", "status"])


def downgrade() -> None:
    op.drop_index("idx_payments_type_status", table_name="payments")
    op.drop_index("idx_payments_restaurant_status", table_name="payments")
    op.drop_index("idx_payments_restaurant_date", table_name="payments")
    op.drop_index("idx_expenses_payment_status", table_name="expenses")
    op.drop_index("idx_expenses_restaurant_status", table_name="expenses")
    op.drop_index("idx_expenses_restaurant_date", table_name="expenses")
    op.drop_index("idx_inventory_details_restaurant_inventory", table_name="inventory_details")
    op.drop_index("idx_inventory_details_product", table_name="inventory_details")
    op.drop_index("idx_inventory_details_inventory", table_name="inventory_details")
    op.drop_index("idx_stock_movements_destination_depot", table_name="stock_movements")
    op.drop_index("idx_stock_movements_source_depot", table_name="stock_movements")
    op.drop_index("idx_stock_movements_product_status", table_name="stock_movements")
    op.drop_index("idx_stock_movements_restaurant_date", table_name="stock_movements")

    op.drop_column("revenues", "tax_rate")
    op.drop_column("expenses", "tax_rate")
    op.drop_column("inventory_details", "justification")
    op.drop_column("inventory_details", "tolerance_threshold")
    op.drop_column("inventory_details", "exceeds_tolerance")
    op.drop_column("inventory_details", "value_gap")
    op.drop_column("stock_movements", "production_cost")
