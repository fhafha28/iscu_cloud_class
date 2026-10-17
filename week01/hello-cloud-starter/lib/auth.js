// lib/auth.js
// 인증(Authentication): 요청을 보낸 사용자가 누구인지 확인합니다.

export function authenticate(request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Basic ")) {
    return null;
  }

  try {
    // "Basic " 뒤의 Base64 문자열만 분리합니다.
    const encodedCredentials = authHeader.slice("Basic ".length);

    // "admin:비밀번호" 형태의 문자열로 복호화합니다.
    const decodedCredentials = Buffer.from(
      encodedCredentials,
      "base64"
    ).toString("utf-8");

    const separatorIndex = decodedCredentials.indexOf(":");
    if (separatorIndex === -1) {
      return null;
    }

    const username = decodedCredentials.slice(0, separatorIndex);
    const password = decodedCredentials.slice(separatorIndex + 1);

    // TODO 1. README의 인증 조건 코드를 아래 한 줄에 옮겨 적으세요.
   const isValidAdmin =  username === "admin" &&  password === process.env.ADMIN_PASSWORD;

    if (!isValidAdmin) {
      return null;
    }

    return {
      username,
      role: "admin",
    };
  } catch {
    return null;
  }
}