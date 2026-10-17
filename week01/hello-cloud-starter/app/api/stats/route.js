import {
  getSummaryStats,
  getTopUrl,
  getUrlStats,
} from "../../../lib/stats";
import { authenticate } from "../../../lib/auth";
import {authorize} from "../../../lib/authorization";

export const dynamic = "force-dynamic";

function authenticationRequiredResponse() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin"',
      "Cache-Control": "no-store",
    },
  });
}

function forbiddenResponse() {
  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request) {
  const user = authenticate(request); // 요청을 보낸 사용자가 누구인지 확인
  if (!user) return authenticationRequiredResponse(); // 인증할 수 없으면 401 반환
  if (!authorize(user, "stats:read")) return forbiddenResponse(); //인증은 되었지만 통계를 읽을 권한이 없으면 403 반환

  try {
    const summary = await getSummaryStats();
    const topUrl = await getTopUrl();
    const urls = await getUrlStats();


    // summary, topUrl, urls를 하나의 JSON 응답으로 반환하세요.
    // README의 목표 JSON 구조를 참고하세요.
    return Response.json(
      {
        summary: {
          totalUrls: summary.totalUrls,
          totalClicks: summary.totalClicks,
          clickedUrls: summary.clickedUrls,
          topUrl: topUrl,
        },
        urls: urls,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );

  } catch (error) {
    console.error("Failed to load stats", error);

    return Response.json(
      {
        error: {
          code: "STATS_ERROR",
          message: "Failed to load stats.",
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}