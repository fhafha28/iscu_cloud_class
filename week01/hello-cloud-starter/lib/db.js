import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function saveUrl(shortCode, originalUrl) {
  await sql`
    INSERT INTO urls (short_code, original_url)
    VALUES (${shortCode}, ${originalUrl})
  `;
}

export async function findUrlByShortCode(shortCode) {
  const rows = await sql`
    SELECT original_url
    FROM urls
    WHERE short_code = ${shortCode}
    LIMIT 1
  `;

  return rows[0]?.original_url ?? null;
}

/*
 * findUrlByOriginal()
 *
 * originalUrl로 기존 단축 기록을 조회.
 * 이미 단축된 URL이면 { shortCode, originalUrl }을,
 * 처음 보는 URL이면 null을 반환.
 */
export async function findUrlByOriginal(originalUrl) {
  const rows = await sql`
    SELECT short_code
    FROM urls
    WHERE original_url = ${originalUrl}
    LIMIT 1
  `;

  const shortCode = rows[0]?.short_code ?? null;

  if (!shortCode) return null;

  return { shortCode, originalUrl };
}