import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { saveUrl, findUrlByOriginal  } from "../../../lib/db";

export const runtime = "nodejs";

const MAX_URL_LENGTH = 2048;

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/*
 * createShortCode()
 *
 * 원본 URL을 입력받아 SHA-256 해시를 생성하고,
 * 그 값을 이용해 6자리 short code를 만듭니다.
 */
function createShortCode(originalUrl, length = 6) {
  const hex = createHash("sha256")
    .update(originalUrl)
    .digest("hex");

  let code = "";

  for (let i = 0; i < length; i++) {
    const value = parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );

    code += ALPHABET[value % ALPHABET.length];
  }

  return code;
}

/*
 * isOwnServiceUrl()
 *
 * 요청받은 URL이 이 서비스 자신의 주소인지 확인합니다.
 * 자기 자신을 단축하면 리다이렉트가 자기를 다시 가리켜
 * 무한 루프가 발생하므로 사전에 차단합니다.
 *
 * 프록시/로드밸런서 뒤에서는 Host 헤더가 아닌
 * X-Forwarded-Host 헤더를 우선 사용합니다.
 */
function isOwnServiceUrl(request, parsedUrl) {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    .trim();

  const requestHost = (
    forwardedHost ??
    request.headers.get("host") ??
    new URL(request.url).host
  ).toLowerCase();

  return parsedUrl.host === requestHost;
}

/*
 * POST()
 *
 * 클라이언트가 보낸 URL을 검사하고,
 * 문제가 없으면 short URL을 생성하여 반환합니다.
 */
export async function POST(request) {
  try {

    /*
     * 1. 요청 body 읽기
     *
     * 클라이언트가 보낸 JSON에서
     * originalUrl 값을 가져옵니다.
     */
    const body = await request.json().catch(() => null);

    const raw = body?.originalUrl;
    const originalUrl =
      typeof raw === "string" ? raw.trim() : "";


    /*
     * 2. URL이 입력되지 않은 경우
     *
     * 클라이언트가 필요한 값을 보내지 않은 상황입니다.
     *
     * TODO:
     * 적절한 HTTP status code로 수정하세요.
     */
    if (!originalUrl) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_URL",
            message: "Original URL is required.",
          },
        },
        { status: 200 }
      );
    }


    /*
     * 3. URL이 너무 긴 경우
     *
     * 서버가 허용하는 최대 길이보다
     * 긴 URL을 클라이언트가 보낸 상황입니다.
     *
     * TODO:
     * 적절한 HTTP status code로 수정하세요.
     */
    if (originalUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json(
        {
          error: {
            code: "URL_TOO_LONG",
            message:
              `URL must be ${MAX_URL_LENGTH} characters or fewer.`,
          },
        },
        { status: 200 }
      );
    }


    /*
     * 4. URL 형식 검사
     *
     * new URL()을 이용하여
     * 올바른 URL 형식인지 검사합니다.
     */
    let parsedUrl;

    try {
      parsedUrl = new URL(originalUrl);
    } catch {

      /*
       * 올바른 URL 형식이 아닌 경우
       *
       * TODO:
       * 적절한 HTTP status code로 수정하세요.
       */
      return NextResponse.json(
        {
          error: {
            code: "INVALID_URL",
            message:
              "URL must start with http:// or https://.",
          },
        },
        { status: 200 }
      );
    }


    /*
     * 5. 프로토콜 검사
     *
     * http 또는 https만 허용합니다.
     */
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {

      /*
       * 허용하지 않는 URL을 보낸 경우
       *
       * TODO:
       * 적절한 HTTP status code로 수정하세요.
       */
      return NextResponse.json(
        {
          error: {
            code: "INVALID_URL",
            message:
              "URL must start with http:// or https://.",
          },
        },
        { status: 200 }
      );
    }

   /*
     * 자기 서비스 URL 단축 방지
     *
     * 이 서비스 자신의 URL을 단축하면
     * 리다이렉트 순환(무한 루프)이 발생하므로 차단합니다.
     */
    if (isOwnServiceUrl(request, parsedUrl)) {
      return NextResponse.json(
        {
          error: {
            code: "SELF_URL_NOT_ALLOWED",
            message:
              "Cannot shorten this service's own URL.",
          },
        },
        { status: 400 }
      );
    }

    /*
     * 동일 URL 중복 처리
     *
     * 이미 단축했던 URL이면 새 shortCode를 만들지 않고
     * 기존 shortCode를 그대로 반환.
     */
    const existing = await findUrlByOriginal(originalUrl);

    if (existing) {
      const baseUrl = new URL(request.url).origin;

      return NextResponse.json(
        {
          shortCode: existing.shortCode,
          shortUrl: `${baseUrl}/${existing.shortCode}`,
          originalUrl,
        },
        { status: 200 }
      );
    }
    
    /*
    * 동일 URL 중복 처리: 이미 단축한 URL을 다시 요청하면 기존 shortCode 반환
    */

    //Todo: 자기 서비스 URL 단축 방지: 자신의 URL Shortener 주소를 다시 단축하려는 요청 차단

    /*
     * 6. Short URL 생성
     *
     * 모든 검사를 통과했으므로
     * shortCode와 shortUrl을 생성.
     */
    const shortCode = createShortCode(originalUrl);
    await saveUrl(shortCode,originalUrl)

    const baseUrl = new URL(request.url).origin;

    /*
     * URL 생성 성공
     *
     * 적절한 HTTP status code로 수정하세요.
     */
    return NextResponse.json(
      {
        shortCode,
        shortUrl: `${baseUrl}/${shortCode}`,
        originalUrl,
      },
      { status: 200 }
    );

  } catch {

    /*
     * 7. 서버 내부 오류
     *
     * 예상하지 못한 오류가 발생한 경우입니다.
     *
     * TODO:
     * 적절한 HTTP status code로 수정하세요.
     */
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create short URL.",
        },
      },
      { status: 200 }
    );
  }
}