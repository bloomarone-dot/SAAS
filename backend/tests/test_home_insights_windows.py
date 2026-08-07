"""Fenêtres de comparaison home-insights (jour / semaine / mois)."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


class MonthToDateReferenceTests(unittest.TestCase):
    def test_july_18_compares_to_june_18_same_clock(self):
        from app.modules.dashboard.router import _month_to_date_reference

        now = datetime(2026, 7, 18, 14, 32, 0)
        start, cutoff = _month_to_date_reference(now)
        self.assertEqual(start, datetime(2026, 6, 1, 0, 0, 0))
        self.assertEqual(cutoff, datetime(2026, 6, 18, 14, 32, 0))

    def test_march_31_clamps_to_february_end(self):
        from app.modules.dashboard.router import _month_to_date_reference

        now = datetime(2026, 3, 31, 10, 0, 0)
        start, cutoff = _month_to_date_reference(now)
        self.assertEqual(start, datetime(2026, 2, 1, 0, 0, 0))
        self.assertEqual(cutoff.month, 2)
        self.assertEqual(cutoff.day, 28)
        self.assertEqual(cutoff.hour, 10)

    def test_january_compares_to_previous_year_december(self):
        from app.modules.dashboard.router import _month_to_date_reference

        now = datetime(2026, 1, 10, 9, 15, 0)
        start, cutoff = _month_to_date_reference(now)
        self.assertEqual(start, datetime(2025, 12, 1, 0, 0, 0))
        self.assertEqual(cutoff, datetime(2025, 12, 10, 9, 15, 0))


class HomeInsightsWindowIntegrationTests(unittest.TestCase):
    """Vérifie que les bornes jour/semaine/mois sont bien appliquées."""

    def test_home_insights_calls_revenue_with_expected_windows(self):
        from app.modules.dashboard import router as dashboard_router

        tz = timezone.utc
        now = datetime(2026, 7, 15, 16, 0, 0, tzinfo=tz)  # mercredi
        calls = []

        def fake_revenue(_db, _rid, start, end, _branch=None):
            calls.append((start, end))
            return 100.0

        user = type("U", (), {"restaurant_id": "resto-1", "role": "ADMIN", "permissions": []})()
        restaurant = type("R", (), {"timezone": "UTC"})()
        db = type("DB", (), {"get": staticmethod(lambda _model, _id: restaurant)})()

        with patch.object(dashboard_router, "_resolve_restaurant_tz", return_value=tz), patch.object(
            dashboard_router, "_insights_local_now", return_value=now
        ), patch.object(
            dashboard_router, "_revenue_until", side_effect=fake_revenue
        ), patch.object(dashboard_router, "assert_permission"), patch.object(
            dashboard_router,
            "_compute_recent_trend_local",
            return_value=("ok", "neutral", [1, 2, 3, 4, 5]),
        ):
            payload = dashboard_router.home_insights(branch_id=None, current_user=user, db=db)

        self.assertGreaterEqual(len(calls), 6)
        self.assertEqual(payload["time_label"], "16h00")

        day_current = calls[0]
        day_ref = calls[1]
        self.assertEqual(day_current[0], datetime(2026, 7, 15, 0, 0, 0))
        self.assertEqual(day_current[1], datetime(2026, 7, 15, 16, 0, 0))
        self.assertEqual(day_ref[0], datetime(2026, 7, 14, 0, 0, 0))
        self.assertEqual(day_ref[1], datetime(2026, 7, 14, 16, 0, 0))

        week_current = calls[2]
        week_ref = calls[3]
        self.assertEqual(week_current[0], datetime(2026, 7, 13, 0, 0, 0))  # lundi
        self.assertEqual(week_current[1], datetime(2026, 7, 15, 16, 0, 0))
        self.assertEqual(week_ref[0], datetime(2026, 7, 6, 0, 0, 0))
        self.assertEqual(week_ref[1], datetime(2026, 7, 8, 16, 0, 0))

        month_current = calls[4]
        month_ref = calls[5]
        self.assertEqual(month_current[0], datetime(2026, 7, 1, 0, 0, 0))
        self.assertEqual(month_current[1], datetime(2026, 7, 15, 16, 0, 0))
        self.assertEqual(month_ref[0], datetime(2026, 6, 1, 0, 0, 0))
        self.assertEqual(month_ref[1], datetime(2026, 6, 15, 16, 0, 0))

        day_card = next(card for card in payload["cards"] if card["key"] == "today_vs_yesterday")
        self.assertIn("00h00 → 16h00", day_card["current_period_label"])
        self.assertIn("Hier", day_card["comparison_period_label"])

        week_card = next(card for card in payload["cards"] if card["key"] == "today_vs_last_week")
        self.assertIn("lundi → mercredi", week_card["current_period_label"])

        month_card = next(card for card in payload["cards"] if card["key"] == "today_vs_prev_month_week")
        self.assertIn("1 au 15 juillet", month_card["current_period_label"])
        self.assertIn("1 au 15 juin", month_card["comparison_period_label"])

    def test_insights_local_now_advances(self):
        from app.modules.dashboard.router import _insights_local_now

        tz = timezone(timedelta(hours=1))
        first = _insights_local_now(tz)
        second = _insights_local_now(tz)
        self.assertEqual(first.utcoffset(), timedelta(hours=1))
        self.assertGreaterEqual(second, first)


class AnalyticsBoundsTests(unittest.TestCase):
    def test_coerce_timezone_aware_dates_to_utc_naive(self):
        from app.modules.dashboard.router import _analytics_bounds, _coerce_db_datetime

        aware = datetime(2026, 8, 7, 22, 59, 59, tzinfo=timezone.utc)
        self.assertEqual(_coerce_db_datetime(aware), datetime(2026, 8, 7, 22, 59, 59))

        start, end = _analytics_bounds(
            datetime(2026, 8, 6, 23, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 8, 7, 22, 59, 59, tzinfo=timezone.utc),
        )
        self.assertIsNone(start.tzinfo)
        self.assertIsNone(end.tzinfo)
        self.assertEqual(start, datetime(2026, 8, 6, 23, 0, 0))
        self.assertEqual(end, datetime(2026, 8, 7, 22, 59, 59))


if __name__ == "__main__":
    unittest.main()
