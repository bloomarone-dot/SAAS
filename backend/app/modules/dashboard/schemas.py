from pydantic import BaseModel


class AdminDashboardSummaryOut(BaseModel):
    revenue: float
    orders_count: int
    restaurants_count: int
    users_count: int
    active_users_count: int
