// A minimal OpenID Connect provider for the end-to-end tests: the API
// discovers it at http://fake-oidc:9000 and the browser signs in on its
// page at http://localhost:19000. The sign-in form takes any address, and
// "unverified@example.com" comes back with email_verified false.
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createServer } from 'node:http';

const ISSUER = 'http://fake-oidc:9000';
const BROWSER_URL = 'http://localhost:19000';
const CLIENT_ID = 'openathlete-e2e';
const CLIENT_SECRET = 'e2e-oidc-secret';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'e2e',
  alg: 'RS256',
  use: 'sig',
};

/** Authorization codes waiting for the API to redeem them */
const codes = new Map();

const base64url = (value) => Buffer.from(value).toString('base64url');

function idToken(claims) {
  const header = base64url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'e2e' }),
  );
  const payload = base64url(JSON.stringify(claims));
  const signature = sign(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    privateKey,
  );
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function send(response, status, body, type = 'application/json') {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  response.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return new URLSearchParams(body);
}

const escape = (value) =>
  String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

createServer(async (request, response) => {
  const url = new URL(request.url, ISSUER);

  if (url.pathname === '/health') return send(response, 200, { ok: true });

  if (url.pathname === '/.well-known/openid-configuration') {
    return send(response, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${BROWSER_URL}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_basic',
        'client_secret_post',
      ],
    });
  }

  if (url.pathname === '/jwks') return send(response, 200, { keys: [jwk] });

  if (url.pathname === '/authorize' && request.method === 'GET') {
    const params = url.searchParams;
    if (params.get('client_id') !== CLIENT_ID) {
      return send(response, 400, 'Unknown client', 'text/plain');
    }
    const hidden = [...params]
      .map(
        ([k, v]) =>
          `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`,
      )
      .join('');
    return send(
      response,
      200,
      `<!doctype html><title>Fake IdP</title><form method="post" action="/authorize">${hidden}<label>Email <input name="email" type="email"></label><button>Sign in</button></form>`,
      'text/html',
    );
  }

  if (url.pathname === '/authorize' && request.method === 'POST') {
    const form = await readBody(request);
    const code = randomUUID();
    codes.set(code, {
      email: form.get('email'),
      nonce: form.get('nonce'),
      challenge: form.get('code_challenge'),
      redirectUri: form.get('redirect_uri'),
    });
    const target = new URL(form.get('redirect_uri'));
    target.searchParams.set('code', code);
    target.searchParams.set('state', form.get('state'));
    response.writeHead(302, { location: target.href });
    return response.end();
  }

  if (url.pathname === '/token' && request.method === 'POST') {
    const form = await readBody(request);
    // client_secret_basic or client_secret_post, as most providers accept
    const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
    const authenticated =
      request.headers.authorization === basic ||
      (form.get('client_id') === CLIENT_ID &&
        form.get('client_secret') === CLIENT_SECRET);
    if (!authenticated) {
      return send(response, 401, { error: 'invalid_client' });
    }
    const grant = codes.get(form.get('code'));
    codes.delete(form.get('code'));
    const verifier = form.get('code_verifier') ?? '';
    if (
      !grant ||
      grant.redirectUri !== form.get('redirect_uri') ||
      createHash('sha256').update(verifier).digest('base64url') !==
        grant.challenge
    ) {
      return send(response, 400, { error: 'invalid_grant' });
    }
    const now = Math.floor(Date.now() / 1000);
    return send(response, 200, {
      access_token: randomUUID(),
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: grant.email,
        iat: now,
        exp: now + 300,
        nonce: grant.nonce,
        email: grant.email,
        email_verified: grant.email !== 'unverified@example.com',
        given_name: 'Sso',
        family_name: 'Runner',
      }),
    });
  }

  send(response, 404, { error: 'not_found' });
}).listen(9000);
