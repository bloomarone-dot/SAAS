import logging
from datetime import datetime, timedelta
from app.modules.shared.models import new_id, utcnow
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.audit.service import log_action
from app.modules.catalog.models import MenuItem
from app.modules.finance.models import (
    AccountType,
    AccountingAccount,
    AccountingEntry,
    AccountingEntryLine,
    AccountingJournal,
    AccountingPeriodClose,
    BankAccount,
    CashRegister,
    EntryStatus,
    Expense,
    ExpenseCategory,
    FinancialStatementMapping,
    JournalType,
    OperationStatus,
    Payment,
    PaymentMethod,
    PaymentSchedule,
    PaymentStatus,
    PaymentType,
    PromotionCode,
    ThirdPartyType,
    Revenue,
    Tax,
    TaxType,
)
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.permissions.models import Permission
from app.modules.stock.models import StockMovement, StockMovementStatus, StockMovementType
from app.modules.users.models import User

router = APIRouter(prefix="/finance", tags=["finance"])


class OrmModel(BaseModel):
    class Config:
        from_attributes = True


logger = logging.getLogger(__name__)

# Taux de TVA Cameroun (19,25 %) appliqué aux ventes/achats. Prix saisis en TTC pour
# les ventes, en HT pour les charges (apply_vat).
VAT_RATE = Decimal("0.1925")


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def report_range(start_date: datetime | None, end_date: datetime | None) -> tuple[datetime, datetime]:
    end = end_date or utcnow()
    start = start_date or (end - timedelta(days=30))
    return start, end


class AccountIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=2, max_length=160)
    type: AccountType
    parent_id: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class AccountUpdateIn(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=40)
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    type: Optional[AccountType] = None
    parent_id: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class JournalIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=2, max_length=160)
    type: JournalType
    default_debit_account_id: Optional[str] = None
    default_credit_account_id: Optional[str] = None
    is_active: bool = True


class EntryLineIn(BaseModel):
    account_id: str
    label: str = Field(min_length=1, max_length=255)
    debit: Decimal = Decimal("0.00")
    credit: Decimal = Decimal("0.00")
    third_party_type: Optional[str] = None
    third_party_id: Optional[str] = None

    @model_validator(mode="after")
    def check_line_amount(self):
        self.debit = money(self.debit)
        self.credit = money(self.credit)
        if self.debit < 0 or self.credit < 0:
            raise ValueError("Les montants debit/credit doivent etre positifs")
        if self.debit and self.credit:
            raise ValueError("Une ligne ne peut pas porter debit et credit en meme temps")
        if not self.debit and not self.credit:
            raise ValueError("Une ligne doit porter un debit ou un credit")
        return self


class EntryIn(BaseModel):
    entry_date: Optional[datetime] = None
    journal_id: str
    reference: Optional[str] = None
    description: str = Field(min_length=2)
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    lines: list[EntryLineIn] = Field(min_length=2)


class ExpenseIn(BaseModel):
    expense_date: Optional[datetime] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    amount: Decimal = Field(gt=0)
    tax_rate: Decimal = Decimal("0.00")
    tax_amount: Decimal = Decimal("0.00")
    total_amount: Optional[Decimal] = None
    apply_vat: bool = False
    payment_status: PaymentStatus = PaymentStatus.PAID
    payment_method: PaymentMethod = PaymentMethod.CASH
    cash_register_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    description: str = Field(min_length=2)
    reference: Optional[str] = None

    @model_validator(mode="after")
    def normalize_total(self):
        self.amount = money(self.amount)
        self.tax_rate = Decimal(str(self.tax_rate or 0)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        if self.tax_rate and self.tax_amount == 0:
            self.tax_amount = money(self.amount * self.tax_rate / Decimal("100"))
        self.tax_amount = money(self.tax_amount)
        if self.apply_vat and self.tax_amount == 0:
            self.tax_amount = money(self.amount * VAT_RATE)
        self.total_amount = money(self.total_amount if self.total_amount is not None else self.amount + self.tax_amount)
        return self


class RevenueIn(BaseModel):
    revenue_date: Optional[datetime] = None
    customer_id: Optional[str] = None
    amount: Decimal = Field(gt=0)
    tax_rate: Decimal = Decimal("0.00")
    tax_amount: Decimal = Decimal("0.00")
    total_amount: Optional[Decimal] = None
    apply_vat: bool = False
    payment_status: PaymentStatus = PaymentStatus.PAID
    payment_method: PaymentMethod = PaymentMethod.CASH
    cash_register_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    description: str = Field(min_length=2)
    reference: Optional[str] = None

    @model_validator(mode="after")
    def normalize_total(self):
        self.amount = money(self.amount)
        self.tax_rate = Decimal(str(self.tax_rate or 0)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        if self.tax_rate and self.tax_amount == 0:
            self.tax_amount = money(self.amount * self.tax_rate / Decimal("100"))
        self.tax_amount = money(self.tax_amount)
        if self.apply_vat and self.tax_amount == 0:
            self.tax_amount = money(self.amount * VAT_RATE)
        self.total_amount = money(self.total_amount if self.total_amount is not None else self.amount + self.tax_amount)
        return self


class CreditNoteIn(BaseModel):
    """Avoir fournisseur ou client (montants HT + TVA)."""
    third_party_id: Optional[str] = None
    amount: Decimal = Field(gt=0)
    tax_amount: Decimal = Decimal("0.00")
    reference: Optional[str] = None
    description: str = Field(min_length=2)


class PaymentScheduleIn(BaseModel):
    """Échéance à payer (payable/fournisseur) ou à encaisser (receivable/client)."""
    direction: str = Field(pattern="^(payable|receivable)$")
    third_party_id: Optional[str] = None
    label: str = Field(min_length=2, max_length=255)
    due_date: datetime
    amount: Decimal = Field(gt=0)
    source_type: Optional[str] = None
    source_id: Optional[str] = None


class PaymentIn(BaseModel):
    payment_date: Optional[datetime] = None
    payment_type: PaymentType
    payment_method: PaymentMethod
    amount: Decimal = Field(gt=0)
    reference: Optional[str] = None
    description: Optional[str] = None
    customer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    cash_register_id: Optional[str] = None
    bank_account_id: Optional[str] = None

    @model_validator(mode="after")
    def normalize_amount(self):
        self.amount = money(self.amount)
        return self


class CashRegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=1, max_length=40)
    account_id: Optional[str] = None
    responsible_user_id: Optional[str] = None
    is_active: bool = True


class BankAccountIn(BaseModel):
    bank_name: str = Field(min_length=2, max_length=160)
    account_name: str = Field(min_length=2, max_length=160)
    account_number: Optional[str] = Field(default=None, max_length=80)
    account_id: Optional[str] = None
    is_active: bool = True


class ExpenseCategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    default_account_id: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class TaxIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    rate: Decimal = Field(ge=0)
    type: TaxType
    account_id: Optional[str] = None
    is_active: bool = True


class ExportAuditIn(BaseModel):
    report_type: str = Field(min_length=2, max_length=120)
    format: str = Field(pattern="^(pdf|excel|xlsx|xls|csv)$")


class ClosePeriodIn(BaseModel):
    start_date: datetime
    end_date: datetime
    note: Optional[str] = None


class PromoQuoteIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    order_amount: Decimal = Field(ge=0)


class PromotionCodeIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    label: str = Field(min_length=2, max_length=160)
    discount_type: str = Field(default="PERCENT", pattern="^(PERCENT|FIXED)$")
    discount_value: Decimal = Field(gt=0)
    min_order_amount: Decimal = Decimal("0.00")
    max_discount_amount: Optional[Decimal] = None
    max_uses: Optional[int] = Field(default=None, gt=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True


class PromotionCodeUpdateIn(BaseModel):
    code: Optional[str] = Field(default=None, min_length=2, max_length=40)
    label: Optional[str] = Field(default=None, min_length=2, max_length=160)
    discount_type: Optional[str] = Field(default=None, pattern="^(PERCENT|FIXED)$")
    discount_value: Optional[Decimal] = Field(default=None, gt=0)
    min_order_amount: Optional[Decimal] = None
    max_discount_amount: Optional[Decimal] = None
    max_uses: Optional[int] = Field(default=None, gt=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None


DEFAULT_ACCOUNTS = [
    ("101", "Capital", AccountType.EQUITY, "capital"),
    ("120", "Resultat", AccountType.EQUITY, "result"),
    ("401", "Fournisseurs", AccountType.LIABILITY, "suppliers"),
    ("411", "Clients", AccountType.ASSET, "customers"),
    ("4457", "TVA collectee", AccountType.LIABILITY, "vat_collected"),
    ("4456", "TVA deductible", AccountType.ASSET, "vat_deductible"),
    ("512", "Banque", AccountType.ASSET, "bank"),
    ("530", "Caisse", AccountType.ASSET, "cash"),
    ("607", "Achats marchandises", AccountType.EXPENSE, "purchases"),
    ("6037", "Variation stock marchandises", AccountType.EXPENSE, "stock_adjustment"),
    ("37", "Stock marchandises", AccountType.ASSET, "stock"),
    ("606", "Charges diverses", AccountType.EXPENSE, "misc_expense"),
    ("627", "Frais Mobile Money / commissions", AccountType.EXPENSE, "operator_fees"),
    ("701", "Ventes", AccountType.INCOME, "sales"),
]
DEFAULT_JOURNALS = [
    ("CAI", "Journal de caisse", JournalType.CASH),
    ("BQ", "Journal de banque", JournalType.BANK),
    ("ACH", "Journal des achats", JournalType.PURCHASE),
    ("VTE", "Journal des ventes", JournalType.SALE),
    ("OD", "Journal des operations diverses", JournalType.GENERAL),
    ("STK", "Journal de stock", JournalType.STOCK),
]
DEFAULT_EXPENSE_CATEGORIES = [
    "Achat marchandises", "Loyer", "Transport", "Electricite", "Eau", "Internet",
    "Salaires", "Entretien", "Fournitures", "Autres charges",
]


def ensure_default_accounting(db: Session, restaurant_id: str) -> dict[str, AccountingAccount]:
    accounts_by_code = {
        account.code: account
        for account in db.query(AccountingAccount).filter(AccountingAccount.restaurant_id == restaurant_id).all()
    }
    semantic: dict[str, AccountingAccount] = {}
    for code, name, account_type, key in DEFAULT_ACCOUNTS:
        account = accounts_by_code.get(code)
        if not account:
            account = AccountingAccount(restaurant_id=restaurant_id, code=code, name=name, type=account_type)
            db.add(account)
            db.flush()
        semantic[key] = account
    journals_by_code = {
        journal.code: journal
        for journal in db.query(AccountingJournal).filter(AccountingJournal.restaurant_id == restaurant_id).all()
    }
    for code, name, journal_type in DEFAULT_JOURNALS:
        if code not in journals_by_code:
            db.add(AccountingJournal(restaurant_id=restaurant_id, code=code, name=name, type=journal_type))
    if not db.query(CashRegister).filter(CashRegister.restaurant_id == restaurant_id).first():
        db.add(CashRegister(restaurant_id=restaurant_id, name="Caisse principale", code="MAIN", account_id=semantic["cash"].id))
    existing_categories = {
        category.name.lower()
        for category in db.query(ExpenseCategory).filter(ExpenseCategory.restaurant_id == restaurant_id).all()
    }
    for name in DEFAULT_EXPENSE_CATEGORIES:
        if name.lower() not in existing_categories:
            default_account = semantic["purchases"].id if name == "Achat marchandises" else semantic["misc_expense"].id
            db.add(ExpenseCategory(restaurant_id=restaurant_id, name=name, default_account_id=default_account))
    db.flush()
    return semantic


def journal_by_type(db: Session, restaurant_id: str, journal_type: JournalType) -> AccountingJournal:
    ensure_default_accounting(db, restaurant_id)
    journal = (
        db.query(AccountingJournal)
        .filter(AccountingJournal.restaurant_id == restaurant_id, AccountingJournal.type == journal_type, AccountingJournal.is_active.is_(True))
        .order_by(AccountingJournal.created_at.asc())
        .first()
    )
    if not journal:
        raise HTTPException(status_code=400, detail=f"Journal comptable {journal_type.value} non configure")
    return journal


def account_or_404(db: Session, account_id: str, restaurant_id: str) -> AccountingAccount:
    account = db.get(AccountingAccount, account_id)
    if not account or account.restaurant_id != restaurant_id:
        raise HTTPException(status_code=404, detail="Compte comptable introuvable")
    return account


def generate_entry_number(db: Session, restaurant_id: str, entry_date: datetime | None = None) -> str:
    value = entry_date or utcnow()
    prefix = value.strftime("EC%Y%m")
    count = (
        db.query(func.count(AccountingEntry.id))
        .filter(AccountingEntry.restaurant_id == restaurant_id, AccountingEntry.entry_number.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    return f"{prefix}-{int(count) + 1:05d}"


def check_entry_balance(lines: list[EntryLineIn] | list[AccountingEntryLine]) -> tuple[Decimal, Decimal]:
    if len(lines) < 2:
        raise HTTPException(status_code=400, detail="Une ecriture doit contenir au moins deux lignes")
    debit = sum(money(line.debit) for line in lines)
    credit = sum(money(line.credit) for line in lines)
    if debit != credit:
        raise HTTPException(status_code=400, detail=f"Ecriture non equilibree: debit {debit}, credit {credit}")
    if debit <= 0:
        raise HTTPException(status_code=400, detail="Le total de l'ecriture doit etre superieur a zero")
    return debit, credit


def assert_period_open(db: Session, restaurant_id: str, entry_date: datetime) -> None:
    closed = (
        db.query(AccountingPeriodClose)
        .filter(
            AccountingPeriodClose.restaurant_id == restaurant_id,
            AccountingPeriodClose.start_date <= entry_date,
            AccountingPeriodClose.end_date >= entry_date,
        )
        .first()
    )
    if closed:
        raise HTTPException(status_code=400, detail="La periode comptable est cloturee")


def create_accounting_entry(db: Session, restaurant_id: str, user_id: str, payload: EntryIn, *, status: EntryStatus = EntryStatus.DRAFT) -> AccountingEntry:
    assert_period_open(db, restaurant_id, payload.entry_date or utcnow())
    journal = db.get(AccountingJournal, payload.journal_id)
    if not journal or journal.restaurant_id != restaurant_id or not journal.is_active:
        raise HTTPException(status_code=404, detail="Journal comptable introuvable ou inactif")
    for line in payload.lines:
        account = account_or_404(db, line.account_id, restaurant_id)
        if not account.is_active:
            raise HTTPException(status_code=400, detail=f"Compte inactif: {account.code}")
    if status == EntryStatus.POSTED:
        check_entry_balance(payload.lines)
    entry = AccountingEntry(
        restaurant_id=restaurant_id,
        entry_number=generate_entry_number(db, restaurant_id, payload.entry_date),
        entry_date=payload.entry_date or utcnow(),
        journal_id=payload.journal_id,
        reference=payload.reference,
        description=payload.description,
        status=status,
        source_type=payload.source_type,
        source_id=payload.source_id,
        created_by=user_id,
        posted_by=user_id if status == EntryStatus.POSTED else None,
        posted_at=utcnow() if status == EntryStatus.POSTED else None,
    )
    db.add(entry)
    db.flush()
    for line in payload.lines:
        db.add(
            AccountingEntryLine(
                restaurant_id=restaurant_id,
                accounting_entry_id=entry.id,
                account_id=line.account_id,
                label=line.label,
                debit=money(line.debit),
                credit=money(line.credit),
                third_party_type=line.third_party_type,
                third_party_id=line.third_party_id,
            )
        )
    db.flush()
    return entry


def entry_lines(db: Session, entry_id: str) -> list[AccountingEntryLine]:
    return db.query(AccountingEntryLine).filter(AccountingEntryLine.accounting_entry_id == entry_id).all()


def entry_public(db: Session, entry: AccountingEntry) -> dict:
    lines = entry_lines(db, entry.id)
    debit = sum(money(line.debit) for line in lines)
    credit = sum(money(line.credit) for line in lines)
    return {**entry.__dict__, "lines": lines, "total_debit": debit, "total_credit": credit, "is_balanced": debit == credit}


def validate_accounting_entry(db: Session, entry: AccountingEntry, user: User) -> AccountingEntry:
    if entry.status != EntryStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Seule une ecriture brouillon peut etre validee")
    assert_period_open(db, entry.restaurant_id, entry.entry_date)
    check_entry_balance(entry_lines(db, entry.id))
    entry.status = EntryStatus.POSTED
    entry.posted_by = user.id
    entry.posted_at = utcnow()
    return entry


def cancel_accounting_entry(db: Session, entry: AccountingEntry, user: User) -> AccountingEntry:
    if entry.status != EntryStatus.POSTED:
        raise HTTPException(status_code=400, detail="Seule une ecriture validee peut etre annulee")
    assert_period_open(db, entry.restaurant_id, entry.entry_date)
    original_lines = entry_lines(db, entry.id)
    reverse_payload = EntryIn(
        entry_date=utcnow(),
        journal_id=entry.journal_id,
        reference=f"ANN-{entry.entry_number}",
        description=f"Annulation de {entry.entry_number}: {entry.description}",
        source_type="entry_cancellation",
        source_id=entry.id,
        lines=[
            EntryLineIn(account_id=line.account_id, label=f"Annulation - {line.label}", debit=line.credit, credit=line.debit, third_party_type=line.third_party_type.value if line.third_party_type else None, third_party_id=line.third_party_id)
            for line in original_lines
        ],
    )
    create_accounting_entry(db, entry.restaurant_id, user.id, reverse_payload, status=EntryStatus.POSTED)
    entry.status = EntryStatus.CANCELLED
    entry.cancelled_by = user.id
    entry.cancelled_at = utcnow()
    return entry


def account_balance(db: Session, restaurant_id: str, account_id: str, start: datetime | None = None, end: datetime | None = None) -> Decimal:
    query = (
        db.query(AccountingEntryLine)
        .join(AccountingEntry, AccountingEntry.id == AccountingEntryLine.accounting_entry_id)
        .filter(
            AccountingEntry.restaurant_id == restaurant_id,
            AccountingEntry.status == EntryStatus.POSTED,
            AccountingEntryLine.account_id == account_id,
        )
    )
    if start:
        query = query.filter(AccountingEntry.entry_date >= start)
    if end:
        query = query.filter(AccountingEntry.entry_date <= end)
    return sum(money(line.debit) - money(line.credit) for line in query.all())


def payment_asset_account(db: Session, restaurant_id: str, method: PaymentMethod, cash_register_id: str | None, bank_account_id: str | None) -> str:
    defaults = ensure_default_accounting(db, restaurant_id)
    if method == PaymentMethod.CASH:
        register = db.get(CashRegister, cash_register_id) if cash_register_id else db.query(CashRegister).filter(CashRegister.restaurant_id == restaurant_id, CashRegister.is_active.is_(True)).first()
        return register.account_id if register else defaults["cash"].id
    if method in {PaymentMethod.BANK, PaymentMethod.MOBILE_MONEY}:
        bank = db.get(BankAccount, bank_account_id) if bank_account_id else db.query(BankAccount).filter(BankAccount.restaurant_id == restaurant_id, BankAccount.is_active.is_(True)).first()
        return bank.account_id if bank else defaults["bank"].id
    return defaults["bank"].id


def create_expense_entry(db: Session, restaurant_id: str, user_id: str, expense: Expense, payment_method: PaymentMethod, cash_register_id: str | None, bank_account_id: str | None) -> AccountingEntry:
    defaults = ensure_default_accounting(db, restaurant_id)
    category = db.get(ExpenseCategory, expense.category_id) if expense.category_id else None
    debit_account_id = category.default_account_id if category and category.default_account_id else defaults["misc_expense"].id
    credit_account_id = payment_asset_account(db, restaurant_id, payment_method, cash_register_id, bank_account_id) if expense.payment_status == PaymentStatus.PAID else defaults["suppliers"].id
    journal = journal_by_type(db, restaurant_id, JournalType.CASH if payment_method == PaymentMethod.CASH else JournalType.PURCHASE)
    payload = EntryIn(
        entry_date=expense.expense_date,
        journal_id=journal.id,
        reference=expense.reference,
        description=expense.description,
        source_type="expense",
        source_id=expense.id,
        lines=[
            EntryLineIn(account_id=debit_account_id, label=expense.description, debit=expense.amount, credit=0, third_party_type="supplier" if expense.supplier_id else None, third_party_id=expense.supplier_id),
            EntryLineIn(account_id=credit_account_id, label=expense.description, debit=0, credit=expense.total_amount, third_party_type="supplier" if expense.supplier_id and expense.payment_status != PaymentStatus.PAID else None, third_party_id=expense.supplier_id if expense.payment_status != PaymentStatus.PAID else None),
        ],
    )
    if expense.tax_amount:
        payload.lines.insert(1, EntryLineIn(account_id=defaults["vat_deductible"].id, label=f"TVA deductible - {expense.description}", debit=expense.tax_amount, credit=0))
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def create_revenue_entry(db: Session, restaurant_id: str, user_id: str, revenue: Revenue, payment_method: PaymentMethod, cash_register_id: str | None, bank_account_id: str | None) -> AccountingEntry:
    defaults = ensure_default_accounting(db, restaurant_id)
    debit_account_id = payment_asset_account(db, restaurant_id, payment_method, cash_register_id, bank_account_id) if revenue.payment_status == PaymentStatus.PAID else defaults["customers"].id
    journal = journal_by_type(db, restaurant_id, JournalType.CASH if payment_method == PaymentMethod.CASH else JournalType.SALE)
    payload = EntryIn(
        entry_date=revenue.revenue_date,
        journal_id=journal.id,
        reference=revenue.reference,
        description=revenue.description,
        source_type="revenue",
        source_id=revenue.id,
        lines=[
            EntryLineIn(account_id=debit_account_id, label=revenue.description, debit=revenue.total_amount, credit=0, third_party_type="customer" if revenue.customer_id and revenue.payment_status != PaymentStatus.PAID else None, third_party_id=revenue.customer_id if revenue.payment_status != PaymentStatus.PAID else None),
            EntryLineIn(account_id=defaults["sales"].id, label=revenue.description, debit=0, credit=revenue.amount),
        ],
    )
    if revenue.tax_amount:
        payload.lines.append(EntryLineIn(account_id=defaults["vat_collected"].id, label=f"TVA collectee - {revenue.description}", debit=0, credit=revenue.tax_amount))
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def create_payment_entry(db: Session, restaurant_id: str, user_id: str, payment: Payment) -> AccountingEntry:
    defaults = ensure_default_accounting(db, restaurant_id)
    cash_or_bank = payment_asset_account(db, restaurant_id, payment.payment_method, payment.cash_register_id, payment.bank_account_id)
    if payment.payment_type == PaymentType.INCOME:
        debit_account_id = cash_or_bank
        credit_account_id = defaults["customers"].id if payment.customer_id else defaults["sales"].id
        journal_type = JournalType.CASH if payment.payment_method == PaymentMethod.CASH else JournalType.BANK
    else:
        debit_account_id = defaults["suppliers"].id if payment.supplier_id else defaults["misc_expense"].id
        credit_account_id = cash_or_bank
        journal_type = JournalType.CASH if payment.payment_method == PaymentMethod.CASH else JournalType.BANK
    journal = journal_by_type(db, restaurant_id, journal_type)
    payload = EntryIn(
        entry_date=payment.payment_date,
        journal_id=journal.id,
        reference=payment.reference,
        description=payment.description or "Paiement",
        source_type="payment",
        source_id=payment.id,
        lines=[
            EntryLineIn(account_id=debit_account_id, label=payment.description or "Paiement", debit=payment.amount, credit=0),
            EntryLineIn(account_id=credit_account_id, label=payment.description or "Paiement", debit=0, credit=payment.amount),
        ],
    )
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


# Alias historique : voir VAT_RATE (source unique du taux 19,25 %).
SALE_VAT_RATE = VAT_RATE


def map_order_payment_method(raw: str | None) -> PaymentMethod:
    """Convertit le mode de paiement libre d'une commande en PaymentMethod comptable."""
    text = (raw or "").lower()
    if any(k in text for k in ("orange", "mtn", "momo", "mobile", "money")):
        return PaymentMethod.MOBILE_MONEY
    if any(k in text for k in ("banque", "bank", "carte", "card", "virement", "cheque", "chèque")):
        return PaymentMethod.BANK
    return PaymentMethod.CASH


def post_order_sale_entry(
    db: Session,
    restaurant_id: str,
    order,
    user_id: str,
    *,
    payment_method: PaymentMethod | None = None,
) -> AccountingEntry | None:
    """Génère l'écriture de vente à l'encaissement d'une commande (idempotent).

    Débit trésorerie (TTC) / Crédit 701 Ventes (HT) + 4457 TVA collectée.
    Une seule écriture par commande (garde sur source_type='order_sale').
    Ne commit pas : l'appelant gère la transaction.
    """
    if not order or not getattr(order, "id", None):
        return None
    existing = (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.restaurant_id == restaurant_id,
            AccountingEntry.source_type == "order_sale",
            AccountingEntry.source_id == order.id,
        )
        .first()
    )
    if existing:
        return existing
    total = money(order.total_amount)
    if total <= 0:
        return None
    method = payment_method or map_order_payment_method(getattr(order, "payment_method", None))
    defaults = ensure_default_accounting(db, restaurant_id)
    asset_account_id = payment_asset_account(db, restaurant_id, method, None, None)
    ht = (total / (Decimal("1") + SALE_VAT_RATE)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    tva = total - ht
    journal = journal_by_type(db, restaurant_id, JournalType.CASH if method == PaymentMethod.CASH else JournalType.SALE)
    order_number = getattr(order, "order_number", None) or order.id
    lines = [
        EntryLineIn(account_id=asset_account_id, label=f"Encaissement {order_number}", debit=total, credit=0),
        EntryLineIn(account_id=defaults["sales"].id, label=f"Vente {order_number}", debit=0, credit=ht),
    ]
    if tva > 0:
        lines.append(EntryLineIn(account_id=defaults["vat_collected"].id, label=f"TVA collectée {order_number}", debit=0, credit=tva))
    payload = EntryIn(
        entry_date=utcnow(),
        journal_id=journal.id,
        reference=str(order_number),
        description=f"Vente commande {order_number}",
        source_type="order_sale",
        source_id=order.id,
        lines=lines,
    )
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def post_stock_reception_entry(db: Session, restaurant_id: str, movement, user_id: str) -> AccountingEntry | None:
    """Génère l'écriture d'achat à la réception d'une marchandise (idempotent).

    Débit 607 Achats marchandises / Crédit 401 Fournisseurs (tiers = fournisseur).
    Une seule écriture par mouvement (garde sur source_type='stock_reception').
    Ne commit pas. La TVA déductible relève du flux facture fournisseur.
    """
    if not movement or not getattr(movement, "id", None):
        return None
    supplier_id = getattr(movement, "supplier_id", None)
    amount = money(getattr(movement, "total_amount", 0) or 0)
    if not supplier_id or amount <= 0:
        return None
    existing = (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.restaurant_id == restaurant_id,
            AccountingEntry.source_type == "stock_reception",
            AccountingEntry.source_id == movement.id,
        )
        .first()
    )
    if existing:
        return existing
    defaults = ensure_default_accounting(db, restaurant_id)
    journal = journal_by_type(db, restaurant_id, JournalType.PURCHASE)
    reference = getattr(movement, "reference", None) or movement.id
    label = f"Réception {reference}"
    # Inventaire permanent : la réception entre à l'actif Stock (37), pas en charge (607).
    payload = EntryIn(
        entry_date=getattr(movement, "movement_date", None) or utcnow(),
        journal_id=journal.id,
        reference=str(reference),
        description=f"Réception marchandises {reference}",
        source_type="stock_reception",
        source_id=movement.id,
        lines=[
            EntryLineIn(account_id=defaults["stock"].id, label=label, debit=amount, credit=0),
            EntryLineIn(account_id=defaults["suppliers"].id, label=label, debit=0, credit=amount, third_party_type="supplier", third_party_id=supplier_id),
        ],
    )
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def post_stock_cogs_entry(db: Session, restaurant_id: str, movement, user_id: str) -> AccountingEntry | None:
    """Coût des marchandises vendues / consommées au déstockage (inventaire permanent).

    Débit 6037 Variation de stock / Crédit 37 Stock, à la valeur CMUP du mouvement.
    Idempotent (source_type='stock_cogs'). Ne commit pas.
    """
    if not movement or not getattr(movement, "id", None):
        return None
    amount = money(getattr(movement, "total_amount", 0) or 0)
    if amount <= 0:
        return None
    existing = (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.restaurant_id == restaurant_id,
            AccountingEntry.source_type == "stock_cogs",
            AccountingEntry.source_id == movement.id,
        )
        .first()
    )
    if existing:
        return existing
    defaults = ensure_default_accounting(db, restaurant_id)
    journal = journal_by_type(db, restaurant_id, JournalType.STOCK)
    reference = getattr(movement, "reference", None) or movement.id
    label = f"Sortie stock {reference}"
    payload = EntryIn(
        entry_date=getattr(movement, "movement_date", None) or utcnow(),
        journal_id=journal.id,
        reference=str(reference),
        description=f"COGS / consommation {reference}",
        source_type="stock_cogs",
        source_id=movement.id,
        lines=[
            EntryLineIn(account_id=defaults["stock_adjustment"].id, label=label, debit=amount, credit=0),
            EntryLineIn(account_id=defaults["stock"].id, label=label, debit=0, credit=amount),
        ],
    )
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def post_stock_cogs_entry_safe(db: Session, movement, user_id: str | None) -> None:
    """Comptabilise le COGS sans bloquer l'opération stock (savepoint isolé)."""
    try:
        if not movement or not getattr(movement, "restaurant_id", None):
            return
        resolved_user = user_id or getattr(movement, "created_by", None)
        if not resolved_user:
            resolved_user = (
                db.query(User.id)
                .filter(User.restaurant_id == movement.restaurant_id)
                .order_by(User.created_at.asc())
                .scalar()
            )
        if not resolved_user:
            return
        with db.begin_nested():
            post_stock_cogs_entry(db, movement.restaurant_id, movement, resolved_user)
    except Exception:  # noqa: BLE001 - l'opération stock prime sur la comptabilisation
        logger.warning("Echec comptabilisation COGS %s", getattr(movement, "id", "?"), exc_info=True)


def post_payment_fees_entry(db: Session, restaurant_id: str, *, source_id: str, reference, amount, user_id: str) -> AccountingEntry | None:
    """Frais d'encaissement Mobile Money (commission opérateur + plateforme).

    Débit 627 Frais / Crédit 512 Trésorerie. Idempotent (source_type='payment_fees').
    Réduit la trésorerie du brut au net effectivement reçu. Ne commit pas.
    """
    total = money(amount)
    if total <= 0:
        return None
    existing = (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.restaurant_id == restaurant_id,
            AccountingEntry.source_type == "payment_fees",
            AccountingEntry.source_id == source_id,
        )
        .first()
    )
    if existing:
        return existing
    defaults = ensure_default_accounting(db, restaurant_id)
    asset_account_id = payment_asset_account(db, restaurant_id, PaymentMethod.MOBILE_MONEY, None, None)
    journal = journal_by_type(db, restaurant_id, JournalType.BANK)
    label = f"Frais Mobile Money {reference}"
    payload = EntryIn(
        entry_date=utcnow(),
        journal_id=journal.id,
        reference=str(reference),
        description=f"Frais encaissement {reference}",
        source_type="payment_fees",
        source_id=source_id,
        lines=[
            EntryLineIn(account_id=defaults["operator_fees"].id, label=label, debit=total, credit=0),
            EntryLineIn(account_id=asset_account_id, label=label, debit=0, credit=total),
        ],
    )
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def _credit_note_existing(db: Session, restaurant_id: str, source_type: str, reference: str | None):
    if not reference:
        return None
    return (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.restaurant_id == restaurant_id,
            AccountingEntry.source_type == source_type,
            AccountingEntry.reference == reference,
        )
        .first()
    )


def post_supplier_credit_note(db: Session, restaurant_id: str, user_id: str, *, third_party_id, amount, tax_amount, reference, description) -> AccountingEntry:
    """Avoir fournisseur (retour marchandise) : Débit 401 / Crédit 37 (+ 4456 TVA)."""
    ht = money(amount)
    tva = money(tax_amount)
    ttc = ht + tva
    if ttc <= 0:
        raise HTTPException(status_code=400, detail="Montant d'avoir invalide")
    existing = _credit_note_existing(db, restaurant_id, "credit_note_supplier", reference)
    if existing:
        return existing
    defaults = ensure_default_accounting(db, restaurant_id)
    journal = journal_by_type(db, restaurant_id, JournalType.PURCHASE)
    lines = [
        EntryLineIn(account_id=defaults["suppliers"].id, label=description, debit=ttc, credit=0, third_party_type="supplier", third_party_id=third_party_id),
        EntryLineIn(account_id=defaults["stock"].id, label=description, debit=0, credit=ht),
    ]
    if tva > 0:
        lines.append(EntryLineIn(account_id=defaults["vat_deductible"].id, label=f"TVA - {description}", debit=0, credit=tva))
    payload = EntryIn(entry_date=utcnow(), journal_id=journal.id, reference=reference, description=f"Avoir fournisseur - {description}",
                      source_type="credit_note_supplier", source_id=reference or new_id(), lines=lines)
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def post_customer_credit_note(db: Session, restaurant_id: str, user_id: str, *, third_party_id, amount, tax_amount, reference, description) -> AccountingEntry:
    """Avoir client (annulation/geste) : Débit 701 (+ 4457 TVA) / Crédit 411."""
    ht = money(amount)
    tva = money(tax_amount)
    ttc = ht + tva
    if ttc <= 0:
        raise HTTPException(status_code=400, detail="Montant d'avoir invalide")
    existing = _credit_note_existing(db, restaurant_id, "credit_note_customer", reference)
    if existing:
        return existing
    defaults = ensure_default_accounting(db, restaurant_id)
    journal = journal_by_type(db, restaurant_id, JournalType.SALE)
    lines = [
        EntryLineIn(account_id=defaults["sales"].id, label=description, debit=ht, credit=0),
    ]
    if tva > 0:
        lines.append(EntryLineIn(account_id=defaults["vat_collected"].id, label=f"TVA - {description}", debit=tva, credit=0))
    lines.append(EntryLineIn(account_id=defaults["customers"].id, label=description, debit=0, credit=ttc, third_party_type="customer", third_party_id=third_party_id))
    payload = EntryIn(entry_date=utcnow(), journal_id=journal.id, reference=reference, description=f"Avoir client - {description}",
                      source_type="credit_note_customer", source_id=reference or new_id(), lines=lines)
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def post_payment_fees_entry_safe(db: Session, restaurant_id: str, *, source_id, reference, amount, user_id) -> None:
    """Comptabilise les frais d'encaissement sans bloquer le paiement (savepoint isolé)."""
    try:
        if not restaurant_id or money(amount) <= 0:
            return
        resolved_user = user_id
        if not resolved_user:
            resolved_user = (
                db.query(User.id)
                .filter(User.restaurant_id == restaurant_id)
                .order_by(User.created_at.asc())
                .scalar()
            )
        if not resolved_user:
            return
        with db.begin_nested():
            post_payment_fees_entry(db, restaurant_id, source_id=source_id, reference=reference, amount=amount, user_id=resolved_user)
    except Exception:  # noqa: BLE001 - le paiement prime sur la comptabilisation
        logger.warning("Echec comptabilisation frais %s", source_id, exc_info=True)


def post_stock_reception_entry_safe(db: Session, movement, user_id: str | None) -> None:
    """Comptabilise une réception sans bloquer l'opération stock (savepoint isolé)."""
    try:
        if not movement or not getattr(movement, "restaurant_id", None):
            return
        resolved_user = user_id or getattr(movement, "created_by", None)
        if not resolved_user:
            resolved_user = (
                db.query(User.id)
                .filter(User.restaurant_id == movement.restaurant_id)
                .order_by(User.created_at.asc())
                .scalar()
            )
        if not resolved_user:
            return
        with db.begin_nested():
            post_stock_reception_entry(db, movement.restaurant_id, movement, resolved_user)
    except Exception:  # noqa: BLE001 - l'opération stock prime sur la comptabilisation
        logger.warning("Echec comptabilisation réception %s", getattr(movement, "id", "?"), exc_info=True)


def post_inventory_adjustment_entry(
    db: Session,
    restaurant_id: str,
    *,
    source_id: str,
    reference: str,
    entry_date,
    net_amount,
    user_id: str,
) -> AccountingEntry | None:
    """Écriture d'ajustement d'inventaire (idempotent).

    net_amount > 0 (excédent) : Débit 37 Stock / Crédit 6037 Variation de stock.
    net_amount < 0 (manquant)  : Débit 6037 / Crédit 37.
    Ne commit pas.
    """
    raw = Decimal(str(net_amount or 0))
    amount = money(abs(raw))
    if amount <= 0:
        return None
    existing = (
        db.query(AccountingEntry)
        .filter(
            AccountingEntry.restaurant_id == restaurant_id,
            AccountingEntry.source_type == "inventory_adjustment",
            AccountingEntry.source_id == source_id,
        )
        .first()
    )
    if existing:
        return existing
    defaults = ensure_default_accounting(db, restaurant_id)
    journal = journal_by_type(db, restaurant_id, JournalType.STOCK)
    stock_account_id = defaults["stock"].id
    variation_account_id = defaults["stock_adjustment"].id
    label = f"Ajustement inventaire {reference}"
    if raw > 0:
        lines = [
            EntryLineIn(account_id=stock_account_id, label=label, debit=amount, credit=0),
            EntryLineIn(account_id=variation_account_id, label=label, debit=0, credit=amount),
        ]
    else:
        lines = [
            EntryLineIn(account_id=variation_account_id, label=label, debit=amount, credit=0),
            EntryLineIn(account_id=stock_account_id, label=label, debit=0, credit=amount),
        ]
    payload = EntryIn(
        entry_date=entry_date or utcnow(),
        journal_id=journal.id,
        reference=str(reference),
        description=f"Écart d'inventaire {reference}",
        source_type="inventory_adjustment",
        source_id=source_id,
        lines=lines,
    )
    return create_accounting_entry(db, restaurant_id, user_id, payload, status=EntryStatus.POSTED)


def post_inventory_adjustment_entry_safe(db: Session, restaurant_id: str, *, source_id, reference, entry_date, net_amount, user_id) -> None:
    """Comptabilise un écart d'inventaire sans bloquer la validation (savepoint isolé)."""
    try:
        if not restaurant_id or not user_id:
            return
        with db.begin_nested():
            post_inventory_adjustment_entry(
                db,
                restaurant_id,
                source_id=source_id,
                reference=reference,
                entry_date=entry_date,
                net_amount=net_amount,
                user_id=user_id,
            )
    except Exception:  # noqa: BLE001 - l'opération stock prime sur la comptabilisation
        logger.warning("Echec comptabilisation écart inventaire %s", source_id, exc_info=True)


def post_order_sale_entry_safe(db: Session, order, user_id: str | None, *, payment_method: PaymentMethod | None = None) -> None:
    """Comptabilise une vente sans jamais bloquer l'encaissement (savepoint isolé)."""
    try:
        if not order or not getattr(order, "restaurant_id", None):
            return
        resolved_user = user_id or getattr(order, "cashier_id", None)
        if not resolved_user:
            resolved_user = (
                db.query(User.id)
                .filter(User.restaurant_id == order.restaurant_id)
                .order_by(User.created_at.asc())
                .scalar()
            )
        if not resolved_user:
            return
        with db.begin_nested():
            post_order_sale_entry(db, order.restaurant_id, order, resolved_user, payment_method=payment_method)
    except Exception:  # noqa: BLE001 - la vente prime sur la comptabilisation
        logger.warning("Echec comptabilisation vente commande %s", getattr(order, "id", "?"), exc_info=True)


def posted_lines_query(db: Session, restaurant_id: str, start: datetime | None = None, end: datetime | None = None):
    query = (
        db.query(AccountingEntryLine, AccountingEntry, AccountingAccount)
        .join(AccountingEntry, AccountingEntry.id == AccountingEntryLine.accounting_entry_id)
        .join(AccountingAccount, AccountingAccount.id == AccountingEntryLine.account_id)
        .filter(AccountingEntry.restaurant_id == restaurant_id, AccountingEntry.status == EntryStatus.POSTED)
    )
    if start:
        query = query.filter(AccountingEntry.entry_date >= start)
    if end:
        query = query.filter(AccountingEntry.entry_date <= end)
    return query


def trial_balance_rows(db: Session, restaurant_id: str, start: datetime | None, end: datetime | None, account_type: AccountType | None = None) -> list[dict]:
    rows: dict[str, dict] = {}
    query = posted_lines_query(db, restaurant_id, start, end)
    if account_type:
        query = query.filter(AccountingAccount.type == account_type)
    for line, _entry, account in query.all():
        row = rows.setdefault(account.id, {"account_id": account.id, "code": account.code, "name": account.name, "type": account.type.value, "debit": Decimal("0.00"), "credit": Decimal("0.00")})
        row["debit"] += money(line.debit)
        row["credit"] += money(line.credit)
    for row in rows.values():
        balance = row["debit"] - row["credit"]
        row["debit_balance"] = balance if balance > 0 else Decimal("0.00")
        row["credit_balance"] = abs(balance) if balance < 0 else Decimal("0.00")
    return sorted(rows.values(), key=lambda row: row["code"])


@router.on_event("startup")
def _noop() -> None:
    return None


@router.get("/accounts")
def list_accounts(type: AccountType | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    ensure_default_accounting(db, current_user.restaurant_id)
    db.commit()
    query = db.query(AccountingAccount).filter(AccountingAccount.restaurant_id == current_user.restaurant_id)
    if type:
        query = query.filter(AccountingAccount.type == type)
    return query.order_by(AccountingAccount.code.asc()).all()


@router.post("/accounts", status_code=201)
def create_accounting_account(payload: AccountIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    account = AccountingAccount(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/accounts/{account_id}")
def update_accounting_account(account_id: str, payload: AccountUpdateIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    account = account_or_404(db, account_id, current_user.restaurant_id)
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}")
def disable_accounting_account(account_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    account = account_or_404(db, account_id, current_user.restaurant_id)
    account.is_active = False
    db.commit()
    return {"message": "Compte desactive"}


@router.get("/accounts/{account_id}")
def account_detail(account_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    account = account_or_404(db, account_id, current_user.restaurant_id)
    return {**account.__dict__, "balance": account_balance(db, current_user.restaurant_id, account.id)}


@router.get("/journals")
def list_journals(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    ensure_default_accounting(db, current_user.restaurant_id)
    db.commit()
    return db.query(AccountingJournal).filter(AccountingJournal.restaurant_id == current_user.restaurant_id).order_by(AccountingJournal.code.asc()).all()


@router.post("/journals", status_code=201)
def create_accounting_journal(payload: JournalIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    journal = AccountingJournal(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(journal)
    db.commit()
    db.refresh(journal)
    return journal


@router.patch("/journals/{journal_id}")
def update_journal(journal_id: str, payload: JournalIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    journal = db.get(AccountingJournal, journal_id)
    if not journal or journal.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Journal introuvable")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(journal, field, value)
    db.commit()
    db.refresh(journal)
    return journal


@router.delete("/journals/{journal_id}")
def disable_journal(journal_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    journal = db.get(AccountingJournal, journal_id)
    if not journal or journal.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Journal introuvable")
    journal.is_active = False
    db.commit()
    return {"message": "Journal desactive"}


@router.get("/entries")
def list_entries(start_date: datetime | None = None, end_date: datetime | None = None, journal_id: str | None = None, status: EntryStatus | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    query = db.query(AccountingEntry).filter(AccountingEntry.restaurant_id == current_user.restaurant_id)
    if start_date:
        query = query.filter(AccountingEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(AccountingEntry.entry_date <= end_date)
    if journal_id:
        query = query.filter(AccountingEntry.journal_id == journal_id)
    if status:
        query = query.filter(AccountingEntry.status == status)
    entries = query.order_by(AccountingEntry.entry_date.desc(), AccountingEntry.created_at.desc()).limit(500).all()
    return [entry_public(db, entry) for entry in entries]


@router.post("/entries", status_code=201)
def create_entry(payload: EntryIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    entry = create_accounting_entry(db, current_user.restaurant_id, current_user.id, payload)
    db.commit()
    return entry_public(db, entry)


@router.get("/entries/{entry_id}")
def get_entry(entry_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    entry = db.get(AccountingEntry, entry_id)
    if not entry or entry.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Ecriture introuvable")
    return entry_public(db, entry)


@router.patch("/entries/{entry_id}/validate")
def validate_entry(entry_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    entry = db.get(AccountingEntry, entry_id)
    if not entry or entry.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Ecriture introuvable")
    validate_accounting_entry(db, entry, current_user)
    db.commit()
    return entry_public(db, entry)


@router.patch("/entries/{entry_id}/cancel")
def cancel_entry(entry_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    entry = db.get(AccountingEntry, entry_id)
    if not entry or entry.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Ecriture introuvable")
    cancel_accounting_entry(db, entry, current_user)
    db.commit()
    return entry_public(db, entry)


@router.get("/expenses")
def list_expenses(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    return db.query(Expense).filter(Expense.restaurant_id == current_user.restaurant_id, Expense.expense_date >= start, Expense.expense_date <= end).order_by(Expense.expense_date.desc()).all()


@router.post("/expenses", status_code=201)
def create_expense(payload: ExpenseIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    expense = Expense(
        restaurant_id=current_user.restaurant_id,
        expense_date=payload.expense_date or utcnow(),
        category_id=payload.category_id,
        supplier_id=payload.supplier_id,
        amount=payload.amount,
        tax_rate=payload.tax_rate,
        tax_amount=payload.tax_amount,
        total_amount=payload.total_amount,
        payment_status=payload.payment_status,
        description=payload.description,
        reference=payload.reference,
        created_by=current_user.id,
    )
    db.add(expense)
    db.flush()
    log_action(db, current_user, "finance.expense_create", "expense", expense.id, f"Dépense enregistrée: {expense.description}")
    db.commit()
    db.refresh(expense)
    return expense


@router.patch("/expenses/{expense_id}/validate")
def validate_expense(expense_id: str, payment_method: PaymentMethod = PaymentMethod.CASH, cash_register_id: str | None = None, bank_account_id: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    expense = db.get(Expense, expense_id)
    if not expense or expense.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Depense introuvable")
    if expense.status != OperationStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Depense deja traitee")
    entry = create_expense_entry(db, current_user.restaurant_id, current_user.id, expense, payment_method, cash_register_id, bank_account_id)
    expense.accounting_entry_id = entry.id
    expense.status = OperationStatus.VALIDATED
    expense.validated_by = current_user.id
    expense.validated_at = utcnow()
    log_action(db, current_user, "finance.expense_validate", "expense", expense.id, f"Dépense validée: {expense.description}")
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/revenues")
def list_revenues(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    return db.query(Revenue).filter(Revenue.restaurant_id == current_user.restaurant_id, Revenue.revenue_date >= start, Revenue.revenue_date <= end).order_by(Revenue.revenue_date.desc()).all()


@router.post("/revenues", status_code=201)
def create_revenue(payload: RevenueIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    revenue = Revenue(
        restaurant_id=current_user.restaurant_id,
        revenue_date=payload.revenue_date or utcnow(),
        customer_id=payload.customer_id,
        amount=payload.amount,
        tax_rate=payload.tax_rate,
        tax_amount=payload.tax_amount,
        total_amount=payload.total_amount,
        payment_status=payload.payment_status,
        description=payload.description,
        reference=payload.reference,
        created_by=current_user.id,
    )
    db.add(revenue)
    db.flush()
    log_action(db, current_user, "finance.revenue_create", "revenue", revenue.id, f"Recette enregistrée: {revenue.description}")
    db.commit()
    db.refresh(revenue)
    return revenue


@router.patch("/revenues/{revenue_id}/validate")
def validate_revenue(revenue_id: str, payment_method: PaymentMethod = PaymentMethod.CASH, cash_register_id: str | None = None, bank_account_id: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    revenue = db.get(Revenue, revenue_id)
    if not revenue or revenue.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Recette introuvable")
    if revenue.status != OperationStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Recette deja traitee")
    entry = create_revenue_entry(db, current_user.restaurant_id, current_user.id, revenue, payment_method, cash_register_id, bank_account_id)
    revenue.accounting_entry_id = entry.id
    revenue.status = OperationStatus.VALIDATED
    revenue.validated_by = current_user.id
    revenue.validated_at = utcnow()
    log_action(db, current_user, "finance.revenue_validate", "revenue", revenue.id, f"Recette validée: {revenue.description}")
    db.commit()
    db.refresh(revenue)
    return revenue


@router.post("/credit-notes/supplier", status_code=201)
def create_supplier_credit_note(payload: CreditNoteIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Avoir fournisseur (retour de marchandise)."""
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    entry = post_supplier_credit_note(
        db, current_user.restaurant_id, current_user.id,
        third_party_id=payload.third_party_id, amount=payload.amount, tax_amount=payload.tax_amount,
        reference=payload.reference, description=payload.description,
    )
    db.commit()
    return entry_public(db, entry)


@router.post("/credit-notes/customer", status_code=201)
def create_customer_credit_note(payload: CreditNoteIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Avoir client (annulation / geste commercial)."""
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    entry = post_customer_credit_note(
        db, current_user.restaurant_id, current_user.id,
        third_party_id=payload.third_party_id, amount=payload.amount, tax_amount=payload.tax_amount,
        reference=payload.reference, description=payload.description,
    )
    db.commit()
    return entry_public(db, entry)


@router.post("/payment-schedules", status_code=201)
def create_payment_schedule(payload: PaymentScheduleIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    schedule = PaymentSchedule(
        restaurant_id=current_user.restaurant_id,
        direction=payload.direction,
        third_party_type=ThirdPartyType.SUPPLIER if payload.direction == "payable" else ThirdPartyType.CUSTOMER,
        third_party_id=payload.third_party_id,
        label=payload.label,
        due_date=payload.due_date,
        amount=money(payload.amount),
        source_type=payload.source_type,
        source_id=payload.source_id,
        created_by=current_user.id,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/payment-schedules")
def list_payment_schedules(status: str | None = None, direction: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    query = db.query(PaymentSchedule).filter(PaymentSchedule.restaurant_id == current_user.restaurant_id)
    if status:
        query = query.filter(PaymentSchedule.status == status)
    if direction:
        query = query.filter(PaymentSchedule.direction == direction)
    return query.order_by(PaymentSchedule.due_date.asc()).limit(500).all()


@router.patch("/payment-schedules/{schedule_id}/pay")
def pay_payment_schedule(schedule_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    schedule = db.get(PaymentSchedule, schedule_id)
    if not schedule or schedule.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Échéance introuvable")
    if schedule.status != "pending":
        raise HTTPException(status_code=400, detail="Échéance déjà traitée")
    schedule.status = "paid"
    schedule.paid_at = utcnow()
    db.commit()
    db.refresh(schedule)
    return schedule


def payment_schedule_summary(db: Session, restaurant_id: str, now: datetime | None = None) -> dict:
    """Échéances en attente regroupées par sens, avec total et total en retard."""
    now = now or utcnow()
    empty = lambda: {"items": [], "total": Decimal("0.00"), "overdue_total": Decimal("0.00")}
    result = {"payable": empty(), "receivable": empty()}
    schedules = (
        db.query(PaymentSchedule)
        .filter(PaymentSchedule.restaurant_id == restaurant_id, PaymentSchedule.status == "pending")
        .order_by(PaymentSchedule.due_date.asc())
        .all()
    )
    for schedule in schedules:
        bucket = result.get(schedule.direction)
        if bucket is None:
            continue
        overdue = schedule.due_date < now
        amount = money(schedule.amount)
        bucket["items"].append({
            "id": schedule.id, "label": schedule.label, "third_party_id": schedule.third_party_id,
            "due_date": schedule.due_date, "amount": amount, "overdue": overdue,
        })
        bucket["total"] += amount
        if overdue:
            bucket["overdue_total"] += amount
    return result


@router.get("/reports/payment-schedule")
def payment_schedule_report(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    return payment_schedule_summary(db, current_user.restaurant_id)


@router.patch("/entry-lines/{line_id}/reconcile")
def reconcile_entry_line(line_id: str, reconciled: bool = True, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Pointe (ou dépointe) une ligne d'écriture contre le relevé bancaire."""
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    line = db.get(AccountingEntryLine, line_id)
    if not line or line.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Ligne d'écriture introuvable")
    line.reconciled = reconciled
    line.reconciled_at = utcnow() if reconciled else None
    db.commit()
    db.refresh(line)
    return line


def bank_reconciliation(db: Session, restaurant_id: str, account_id: str, statement_balance=None) -> dict:
    """Rapprochement d'un compte de trésorerie : solde comptable, pointé, et écart vs relevé."""
    account = account_or_404(db, account_id, restaurant_id)
    rows = posted_lines_query(db, restaurant_id).filter(AccountingAccount.id == account_id).all()
    book_balance = Decimal("0.00")
    reconciled_balance = Decimal("0.00")
    unreconciled_lines = []
    for line, entry, _account in sorted(rows, key=lambda r: r[1].entry_date):
        signed = money(line.debit) - money(line.credit)
        book_balance += signed
        if line.reconciled:
            reconciled_balance += signed
        else:
            unreconciled_lines.append({
                "line_id": line.id,
                "entry_date": entry.entry_date,
                "entry_number": entry.entry_number,
                "label": line.label,
                "debit": money(line.debit),
                "credit": money(line.credit),
            })
    statement = money(statement_balance) if statement_balance is not None else None
    return {
        "account_id": account.id,
        "account_code": account.code,
        "account_name": account.name,
        "book_balance": book_balance,
        "reconciled_balance": reconciled_balance,
        "unreconciled_total": book_balance - reconciled_balance,
        "statement_balance": statement,
        "gap": (statement - reconciled_balance) if statement is not None else None,
        "unreconciled_lines": unreconciled_lines,
    }


@router.get("/reports/bank-reconciliation")
def bank_reconciliation_report(account_id: str, statement_balance: Decimal | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    return bank_reconciliation(db, current_user.restaurant_id, account_id, statement_balance)


@router.get("/payments")
def list_payments(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    return db.query(Payment).filter(Payment.restaurant_id == current_user.restaurant_id, Payment.payment_date >= start, Payment.payment_date <= end).order_by(Payment.payment_date.desc()).all()


@router.post("/payments", status_code=201)
def create_payment(payload: PaymentIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    payment = Payment(restaurant_id=current_user.restaurant_id, created_by=current_user.id, payment_date=payload.payment_date or utcnow(), **payload.dict(exclude={"payment_date"}))
    db.add(payment)
    db.flush()
    log_action(db, current_user, "finance.payment_create", "payment", payment.id, "Encaissement / décaissement enregistré")
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/payments/{payment_id}/validate")
def validate_payment(payment_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    payment = db.get(Payment, payment_id)
    if not payment or payment.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    if payment.status != OperationStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Paiement deja traite")
    entry = create_payment_entry(db, current_user.restaurant_id, current_user.id, payment)
    payment.accounting_entry_id = entry.id
    payment.status = OperationStatus.VALIDATED
    payment.validated_by = current_user.id
    payment.validated_at = utcnow()
    log_action(db, current_user, "finance.payment_validate", "payment", payment.id, "Paiement validé")
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/cash-registers")
def list_cash_registers(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    ensure_default_accounting(db, current_user.restaurant_id)
    db.commit()
    return db.query(CashRegister).filter(CashRegister.restaurant_id == current_user.restaurant_id).all()


@router.post("/cash-registers", status_code=201)
def create_cash_register(payload: CashRegisterIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    accounts = ensure_default_accounting(db, current_user.restaurant_id)
    register = CashRegister(restaurant_id=current_user.restaurant_id, account_id=payload.account_id or accounts["cash"].id, name=payload.name, code=payload.code, responsible_user_id=payload.responsible_user_id, is_active=payload.is_active)
    db.add(register)
    db.commit()
    db.refresh(register)
    return register


@router.get("/cash-registers/{cash_register_id}/balance")
def get_cash_balance(cash_register_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    register = db.get(CashRegister, cash_register_id)
    if not register or register.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Caisse introuvable")
    return {"cash_register_id": register.id, "balance": account_balance(db, current_user.restaurant_id, register.account_id)}


@router.get("/bank-accounts")
def list_bank_accounts(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    return db.query(BankAccount).filter(BankAccount.restaurant_id == current_user.restaurant_id).all()


@router.post("/bank-accounts", status_code=201)
def create_bank_account(payload: BankAccountIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    accounts = ensure_default_accounting(db, current_user.restaurant_id)
    bank = BankAccount(restaurant_id=current_user.restaurant_id, account_id=payload.account_id or accounts["bank"].id, bank_name=payload.bank_name, account_name=payload.account_name, account_number=payload.account_number, is_active=payload.is_active)
    db.add(bank)
    db.commit()
    db.refresh(bank)
    return bank


@router.get("/bank-accounts/{bank_account_id}/balance")
def get_bank_balance(bank_account_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    bank = db.get(BankAccount, bank_account_id)
    if not bank or bank.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Compte bancaire introuvable")
    return {"bank_account_id": bank.id, "balance": account_balance(db, current_user.restaurant_id, bank.account_id)}


@router.get("/expense-categories")
def list_expense_categories(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    ensure_default_accounting(db, current_user.restaurant_id)
    db.commit()
    return db.query(ExpenseCategory).filter(ExpenseCategory.restaurant_id == current_user.restaurant_id).order_by(ExpenseCategory.name.asc()).all()


@router.post("/expense-categories", status_code=201)
def create_expense_category(payload: ExpenseCategoryIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    category = ExpenseCategory(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/taxes")
def list_taxes(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    return db.query(Tax).filter(Tax.restaurant_id == current_user.restaurant_id).all()


@router.post("/taxes", status_code=201)
def create_tax(payload: TaxIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    tax = Tax(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(tax)
    db.commit()
    db.refresh(tax)
    return tax


@router.get("/reports/ledger")
def get_ledger(account_id: str | None = None, start_date: datetime | None = None, end_date: datetime | None = None, journal_id: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    query = posted_lines_query(db, current_user.restaurant_id, start, end)
    if account_id:
        query = query.filter(AccountingEntryLine.account_id == account_id)
    if journal_id:
        query = query.filter(AccountingEntry.journal_id == journal_id)
    rows = []
    running: dict[str, Decimal] = {}
    for line, entry, account in query.order_by(AccountingAccount.code.asc(), AccountingEntry.entry_date.asc()).all():
        running[account.id] = running.get(account.id, Decimal("0.00")) + money(line.debit) - money(line.credit)
        rows.append({"date": entry.entry_date, "entry_number": entry.entry_number, "journal_id": entry.journal_id, "reference": entry.reference, "account_id": account.id, "account_code": account.code, "account_name": account.name, "label": line.label, "debit": line.debit, "credit": line.credit, "running_balance": running[account.id]})
    return rows


@router.get("/reports/trial-balance")
def get_trial_balance(start_date: datetime | None = None, end_date: datetime | None = None, type: AccountType | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    rows = trial_balance_rows(db, current_user.restaurant_id, start, end, type)
    return {"rows": rows, "total_debit": sum(row["debit"] for row in rows), "total_credit": sum(row["credit"] for row in rows)}


@router.get("/reports/income-statement")
def get_income_statement(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    rows = trial_balance_rows(db, current_user.restaurant_id, start, end)
    income = [row for row in rows if row["type"] == AccountType.INCOME.value]
    expenses = [row for row in rows if row["type"] == AccountType.EXPENSE.value]
    total_income = sum(row["credit"] - row["debit"] for row in income)
    total_expenses = sum(row["debit"] - row["credit"] for row in expenses)
    return {"products": income, "charges": expenses, "total_products": total_income, "total_charges": total_expenses, "net_result": total_income - total_expenses}


@router.get("/reports/balance-sheet")
def get_balance_sheet(end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    end = end_date or utcnow()
    rows = trial_balance_rows(db, current_user.restaurant_id, None, end)
    assets = [row for row in rows if row["type"] == AccountType.ASSET.value]
    liabilities = [row for row in rows if row["type"] in {AccountType.LIABILITY.value, AccountType.EQUITY.value}]
    income_statement = get_income_statement(None, end, current_user, db)
    total_assets = sum(row["debit_balance"] - row["credit_balance"] for row in assets)
    total_liabilities = sum(row["credit_balance"] - row["debit_balance"] for row in liabilities) + money(income_statement["net_result"])
    return {"assets": assets, "liabilities": liabilities, "net_result": income_statement["net_result"], "total_assets": total_assets, "total_liabilities": total_liabilities, "is_balanced": total_assets == total_liabilities}


@router.get("/reports/cash-flow")
def get_cash_report(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    accounts = ensure_default_accounting(db, current_user.restaurant_id)
    initial = account_balance(db, current_user.restaurant_id, accounts["cash"].id, None, start)
    rows = get_ledger(accounts["cash"].id, start, end, None, current_user, db)
    cash_in = sum(money(row["debit"]) for row in rows)
    cash_out = sum(money(row["credit"]) for row in rows)
    return {"initial_balance": initial, "cash_in": cash_in, "cash_out": cash_out, "net_cash_flow": cash_in - cash_out, "final_balance": initial + cash_in - cash_out, "movements": rows}


@router.get("/reports/bank")
def get_bank_report(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    accounts = ensure_default_accounting(db, current_user.restaurant_id)
    initial = account_balance(db, current_user.restaurant_id, accounts["bank"].id, None, start)
    rows = get_ledger(accounts["bank"].id, start, end, None, current_user, db)
    cash_in = sum(money(row["debit"]) for row in rows)
    cash_out = sum(money(row["credit"]) for row in rows)
    return {"initial_balance": initial, "bank_in": cash_in, "bank_out": cash_out, "net_flow": cash_in - cash_out, "final_balance": initial + cash_in - cash_out, "movements": rows}


@router.get("/reports/journal")
def get_accounting_journal(start_date: datetime | None = None, end_date: datetime | None = None, journal_id: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    return get_ledger(None, start_date, end_date, journal_id, current_user, db)


@router.get("/reports/expenses")
def get_expense_report(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    statement = get_income_statement(start_date, end_date, current_user, db)
    total = money(statement["total_charges"])
    return {"total": total, "rows": [{**row, "percent": float(((row["debit"] - row["credit"]) / total * 100) if total else 0)} for row in statement["charges"]]}


@router.get("/reports/revenues")
def get_revenue_report(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    statement = get_income_statement(start_date, end_date, current_user, db)
    total = money(statement["total_products"])
    return {"total": total, "rows": [{**row, "percent": float(((row["credit"] - row["debit"]) / total * 100) if total else 0)} for row in statement["products"]]}


@router.get("/reports/monthly-result")
def monthly_result(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    rows = posted_lines_query(db, current_user.restaurant_id).all()
    months: dict[str, dict] = {}
    for line, entry, account in rows:
        key = entry.entry_date.strftime("%Y-%m")
        bucket = months.setdefault(key, {"month": key, "revenues": Decimal("0.00"), "expenses": Decimal("0.00"), "net_result": Decimal("0.00")})
        if account.type == AccountType.INCOME:
            bucket["revenues"] += money(line.credit) - money(line.debit)
        if account.type == AccountType.EXPENSE:
            bucket["expenses"] += money(line.debit) - money(line.credit)
        bucket["net_result"] = bucket["revenues"] - bucket["expenses"]
    return list(sorted(months.values(), key=lambda row: row["month"]))


@router.get("/reports/payables")
def supplier_debts(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    accounts = ensure_default_accounting(db, current_user.restaurant_id)
    return {"account_id": accounts["suppliers"].id, "balance": -account_balance(db, current_user.restaurant_id, accounts["suppliers"].id)}


@router.get("/reports/receivables")
def customer_receivables(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    accounts = ensure_default_accounting(db, current_user.restaurant_id)
    return {"account_id": accounts["customers"].id, "balance": account_balance(db, current_user.restaurant_id, accounts["customers"].id)}


@router.get("/reports/stock-valuation")
def stock_valuation(depot_id: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    try:
        from app.modules.stock.router import get_global_stock
        return get_global_stock(current_user, db)
    except Exception as exc:
        return {"warning": f"Etat de stock valorise indisponible: {exc}"}


def vat_declaration_totals(db: Session, restaurant_id: str, start: datetime, end: datetime) -> dict:
    """Agrège la TVA collectée (4457) et déductible (4456) sur une période.

    Retourne collected, deductible, net_vat_due (à payer si >0) et vat_credit
    (crédit reportable si la déductible dépasse la collectée).
    """
    accounts = ensure_default_accounting(db, restaurant_id)
    collected_id = accounts["vat_collected"].id
    deductible_id = accounts["vat_deductible"].id
    collected = Decimal("0.00")
    deductible = Decimal("0.00")
    for line, _entry, account in posted_lines_query(db, restaurant_id, start, end).all():
        if account.id == collected_id:
            collected += money(line.credit) - money(line.debit)
        elif account.id == deductible_id:
            deductible += money(line.debit) - money(line.credit)
    net = collected - deductible
    return {
        "rate": float(VAT_RATE),
        "vat_collected": collected,
        "vat_deductible": deductible,
        "net_vat_due": net if net > 0 else Decimal("0.00"),
        "vat_credit": (-net) if net < 0 else Decimal("0.00"),
    }


@router.get("/reports/vat-declaration")
def vat_declaration(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Déclaration de TVA (collectée / déductible / net à payer) sur une période (mois)."""
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    totals = vat_declaration_totals(db, current_user.restaurant_id, start, end)
    return {"start_date": start, "end_date": end, **totals}


@router.post("/stock-movements/{movement_id}/generate-entry", status_code=201)
def generate_stock_accounting_entry(movement_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    movement = db.get(StockMovement, movement_id)
    if not movement or movement.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Mouvement de stock introuvable")
    if movement.status != StockMovementStatus.VALIDATED:
        raise HTTPException(status_code=400, detail="Seuls les mouvements de stock valides peuvent generer une ecriture")
    accounts = ensure_default_accounting(db, current_user.restaurant_id)
    amount = money(movement.total_amount or (movement.quantity * (movement.unit_price or 0)))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le mouvement de stock n'a pas de valeur comptable")
    journal = journal_by_type(db, current_user.restaurant_id, JournalType.STOCK)
    if movement.movement_type in {StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY}:
        lines = [
            EntryLineIn(account_id=accounts["stock"].id, label="Entree de stock", debit=amount, credit=0),
            EntryLineIn(account_id=accounts["suppliers"].id, label="Dette fournisseur stock", debit=0, credit=amount),
        ]
    elif movement.movement_type in {StockMovementType.LOSS, StockMovementType.INVENTORY_MINUS}:
        lines = [
            EntryLineIn(account_id=accounts["misc_expense"].id, label="Perte ou ajustement de stock", debit=amount, credit=0),
            EntryLineIn(account_id=accounts["stock"].id, label="Sortie de stock", debit=0, credit=amount),
        ]
    else:
        raise HTTPException(status_code=400, detail="Ce type de mouvement stock ne genere pas d'ecriture automatique")
    entry = create_accounting_entry(
        db,
        current_user.restaurant_id,
        current_user.id,
        EntryIn(
            entry_date=movement.movement_date,
            journal_id=journal.id,
            reference=movement.reference or movement.id,
            description=movement.reason or "Ecriture automatique stock",
            source_type="stock_movement",
            source_id=movement.id,
            lines=lines,
        ),
        status=EntryStatus.POSTED,
    )
    db.commit()
    return entry_public(db, entry)


@router.post("/period-closes", status_code=201)
def close_period(payload: ClosePeriodIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    rows = trial_balance_rows(db, current_user.restaurant_id, payload.start_date, payload.end_date)
    if sum(row["debit"] for row in rows) != sum(row["credit"] for row in rows):
        raise HTTPException(status_code=400, detail="Balance non equilibree: cloture impossible")
    close = AccountingPeriodClose(restaurant_id=current_user.restaurant_id, start_date=payload.start_date, end_date=payload.end_date, closed_by=current_user.id, note=payload.note)
    db.add(close)
    db.commit()
    db.refresh(close)
    return close


@router.get("/settings/statement-mappings")
def list_statement_mappings(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    return db.query(FinancialStatementMapping).filter(FinancialStatementMapping.restaurant_id == current_user.restaurant_id).all()


@router.get("/summary")
def summary(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    statement = get_income_statement(start_date, end_date, current_user, db)
    cash = get_cash_report(start_date, end_date, current_user, db)
    bank = get_bank_report(start_date, end_date, current_user, db)
    return {"start_date": start_date, "end_date": end_date, "revenue": statement["total_products"], "expenses": statement["total_charges"], "net_profit": statement["net_result"], "cash_balance": cash["final_balance"], "bank_balance": bank["final_balance"]}


@router.get("/statements")
def financial_statements(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    return {"income_statement": get_income_statement(start_date, end_date, current_user, db), "cash_flow": get_cash_report(start_date, end_date, current_user, db), "balance_sheet": get_balance_sheet(end_date, current_user, db), "trial_balance": get_trial_balance(start_date, end_date, None, current_user, db)}


@router.post("/reports/export-audit", status_code=204)
def audit_finance_export(payload: ExportAuditIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    log_action(db, current_user, "finance.report_export", "finance_report", payload.report_type, f"Export {payload.format} - {payload.report_type}")
    db.commit()
    return None


# Compatibilite: anciennes routes analytiques, maintenant derivees des ecritures ou des commandes.
@router.get("/dish-margins")
def dish_margins(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    rows = (
        db.query(CustomerOrderItem.menu_item_id, CustomerOrderItem.name, func.coalesce(func.sum(CustomerOrderItem.quantity), 0), func.coalesce(func.sum(CustomerOrderItem.line_total), 0))
        .join(CustomerOrder, CustomerOrder.id == CustomerOrderItem.order_id)
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id, CustomerOrder.created_at >= start, CustomerOrder.created_at <= end, CustomerOrder.status != "Annulée")
        .group_by(CustomerOrderItem.menu_item_id, CustomerOrderItem.name)
        .all()
    )
    from app.modules.stock.router import compute_dish_costs

    costs = compute_dish_costs(db, current_user.restaurant_id)
    result = []
    for menu_item_id, name, quantity, revenue in rows:
        qty = int(quantity or 0)
        rev = money(revenue or 0)
        unit_cost = money(costs.get(menu_item_id, Decimal("0")))
        total_cost = money(unit_cost * qty)
        margin = rev - total_cost
        result.append({
            "menu_item_id": menu_item_id,
            "name": name,
            "quantity_sold": qty,
            "revenue": rev,
            "unit_cost": unit_cost,
            "estimated_cost": total_cost,
            "estimated_margin": margin,
            "margin_rate": round(float(margin / rev * 100), 2) if rev else 0,
            "food_cost_rate": round(float(total_cost / rev * 100), 2) if rev else 0,
        })
    return result


@router.get("/reports/food-cost")
def food_cost_report(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Food-cost % global et par catégorie (coût matière CMUP / CA) sur une période."""
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    from app.modules.catalog.models import MenuCategory, MenuItem
    from app.modules.stock.router import compute_dish_costs

    start, end = report_range(start_date, end_date)
    costs = compute_dish_costs(db, current_user.restaurant_id)
    rows = (
        db.query(CustomerOrderItem.menu_item_id, func.coalesce(func.sum(CustomerOrderItem.quantity), 0), func.coalesce(func.sum(CustomerOrderItem.line_total), 0))
        .join(CustomerOrder, CustomerOrder.id == CustomerOrderItem.order_id)
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id, CustomerOrder.created_at >= start, CustomerOrder.created_at <= end, CustomerOrder.status != "Annulée")
        .group_by(CustomerOrderItem.menu_item_id)
        .all()
    )
    category_of = {item.id: item.category_id for item in db.query(MenuItem).filter(MenuItem.restaurant_id == current_user.restaurant_id).all()}
    category_name = {cat.id: cat.name for cat in db.query(MenuCategory).filter(MenuCategory.restaurant_id == current_user.restaurant_id).all()}

    total_revenue = Decimal("0")
    total_cost = Decimal("0")
    by_category: dict[str, dict] = {}
    for menu_item_id, quantity, revenue in rows:
        rev = money(revenue or 0)
        cost = money(money(costs.get(menu_item_id, Decimal("0"))) * int(quantity or 0))
        total_revenue += rev
        total_cost += cost
        name = category_name.get(category_of.get(menu_item_id), "Sans catégorie")
        bucket = by_category.setdefault(name, {"category": name, "revenue": Decimal("0"), "material_cost": Decimal("0")})
        bucket["revenue"] += rev
        bucket["material_cost"] += cost
    for bucket in by_category.values():
        bucket["margin"] = bucket["revenue"] - bucket["material_cost"]
        bucket["food_cost_rate"] = round(float(bucket["material_cost"] / bucket["revenue"] * 100), 2) if bucket["revenue"] else 0

    return {
        "start_date": start,
        "end_date": end,
        "revenue": total_revenue,
        "material_cost": total_cost,
        "margin": total_revenue - total_cost,
        "food_cost_rate": round(float(total_cost / total_revenue * 100), 2) if total_revenue else 0,
        "by_category": sorted(by_category.values(), key=lambda row: row["category"]),
    }


# Colonnes normalisées du Fichier des Écritures Comptables (FEC), séparées par tabulation.
FEC_HEADER = [
    "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib",
    "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit",
    "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
]


def _fec_amount(value) -> str:
    # FEC : séparateur décimal virgule.
    return f"{money(value):.2f}".replace(".", ",")


def _fec_date(value) -> str:
    return value.strftime("%Y%m%d") if value else ""


def _fec_clean(value) -> str:
    # Aucune tabulation / saut de ligne dans une cellule (sinon le TSV est cassé).
    return str(value or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def build_fec_rows(db: Session, restaurant_id: str, start: datetime, end: datetime) -> list[list[str]]:
    """Construit les lignes FEC (en-tête + écritures POSTÉES) sur une période."""
    journals = {j.id: j for j in db.query(AccountingJournal).filter(AccountingJournal.restaurant_id == restaurant_id).all()}
    query = posted_lines_query(db, restaurant_id, start, end).order_by(
        AccountingEntry.entry_date.asc(), AccountingEntry.entry_number.asc(), AccountingEntryLine.created_at.asc()
    )
    rows = [list(FEC_HEADER)]
    for line, entry, account in query.all():
        journal = journals.get(entry.journal_id)
        rows.append([
            _fec_clean(journal.code if journal else ""),
            _fec_clean(journal.name if journal else ""),
            _fec_clean(entry.entry_number),
            _fec_date(entry.entry_date),
            _fec_clean(account.code),
            _fec_clean(account.name),
            _fec_clean(line.third_party_id or ""),
            _fec_clean(line.third_party_type.value if line.third_party_type else ""),
            _fec_clean(entry.reference or entry.entry_number),
            _fec_date(entry.entry_date),
            _fec_clean(line.label),
            _fec_amount(line.debit),
            _fec_amount(line.credit),
            "",  # EcritureLet (lettrage non géré)
            "",  # DateLet
            _fec_date(entry.posted_at or entry.entry_date),
            "",  # Montantdevise
            "",  # Idevise
        ])
    return rows


@router.get("/reports/fec")
def export_fec(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Export FEC (Fichier des Écritures Comptables) — texte tabulé, ouvrable dans Excel."""
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    rows = build_fec_rows(db, current_user.restaurant_id, start, end)
    content = "\n".join("\t".join(row) for row in rows)
    filename = f"FEC_{start:%Y%m%d}_{end:%Y%m%d}.txt"
    log_action(db, current_user, "finance.report_export", "finance_report", "fec", "Export FEC")
    db.commit()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/stock-rotation")
def stock_rotation(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    return dish_margins(start_date, end_date, current_user, db)


@router.get("/server-revenue")
def server_revenue(start_date: datetime | None = None, end_date: datetime | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    return []


def calculate_promo_discount(promo: PromotionCode, order_amount: Decimal) -> Decimal:
    amount = money(order_amount) * money(promo.discount_value) / Decimal("100") if promo.discount_type == "PERCENT" else money(promo.discount_value)
    if promo.max_discount_amount is not None:
        amount = min(amount, money(promo.max_discount_amount))
    return max(Decimal("0.00"), min(money(order_amount), money(amount)))


@router.get("/promotions")
def list_promotions(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.CASHIER_READ)
    return db.query(PromotionCode).filter(PromotionCode.restaurant_id == current_user.restaurant_id).order_by(PromotionCode.created_at.desc()).all()


@router.post("/promotions", status_code=201)
def create_promotion(payload: PromotionCodeIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    promo = PromotionCode(restaurant_id=current_user.restaurant_id, created_by_id=current_user.id, **payload.dict())
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return promo


@router.patch("/promotions/{promo_id}")
def update_promotion(promo_id: str, payload: PromotionCodeUpdateIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    promo = db.get(PromotionCode, promo_id)
    if not promo or promo.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Code promo introuvable")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(promo, field, value)
    db.commit()
    db.refresh(promo)
    return promo


@router.delete("/promotions/{promo_id}", status_code=204)
def delete_promotion(promo_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    promo = db.get(PromotionCode, promo_id)
    if not promo or promo.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Code promo introuvable")
    promo.is_active = False
    db.commit()
    return None


@router.post("/promotions/quote")
def quote_promotion(payload: PromoQuoteIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.CASHIER_READ)
    promo = db.query(PromotionCode).filter(PromotionCode.restaurant_id == current_user.restaurant_id, PromotionCode.code == payload.code.strip().upper(), PromotionCode.is_active.is_(True)).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Code promo introuvable")
    discount = calculate_promo_discount(promo, payload.order_amount)
    return {"code": promo.code, "label": promo.label, "discount_amount": discount, "final_amount": money(payload.order_amount) - discount}


@router.post("/migrate-legacy")
def migrate_legacy_finance(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    migrated = 0
    ensure_default_accounting(db, current_user.restaurant_id)
    inspector = inspect(db.bind)
    if "restaurant_expenses" not in inspector.get_table_names():
        return {"migrated": 0, "message": "Aucune ancienne table restaurant_expenses detectee"}
    existing = db.query(Expense.id).filter(Expense.restaurant_id == current_user.restaurant_id).first()
    if existing:
        return {"migrated": 0, "message": "Migration deja effectuee ou nouvelles depenses presentes"}
    rows = db.execute(text("SELECT id, label, category, amount, payment_method, reference, note, expense_date, created_by_id FROM restaurant_expenses WHERE restaurant_id = :rid AND is_active = TRUE"), {"rid": current_user.restaurant_id}).mappings().all()
    categories = {category.name.lower(): category for category in db.query(ExpenseCategory).filter(ExpenseCategory.restaurant_id == current_user.restaurant_id).all()}
    for row in rows:
        category = categories.get(str(row["category"] or "Autres charges").lower())
        expense = Expense(
            id=row["id"],
            restaurant_id=current_user.restaurant_id,
            expense_date=row["expense_date"] or utcnow(),
            category_id=category.id if category else None,
            amount=money(row["amount"]),
            tax_amount=Decimal("0.00"),
            total_amount=money(row["amount"]),
            payment_status=PaymentStatus.PAID,
            description=row["label"],
            reference=row["reference"],
            status=OperationStatus.DRAFT,
            created_by=row["created_by_id"] or current_user.id,
        )
        db.add(expense)
        migrated += 1
    db.commit()
    return {"migrated": migrated, "message": "Anciennes depenses migrees en brouillon. Validez-les pour generer les ecritures."}
