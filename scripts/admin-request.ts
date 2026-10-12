export async function adminRequest(path: string, body: Record<string, unknown> = {}): Promise<never> {
  const port = process.env.PORT || 4000;
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    console.error('ADMIN_KEY não definida (configure no .env).');
    process.exit(1);
  }

  let response: Response;
  try {
    response = await fetch(`http://localhost:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    });
  } catch {
    console.error(`Servidor local não respondeu na porta ${port}. Rode "npm run dev" ou "npm start" antes.`);
    process.exit(1);
  }

  const payload: unknown = await response.json().catch(() => null);
  console.log(response.status, JSON.stringify(payload, null, 2));
  process.exit(response.ok ? 0 : 1);
}
