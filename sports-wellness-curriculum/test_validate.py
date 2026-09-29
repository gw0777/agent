import copy
import json
import tempfile
import unittest
from pathlib import Path

import validate as v

BASE = json.loads(v.DEFAULT_DATA.read_text(encoding="utf-8"))


def statuses(results, item_prefix):
    return [s for s, item, _ in results if item.startswith(item_prefix)]


def fill_all(data, mode="원격", practice=0):
    """모든 빈 슬롯을 채운 가상 데이터 (트랙 선언 학점에 맞춤)."""
    d = copy.deepcopy(data)
    for t in d["tracks"]:
        remaining = t["declared_credits"] - sum(c["credits"] or 0 for c in t["courses"])
        empty = [c for c in t["courses"] if c["credits"] is None]
        for i, c in enumerate(empty):
            share = remaining // len(empty) + (1 if i < remaining % len(empty) else 0)
            c["credits"] = share
        for i, c in enumerate(t["courses"]):
            c["name"] = c["name"] or f"{t['id']}-{i}"
            c["practice"] = practice
            c["theory"] = c["credits"]
            c["mode"] = mode
    return d


class TestCurrentData(unittest.TestCase):
    def test_current_data_has_no_violations(self):
        results = v.validate(BASE)
        self.assertNotIn(v.FAIL, [s for s, _, _ in results])

    def test_structural_rules_pass(self):
        results = v.validate(BASE)
        for item in ("총 전공학점", "코어트랙 수", "코어트랙 합계", "실무트랙 유형 수", "실무트랙 합계"):
            self.assertEqual(statuses(results, item), [v.PASS], item)

    def test_pending_items_reported(self):
        results = v.validate(BASE)
        self.assertEqual(statuses(results, "실험·실습 편성 비율"), [v.PENDING])
        self.assertEqual(statuses(results, "원격 비율"), [v.PENDING])


class TestRules(unittest.TestCase):
    def test_total_over_84_fails(self):
        d = copy.deepcopy(BASE)
        d["tracks"][0]["declared_credits"] += 2  # 83 → 85
        self.assertIn(v.FAIL, statuses(v.check_totals(d), "총 전공학점"))

    def test_core_track_over_21_fails(self):
        d = copy.deepcopy(BASE)
        d["tracks"][2]["declared_credits"] = 22
        self.assertIn(v.FAIL, statuses(v.check_totals(d), "코어 건강증진"))

    def test_region_track_rejected(self):
        d = copy.deepcopy(BASE)
        d["tracks"][4]["field_type"] = "③-L"
        self.assertIn(v.FAIL, statuses(v.check_totals(d), "실무트랙 유형"))

    def test_track_credit_mismatch_fails(self):
        d = fill_all(BASE)
        d["tracks"][0]["courses"][0]["credits"] = 2
        self.assertIn(v.FAIL, statuses(v.check_tracks(d), "전공탐색트랙"))

    def test_full_remote_passes(self):
        d = fill_all(BASE)
        self.assertEqual(statuses(v.check_ratios(d), "원격 비율"), [v.PASS])
        self.assertEqual(statuses(v.check_ratios(d), "실험·실습"), [v.PASS])

    def test_seven_offline_courses_fail_remote_ratio(self):
        d = fill_all(BASE)
        courses = [c for t in d["tracks"] for c in t["courses"]]
        for c in courses[:7]:  # 24/31 = 77.4%
            c["mode"] = "실기"
        self.assertEqual(statuses(v.check_ratios(d), "원격 비율"), [v.FAIL])

    def test_six_offline_courses_pass_remote_ratio(self):
        d = fill_all(BASE)
        courses = [c for t in d["tracks"] for c in t["courses"]]
        for c in courses[:6]:  # 25/31 = 80.6%
            c["mode"] = "실기"
        self.assertEqual(statuses(v.check_ratios(d), "원격 비율"), [v.PASS])

    def test_practice_everywhere_fails_ratio(self):
        d = fill_all(BASE, practice=1)
        self.assertEqual(statuses(v.check_ratios(d), "실험·실습"), [v.FAIL])

    def test_forbidden_term_detected(self):
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write("노인 및 적응체육론")
        try:
            self.assertEqual(statuses(v.check_terms([f.name]), "용어"), [v.FAIL])
        finally:
            Path(f.name).unlink()


if __name__ == "__main__":
    unittest.main()
