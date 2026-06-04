from pydantic import BaseModel


class AdminDashboardWeeklyPoint(BaseModel):
    label: str
    revenue: float
    orders_count: int


class AdminDashboardBranchPoint(BaseModel):
    id: str | None = None
    name: str
    city: str | None = None
    revenue: float
    meal_revenue: float = 0
    drink_revenue: float = 0
    profit: float = 0
    orders_count: int = 0
    users_count: int
    active_users_count: int
    share: float


class AdminDashboardCashRegisterPoint(BaseModel):
    key: str
    label: str
    revenue: float
    profit: float
    orders_count: int
    share: float


class AdminDashboardActivity(BaseModel):
    label: str
    value: str
    time: str


class AdminDashboardSummaryOut(BaseModel):
    revenue: float
    orders_count: int
    branches_count: int
    users_count: int
    active_users_count: int
    profit: float = 0
    meal_revenue: float = 0
    drink_revenue: float = 0
    cash_registers: list[AdminDashboardCashRegisterPoint] = []
    weekly_revenue: list[AdminDashboardWeeklyPoint]
    branches: list[AdminDashboardBranchPoint]
    top_branches: list[AdminDashboardBranchPoint]
    recent_activities: list[AdminDashboardActivity]
    low_stock_count: int = 0
