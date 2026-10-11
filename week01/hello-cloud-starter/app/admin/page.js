"use client";

import { useCallback, useEffect, useState } from "react";

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ko-KR");
}

function StatCard({ title, value, detail }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 20,
        background: "white",
      }}
    >
      <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      {detail ? (
        <div style={{ fontSize: 13, color: "#777", marginTop: 8 }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stats", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message ?? "Failed to load stats.");
      }

      setStats(data);
    } catch (err) {
      setError(err.message ?? "Failed to load stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading && !stats) {
    return <main style={{ padding: 32 }}>통계를 불러오는 중입니다...</main>;
  }

  if (error && !stats) {
    return (
      <main style={{ padding: 32 }}>
        <h1>관리자 통계</h1>
        <p>{error}</p>
        <button onClick={loadStats}>다시 시도</button>
      </main>
    );
  }

  const { summary, urls } = stats;
  const topUrl = summary.topUrl;

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "40px 24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>관리자 통계</h1>
          <p style={{ color: "#666", marginBottom: 0 }}>
            URL Shortener의 사용량을 확인합니다.
          </p>
        </div>
        <button onClick={loadStats} disabled={loading}>
          {loading ? "새로고침 중..." : "새로고침"}
        </button>
      </div>

      {error ? (
        <p style={{ color: "crimson" }}>새로고침 실패: {error}</p>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard title="전체 단축 URL 수" value={summary.totalUrls} />
        <StatCard title="전체 클릭 수" value={summary.totalClicks} />
        <StatCard title="한 번 이상 클릭된 URL 수" value={summary.clickedUrls} />
        <StatCard
          title="가장 많이 클릭된 URL"
          value={topUrl ? `/${topUrl.shortCode}` : "-"}
          detail={topUrl ? `${topUrl.clickCount}회 클릭` : "아직 클릭 기록이 없습니다."}
        />
      </section>

      <section>
        <h2>URL별 사용량</h2>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "white",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Short Code</th>
                <th style={thStyle}>Original URL</th>
                <th style={thStyle}>클릭 수</th>
                <th style={thStyle}>생성 시간</th>
                <th style={thStyle}>최근 클릭 시간</th>
              </tr>
            </thead>
            <tbody>
              {urls.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    저장된 URL이 없습니다.
                  </td>
                </tr>
              ) : (
                urls.map((url) => (
                  <tr key={url.shortCode}>
                    <td style={tdStyle}>{url.shortCode}</td>
                    <td style={tdStyle}>
                      <a
                        href={url.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {url.originalUrl}
                      </a>
                    </td>
                    <td style={tdStyle}>{url.clickCount}</td>
                    <td style={tdStyle}>{formatDate(url.createdAt)}</td>
                    <td style={tdStyle}>{formatDate(url.lastClickedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "2px solid #ddd",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "12px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};