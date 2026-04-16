import "dotenv/config";
import { google } from "googleapis";
import * as http from "http";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = "http://localhost:3001";

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/drive"],
  prompt: "select_account consent",
});

console.log("\n🔗 Открой эту ссылку в браузере:\n");
console.log(authUrl);
console.log("\nОжидаю авторизацию...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, "http://localhost:3001");
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("Код не найден");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h2>✅ Авторизация прошла успешно! Можно закрыть вкладку.</h2>");

  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("✅ Refresh token получен!\n");
    console.log("Добавь в .env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (err) {
    console.error("Ошибка получения токена:", err);
  }
});

server.listen(3001);
