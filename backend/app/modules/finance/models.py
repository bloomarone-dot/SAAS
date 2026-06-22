import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.modules.shared.models import new_id


Money = Numeric(14, 2)


class AccountType(str, enum.Enum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    INCOME = "income"
    EXPENSE = "expense"


class JournalType(str, enum.Enum):
    CASH = "cash"
    BANK = "bank"
    PURCHASE = "purchase"
    SALE = "sale"
    GENERAL = "general"
    STOCK = "stock"
    ADJUSTMENT = "adjustment"


class EntryStatus(str, enum.Enum):
    DRAFT = "draft"
    POSTED = "posted"
    CANCELLED = "cancelled"


class ThirdPartyType(str, enum.Enum):
    CUSTOMER = "customer"
    SUPPLIER = "supplier"
    EMPLOYEE = "employee"
    OTHER = "other"


class PaymentType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    BANK = "bank"
    MOBILE_MONEY = "mobile_money"
    OTHER = "other"


class OperationStatus(str, enum.Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    CANCELLED = "cancelled"


class PaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"


class TaxType(str, enum.Enum):
    COLLECTED = "collected"
    DEDUCTIBLE = "deductible"


class AccountingAccount(Base):
    __tablename__ = "accounting_accounts"
    __table_args__ = (UniqueConstraint("restaurant_id", "code", name="uq_accounting_account_restaurant_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    type: Mapped[AccountType] = mapped_column(Enum(AccountType), nullable=False, index=True)
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AccountingJournal(Base):
    __tablename__ = "accounting_journals"
    __table_args__ = (UniqueConstraint("restaurant_id", "code", name="uq_accounting_journal_restaurant_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    type: Mapped[JournalType] = mapped_column(Enum(JournalType), nullable=False, index=True)
    default_debit_account_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=True)
    default_credit_account_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AccountingEntry(Base):
    __tablename__ = "accounting_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    entry_number: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    entry_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    journal_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounting_journals.id"), index=True, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[EntryStatus] = mapped_column(Enum(EntryStatus), default=EntryStatus.DRAFT, index=True, nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    posted_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AccountingEntryLine(Base):
    __tablename__ = "accounting_entry_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    accounting_entry_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounting_entries.id"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    debit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0.00"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0.00"), nullable=False)
    third_party_type: Mapped[ThirdPartyType | None] = mapped_column(Enum(ThirdPartyType), nullable=True)
    third_party_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class CashRegister(Base):
    __tablename__ = "cash_registers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=False)
    responsible_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    bank_name: Mapped[str] = mapped_column(String(160), nullable=False)
    account_name: Mapped[str] = mapped_column(String(160), nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    default_account_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Tax(Base):
    __tablename__ = "taxes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("0.000"), nullable=False)
    type: Mapped[TaxType] = mapped_column(Enum(TaxType), nullable=False)
    account_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    expense_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("expense_categories.id"), nullable=True)
    supplier_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.UNPAID, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    accounting_entry_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_entries.id"), nullable=True)
    status: Mapped[OperationStatus] = mapped_column(Enum(OperationStatus), default=OperationStatus.DRAFT, index=True, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    validated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Revenue(Base):
    __tablename__ = "revenues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    revenue_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.UNPAID, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    accounting_entry_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_entries.id"), nullable=True)
    status: Mapped[OperationStatus] = mapped_column(Enum(OperationStatus), default=OperationStatus.DRAFT, index=True, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    validated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    payment_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    payment_type: Mapped[PaymentType] = mapped_column(Enum(PaymentType), index=True, nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    supplier_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    cash_register_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("cash_registers.id"), nullable=True)
    bank_account_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("bank_accounts.id"), nullable=True)
    accounting_entry_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounting_entries.id"), nullable=True)
    status: Mapped[OperationStatus] = mapped_column(Enum(OperationStatus), default=OperationStatus.DRAFT, index=True, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    validated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AccountingPeriodClose(Base):
    __tablename__ = "accounting_period_closes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    closed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    closed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class FinancialStatementMapping(Base):
    __tablename__ = "financial_statement_mappings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    statement: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounting_accounts.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PromotionCode(Base):
    """Code promo configurable par restaurant pour les remises autorisees."""

    __tablename__ = "promotion_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    discount_type: Mapped[str] = mapped_column(String(20), default="PERCENT", nullable=False)
    discount_value: Mapped[float] = mapped_column(Float, nullable=False)
    min_order_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    max_discount_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


RestaurantExpense = Expense
