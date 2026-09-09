import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const baseUrl = (process.env.ACCOUNT_FLOW_BASE_URL ?? "http://localhost:8080/api").replace(/\/$/, "");
const testId = randomUUID().replace(/-/g, "").slice(0, 12);
const phone = `9${Date.now().toString().slice(-8)}`;
const name = `Conta QA ${testId}`;
const pin = "2468";
const handle = `qa-flow-${testId}`;
const avatarPath = `/objects/qa-tests/${testId}/avatar.png`;

let userId;
let passed = 0;

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSql(sql) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL é obrigatório para limpar os dados temporários.");
  }
  execFileSync("psql", [
    "--no-psqlrc",
    process.env.DATABASE_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-c",
    sql,
  ], { stdio: "pipe" });
}

async function request(path, init = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  console.log(`A verificar fluxos de conta em ${baseUrl}`);

  const invalidLogin = await request("/user-auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "9", pin: "12" }),
  });
  assert(invalidLogin.status === 400, "login rejeita dados inválidos");

  const registered = await request("/user-auth/register", {
    method: "POST",
    body: JSON.stringify({ phone, name, pin }),
  });
  assert(registered.status === 201, "registo cria uma conta temporária");
  assert(typeof registered.body?.token === "string", "registo devolve uma sessão");
  userId = registered.body?.user?.id;
  assert(typeof userId === "string", "registo devolve o identificador do utilizador");

  runSql([
    `UPDATE users SET handle = ${quote(handle)} WHERE id = ${quote(userId)}`,
    `INSERT INTO business_profiles (slug, name, catalog_slug) VALUES (${quote(handle)}, ${quote(name)}, ${quote(handle)})`,
  ].join(";"));

  const me = await request("/user-auth/me", { headers: bearer(registered.body.token) });
  assert(me.status === 200 && me.body?.user?.id === userId, "me aceita a sessão criada");

  const loggedIn = await request("/user-auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, pin }),
  });
  assert(loggedIn.status === 200, "login aceita as credenciais correctas");
  assert(loggedIn.body?.token !== registered.body.token, "login roda o token anterior");

  const oldSession = await request("/user-auth/me", { headers: bearer(registered.body.token) });
  assert(oldSession.status === 401, "token anterior deixa de funcionar");

  const avatarUpdate = await request(`/b/${handle}/profile`, {
    method: "PUT",
    headers: bearer(loggedIn.body.token),
    body: JSON.stringify({ avatarUrl: avatarPath }),
  });
  assert(avatarUpdate.status === 200, "dono consegue guardar a foto de perfil");
  assert(avatarUpdate.body?.profile?.avatarUrl === avatarPath, "resposta devolve o caminho da foto guardada");

  const publicCatalog = await request(`/catalog/by-slug/${handle}`);
  assert(publicCatalog.status === 200, "catálogo público continua acessível");
  assert(publicCatalog.body?.avatarUrl === avatarPath, "catálogo público recebe a foto de perfil");

  const unauthorisedUpload = await request("/storage/uploads/request-url", {
    method: "POST",
    body: JSON.stringify({
      name: "avatar.png",
      size: 128,
      contentType: "image/png",
      businessSlug: handle,
    }),
  });
  assert(unauthorisedUpload.status === 401, "upload sem sessão é rejeitado");

  const uploadRequest = await request("/storage/uploads/request-url", {
    method: "POST",
    headers: bearer(loggedIn.body.token),
    body: JSON.stringify({
      name: "avatar.png",
      size: 128,
      contentType: "image/png",
      businessSlug: handle,
    }),
  });
  assert(uploadRequest.status === 200, "dono consegue pedir URL de upload");
  assert(typeof uploadRequest.body?.uploadURL === "string", "upload devolve uma URL assinada");
  assert(typeof uploadRequest.body?.objectPath === "string", "upload devolve o caminho do objecto");

  const loggedOut = await request("/user-auth/logout", {
    method: "POST",
    headers: bearer(loggedIn.body.token),
  });
  assert(loggedOut.status === 200 && loggedOut.body?.ok === true, "logout confirma a invalidação da sessão");

  const afterLogout = await request("/user-auth/me", { headers: bearer(loggedIn.body.token) });
  assert(afterLogout.status === 401, "sessão terminada não acede ao perfil");

  const duplicate = await request("/user-auth/register", {
    method: "POST",
    body: JSON.stringify({ phone, name, pin }),
  });
  assert(duplicate.status === 409, "registo duplicado é rejeitado");

  console.log(`\n${passed} verificações passaram.`);
}

try {
  await main();
} finally {
  if (userId) {
    try {
      runSql([
        `DELETE FROM business_profiles WHERE slug = ${quote(handle)}`,
        `DELETE FROM users WHERE id = ${quote(userId)}`,
      ].join(";"));
      console.log("Dados temporários removidos.");
    } catch (error) {
      console.error("Não foi possível remover todos os dados temporários:", error);
      process.exitCode = 1;
    }
  }
}