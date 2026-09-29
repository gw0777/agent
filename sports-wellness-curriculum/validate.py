"""스포츠웰니스경영학 전공교육과정 편성 검증 스크립트.

curriculum.json의 편성 수치를 양식 기준(인문사회계열)과 대조한다.
null로 남은 항목은 '대기'로 보고하고, 확정된 값끼리 어긋나면 '위반'으로 보고한다.

사용법:
    python3 validate.py                 # 기본 데이터와 초안 검증
    python3 validate.py path/to.json    # 다른 데이터 파일 검증
종료 코드: 위반이 있으면 1, 없으면 0 (대기는 실패로 보지 않음)
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_DATA = HERE / "data" / "curriculum.json"

PASS, FAIL, PENDING = "통과", "위반", "대기"

# 사용자 용어 규칙: '적응 체육'은 쓰지 않고 '특수체육'으로 통일한다.
FORBIDDEN_TERMS = {"적응 체육": "특수체육", "적응체육": "특수체육"}


def _known(values):
    return all(v is not None for v in values)


def check_tracks(data):
    """트랙별 선언 과목 수·학점과 실제 입력값의 정합성."""
    results = []
    for t in data["tracks"]:
        courses = t["courses"]
        label = f"{t['name']} 구성"
        if len(courses) != t["declared_courses"]:
            results.append((FAIL, label, f"과목 수 {len(courses)} ≠ 선언 {t['declared_courses']}"))
            continue
        credits = [c["credits"] for c in courses]
        filled = [c for c in credits if c is not None]
        if sum(filled) > t["declared_credits"]:
            results.append((FAIL, label, f"입력 학점 합 {sum(filled)} > 선언 {t['declared_credits']}"))
        elif _known(credits):
            if sum(credits) != t["declared_credits"]:
                results.append((FAIL, label, f"학점 합 {sum(credits)} ≠ 선언 {t['declared_credits']}"))
            else:
                results.append((PASS, label, f"{len(courses)}과목 {sum(credits)}학점"))
        else:
            missing = credits.count(None)
            results.append((PENDING, label, f"학점 미확정 {missing}과목 (입력 {sum(filled)}/{t['declared_credits']}학점)"))
        for c in courses:
            if _known([c["credits"], c["theory"], c["practice"]]) and c["theory"] + c["practice"] < c["credits"]:
                results.append((FAIL, label, f"{c['name']}: 이론+실습 시수 {c['theory'] + c['practice']} < 학점 {c['credits']}"))
    return results


def check_totals(data):
    r = data["rules"]
    tracks = data["tracks"]
    results = []

    total = sum(t["declared_credits"] for t in tracks)
    ok = r["total_credits_min"] <= total <= r["total_credits_max"]
    results.append((PASS if ok else FAIL, "총 전공학점",
                    f"{total}학점 (기준 {r['total_credits_min']}~{r['total_credits_max']})"))

    cores = [t for t in tracks if t["group"] == "코어"]
    n = len(cores)
    ok = r["core_track_count_min"] <= n <= r["core_track_count_max"]
    results.append((PASS if ok else FAIL, "코어트랙 수", f"{n}개 (기준 {r['core_track_count_min']}~{r['core_track_count_max']})"))
    core_sum = sum(t["declared_credits"] for t in cores)
    results.append((PASS if core_sum >= r["core_total_min"] else FAIL, "코어트랙 합계",
                    f"{core_sum}학점 (기준 {r['core_total_min']} 이상)"))
    for t in cores:
        c = t["declared_credits"]
        ok = r["core_each_min"] <= c <= r["core_each_max"]
        results.append((PASS if ok else FAIL, f"코어 {t['name']}", f"{c}학점 (기준 {r['core_each_min']}~{r['core_each_max']})"))

    fields = [t for t in tracks if t["group"] == "실무"]
    types = sorted({t["field_type"] for t in fields})
    if "③-L" in types:
        results.append((FAIL, "실무트랙 유형", "③-L 지역연계 혁신과정은 혁신교과목 운영 실적이 없어 편성 불가로 결정됨"))
    results.append((PASS if len(types) >= r["field_track_type_min"] else FAIL, "실무트랙 유형 수",
                    f"{len(types)}개 {types} (기준 {r['field_track_type_min']} 이상)"))
    field_sum = sum(t["declared_credits"] for t in fields)
    results.append((PASS if field_sum >= r["field_total_min"] else FAIL, "실무트랙 합계",
                    f"{field_sum}학점 (기준 {r['field_total_min']} 이상)"))
    return results


def check_ratios(data):
    r = data["rules"]
    courses = [c for t in data["tracks"] for c in t["courses"]]
    results = []

    modes = [c["mode"] for c in courses]
    if _known(modes):
        remote = sum(1 for m in modes if m == "원격")
        ratio = remote / len(courses)
        results.append((PASS if ratio >= r["remote_ratio_min"] else FAIL, "원격 비율(과목 수)",
                        f"{remote}/{len(courses)} = {ratio:.1%} (기준 {r['remote_ratio_min']:.0%} 이상)"))
    else:
        need = len(courses) - int(len(courses) * r["remote_ratio_min"] + 0.9999)
        results.append((PENDING, "원격 비율(과목 수)",
                        f"운영형태 미확정 {modes.count(None)}과목 — {len(courses)}과목 기준 실기(대면) 최대 {need}과목"))

    # 실험·실습 편성 비율: 실습 시수가 있는 과목(이론+실습 병행 또는 실습만)을 실험실습 과목으로 본다.
    hours = [(c["credits"], c["practice"]) for c in courses]
    if _known([h for pair in hours for h in pair]):
        prac = [cr for cr, p in hours if p > 0]
        by_count = len(prac) / len(courses)
        by_credit = sum(prac) / sum(cr for cr, _ in hours)
        worst = max(by_count, by_credit)
        results.append((PASS if worst <= r["practice_ratio_max"] else FAIL, "실험·실습 편성 비율",
                        f"과목 {by_count:.1%} / 학점 {by_credit:.1%} (기준 {r['practice_ratio_max']:.0%} 이하)"))
    else:
        results.append((PENDING, "실험·실습 편성 비율", "시수 자료 대기 (추가 교육과정 자료 업로드 후 확정)"))
    return results


def check_terms(paths):
    results = []
    for p in paths:
        text = Path(p).read_text(encoding="utf-8")
        for bad, good in FORBIDDEN_TERMS.items():
            n = text.count(bad)
            if n:
                results.append((FAIL, f"용어 {Path(p).name}", f"'{bad}' {n}회 → '{good}'로 수정"))
    if not results:
        results.append((PASS, "용어 통일", "'적응 체육' 미사용"))
    return results


def validate(data, text_paths=()):
    return check_tracks(data) + check_totals(data) + check_ratios(data) + check_terms(text_paths)


def main(argv):
    data_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_DATA
    data = json.loads(data_path.read_text(encoding="utf-8"))
    results = validate(data, sorted(HERE.glob("*.md")))
    for status, item, detail in results:
        print(f"[{status}] {item}: {detail}")
    counts = {s: sum(1 for r in results if r[0] == s) for s in (PASS, FAIL, PENDING)}
    print(f"\n요약: 통과 {counts[PASS]} / 위반 {counts[FAIL]} / 대기 {counts[PENDING]}")
    return 1 if counts[FAIL] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
