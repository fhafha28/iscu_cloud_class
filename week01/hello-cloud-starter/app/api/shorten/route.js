import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { saveUrl } from "../../../lib/db";

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
     * 6. Short URL 생성
     *
     * 모든 검사를 통과했으므로
     * shortCode와 shortUrl을 생성합니다.
     */
    const shortCode = createShortCode(originalUrl);
    await saveUrl(shortCode,originalUrl)

    const baseUrl = new URL(request.url).origin;

    /*
     * URL 생성 성공
     *
     * TODO:
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