#!/usr/bin/env python3
"""ISCU URL Shortener: public 20-point HTTP functional checker.

Student:
    python iscu_url_shortener_check.py --url https://YOUR-PROJECT.vercel.app

Local dev (opt-in):
    python iscu_url_shortener_check.py --url http://localhost:3000 --allow-local

Instructor batch (CSV headers: student_id,vercel_url):
    python iscu_url_shortener_check.py --csv students.csv --output results.csv

Requires: requests  (python -m pip install requests)
"""

from __future__ import annotations

import argparse
import csv
import json
import secrets
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlsplit

import requests

POINTS = {
    "T01": 1, "T02": 3, "T03": 1, "T04": 1,
    "T05": 3, "T06": 2, "T07": 1, "T08": 1,
    "T09": 2, "T10": 3, "T11": 2,
}
ORDER = list(POINTS)
TIMEOUT = 10


@dataclass
class Result:
    id: str
    status: str  # PASS, FAIL, BLOCKED, REVIEW
    points: int
    earned: int
    detail: str


def validate_base(raw: str, allow_local: bool = False) -> str:
    """Allow HTTPS Vercel hosts, or explicit local loopback-only testing.

    Limiting the host prevents this distributed checker from becoming a
    generic URL-fetching / internal-network probing tool. Custom domains
    must be reviewed by the instructor separately.
    """
    parsed = urlsplit(raw.strip())
    host = (parsed.hostname or "").lower()
    if (
        allow_local and parsed.scheme == "http"
        and host in ("localhost", "127.0.0.1")
        and parsed.port == 3000
        and not parsed.username and not parsed.password
        and parsed.path in ("", "/") and not parsed.query and not parsed.fragment
    ):
        return f"http://{host}:3000"
    if (parsed.scheme != "https" or parsed.username or parsed.password):
        raise ValueError("HTTPS Vercel 배포 URL만 허용합니다.")
    if (not host.endswith(".vercel.app") or host == ".vercel.app"
            or parsed.port not in (None, 443)):
        raise ValueError("주소는 https://프로젝트.vercel.app 형식이어야 합니다.")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("경로·쿼리 없는 서비스 기본 주소를 입력하세요.")
    # Reject malformed subdomain input; accepted hosts are ASCII Vercel hostnames.
    prefix = host[:-len(".vercel.app")]
    if not prefix or len(prefix) > 253 or any(
        not label or len(label) > 63 or label[0] == "-" or label[-1] == "-" or
        any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in label)
        for label in prefix.split(".")
    ):
        raise ValueError("Vercel 도메인 형식이 올바르지 않습니다.")
    return f"https://{host}"


class TransientError(Exception):
    pass


class CheckFailure(Exception):
    """The service response does not meet a grading requirement."""


def require(condition: object, detail: str = "응답 불일치") -> None:
    if not condition:
        raise CheckFailure(detail)


class Checker:
    def __init__(self, base: str, interval: float, allow_local: bool = False):
        self.base = validate_base(base, allow_local=allow_local)
        self.interval = max(0.0, interval)
        self.session = requests.Session()
        self.session.trust_env = False  # Don't inherit hidden proxy credentials/config.
        self.results: dict[str, Result] = {}
        self._last_post: float | None = None
        self.nonce = secrets.token_hex(9)
        self.original = f"https://example.com/?iscu_check={self.nonce}"
        self.code: str | None = None
        self.redirect_response: requests.Response | None = None

    def req(self, method: str, path: str, **kwargs) -> requests.Response:
        # We only issue network requests to the pre-validated base URL.
        if method.upper() == "POST":
            if self._last_post is not None:
                time.sleep(max(0.0, self.interval - (time.monotonic() - self._last_post)))
            self._last_post = time.monotonic()
        try:
            response = self.session.request(
                method, self.base + path,
                allow_redirects=False, timeout=TIMEOUT, **kwargs,
            )
        except requests.RequestException as e:
            raise TransientError(f"네트워크 오류: {type(e).__name__}") from e
        if response.status_code == 429:
            raise TransientError("HTTP 429: Rate Limit 발생. 잠시 뒤 재검사 필요")
        if response.status_code in (502, 503, 504):
            raise TransientError(f"HTTP {response.status_code}: 일시적 장애 가능, 재검사 필요")
        return response

    @staticmethod
    def json_body(response: requests.Response) -> dict:
        try:
            body = response.json()
        except ValueError as e:
            raise CheckFailure("JSON 응답이 아님") from e
        require(isinstance(body, dict), "JSON 최상위 값이 객체가 아님")
        return body

    @classmethod
    def error_code(cls, response: requests.Response):
        error = cls.json_body(response).get("error")
        return error.get("code") if isinstance(error, dict) else None

    def check(self, tid: str, fn) -> None:
        try:
            detail = fn() or "정상"
            status = "PASS"
        except TransientError as e:
            status, detail = "REVIEW", str(e)
        except (CheckFailure, KeyError, ValueError, TypeError) as e:
            status, detail = "FAIL", str(e) or "응답 불일치"
        except Exception as e:
            status, detail = "REVIEW", f"검사기 내부 오류: {type(e).__name__}: {e}"
        self.results[tid] = Result(tid, status, POINTS[tid],
                                   POINTS[tid] if status == "PASS" else 0,
                                   detail[:300])

    def blocked(self, tid: str, prerequisite: str) -> None:
        prior = self.results[prerequisite].status
        status = "REVIEW" if prior == "REVIEW" else "BLOCKED"
        self.results[tid] = Result(tid, status, POINTS[tid], 0,
                                   f"{prerequisite} 미통과로 확인 불가")

    def check_t01(self):
        r = self.req("GET", "/")
        require(r.status_code == 200, f"GET / → {r.status_code} (기대: 200)")

    def check_t02(self):
        r = self.req("POST", "/api/shorten", json={"originalUrl": self.original})
        require(r.status_code == 201, f"POST /api/shorten → {r.status_code} (기대: 201)")
        body = self.json_body(r)
        code = body.get("shortCode")
        require(isinstance(code, str) and len(code) == 6 and code.isalnum(),
                "shortCode가 6자리 영숫자가 아님")
        require(body.get("originalUrl") == self.original, "originalUrl 응답 불일치")
        expected = self.base + "/" + code
        require(body.get("shortUrl") == expected, f"shortUrl 불일치 (기대: {expected})")
        self.code = code

    def check_t03(self):
        for body in ({}, {"originalUrl": ""}):
            r = self.req("POST", "/api/shorten", json=body)
            require(r.status_code == 400, f"빈 입력 → {r.status_code} (기대: 400)")
            require(self.error_code(r) == "MISSING_URL", "error.code가 MISSING_URL이 아님")

    def check_t04(self):
        for url in ("not-a-url", "javascript:alert(1)"):
            r = self.req("POST", "/api/shorten", json={"originalUrl": url})
            require(r.status_code == 400, f"잘못된 URL {url!r} → {r.status_code} (기대: 400)")
            require(self.error_code(r) == "INVALID_URL", "error.code가 INVALID_URL이 아님")

    def check_t05(self):
        require(self.code is not None)
        r = self.req("POST", "/api/shorten", json={"originalUrl": self.original})
        require(r.status_code in (200, 201), f"중복 요청 → {r.status_code} (기대: 200 또는 201)")
        require(self.json_body(r).get("shortCode") == self.code, "중복 URL에 다른 shortCode 반환")

    def check_t06(self):
        require(self.code is not None)
        r = self.req("GET", "/" + self.code)
        require(r.status_code == 307, f"Redirect → {r.status_code} (기대: 307)")
        require(r.headers.get("Location") == self.original, "Location이 원본 URL과 불일치")
        self.redirect_response = r

    def check_t07(self):
        charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        code = "".join(secrets.choice(charset) for _ in range(6))
        if code == self.code:  # astronomically unlikely
            code = "".join(secrets.choice(charset) for _ in range(6))
        r = self.req("GET", "/" + code)
        require(r.status_code == 404, f"없는 shortCode → {r.status_code} (기대: 404)")

    def check_t08(self):
        require(self.redirect_response is not None)
        cc = self.redirect_response.headers.get("Cache-Control", "")
        require("no-store" in [x.strip().lower() for x in cc.split(",")],
                f"Cache-Control: no-store 없음 (실제: {cc!r})")

    def check_t09(self):
        for path in ("/admin", "/api/stats"):
            r = self.req("GET", path)
            require(r.status_code == 401, f"GET {path} (인증 없음) → {r.status_code} (기대: 401)")
        r = self.req("GET", "/admin")
        require("basic" in r.headers.get("WWW-Authenticate", "").lower(),
                "/admin의 WWW-Authenticate: Basic 헤더 없음")

    def check_t10(self):
        for url in (self.base, self.base + "/abc123", self.base.replace("https://", "http://") + "/xyz"):
            r = self.req("POST", "/api/shorten", json={"originalUrl": url})
            require(r.status_code == 400, f"자기 서비스 {url} → {r.status_code} (기대: 400)")

    def check_t11(self):
        other = f"https://other-{self.nonce}.vercel.app/sample"
        r = self.req("POST", "/api/shorten", json={"originalUrl": other})
        require(r.status_code == 201, f"다른 서비스 URL → {r.status_code} (기대: 201)")
        data = self.json_body(r)
        require(data.get("originalUrl") == other, "다른 서비스 originalUrl 응답 불일치")
        require(isinstance(data.get("shortCode"), str) and data.get("shortCode"), "shortCode 없음")

    def run(self) -> dict:
        self.check("T01", self.check_t01)
        self.check("T02", self.check_t02)
        self.check("T03", self.check_t03)
        self.check("T04", self.check_t04)
        if self.results["T02"].status == "PASS":
            self.check("T05", self.check_t05)
            self.check("T06", self.check_t06)
        else:
            self.blocked("T05", "T02")
            self.blocked("T06", "T02")
        self.check("T07", self.check_t07)
        if self.results["T06"].status == "PASS":
            self.check("T08", self.check_t08)
        else:
            self.blocked("T08", "T06")
        self.check("T09", self.check_t09)
        self.check("T10", self.check_t10)
        self.check("T11", self.check_t11)
        results = [asdict(self.results[x]) for x in ORDER]
        return {
            "url": self.base,
            "earned": sum(x["earned"] for x in results),
            "possible": sum(POINTS.values()),
            "provisional": any(x["status"] == "REVIEW" for x in results),
            "tests": results,
        }


def show_report(report: dict, student_id: str | None = None) -> None:
    label = f"{student_id}  " if student_id else ""
    suffix = " [재검사 필요 — 점수 미확정]" if report["provisional"] else ""
    print(f"\n{label}{report['url']}  {report['earned']}/{report['possible']}점{suffix}")
    for r in report["tests"]:
        print(f"  {r['id']} {r['status']:<7} {r['earned']}/{r['points']}점  {r['detail']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="ISCU URL Shortener 공개 기능 검사 (총 20점)")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help="자신의 Vercel Production URL")
    source.add_argument("--csv", help="교수자 일괄 검사: student_id,vercel_url 컬럼 CSV")
    parser.add_argument("--output", default="scores.csv", help="일괄 검사 결과 CSV 경로")
    parser.add_argument("--interval", type=float, default=3.0,
                        help="POST 요청 간 최소 간격(초). 기본 3초, Rate Limit에 맞춰 증가 가능")
    parser.add_argument("--json-out", help="단일 실행 JSON 결과 저장 경로")
    parser.add_argument("--allow-local", action="store_true",
                        help="개발 중 단일 점검에서만 http://localhost:3000 허용")
    args = parser.parse_args()
    if args.interval < 0:
        parser.error("--interval은 0 이상이어야 합니다")
    if args.csv and args.allow_local:
        parser.error("--allow-local은 --url 단일 점검에서만 사용할 수 있습니다")
    if args.url:
        try:
            report = Checker(args.url, args.interval, allow_local=args.allow_local).run()
        except ValueError as e:
            parser.error(str(e))
        show_report(report)
        if args.json_out:
            Path(args.json_out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if all(x["status"] == "PASS" for x in report["tests"]) else 1
    input_path = Path(args.csv)
    output_path = Path(args.output)
    if (input_path.resolve() == output_path.resolve()
            or (output_path.exists() and input_path.samefile(output_path))):
        parser.error("입력 CSV와 결과 CSV는 서로 다른 파일이어야 합니다")
    columns = ["student_id", "vercel_url", "score", "needs_review", *ORDER, "error"]
    count = 0
    with input_path.open(newline="", encoding="utf-8-sig") as source_file, \
            output_path.open("w", newline="", encoding="utf-8-sig") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=columns)
        writer.writeheader()
        output_file.flush()
        for row in csv.DictReader(source_file):
            student_id = (row.get("student_id") or "").strip()
            try:
                report = Checker(row.get("vercel_url") or "", args.interval).run()
                show_report(report, student_id)
                record = {"student_id": student_id, "vercel_url": report["url"],
                          "score": report["earned"],
                          "needs_review": report["provisional"]}
                record.update({r["id"]: r["status"] for r in report["tests"]})
            except ValueError as e:
                record = {"student_id": student_id,
                          "vercel_url": row.get("vercel_url", ""),
                          "score": "", "needs_review": True,
                          "error": str(e)}
                print(f"{student_id}: REVIEW: {e}")
            except Exception as e:
                record = {"student_id": student_id,
                          "vercel_url": row.get("vercel_url", ""),
                          "score": "", "needs_review": True,
                          "error": f"{type(e).__name__}: {e}"}
                print(f"{student_id}: REVIEW: {type(e).__name__}: {e}")
            writer.writerow(record)
            output_file.flush()
            count += 1
    print(f"\n결과 저장: {args.output} ({count}명)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
