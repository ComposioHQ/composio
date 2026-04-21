import { NextResponse } from 'next/server';
import {
  AUTHORIZATION_ENDPOINT,
  AUTH_ISSUER,
  AUTH_SCOPES,
  END_SESSION_ENDPOINT,
  INTROSPECTION_ENDPOINT,
  JWKS_URI,
  REGISTRATION_ENDPOINT,
  REVOCATION_ENDPOINT,
  TOKEN_ENDPOINT,
  USERINFO_ENDPOINT,
} from '@/lib/agent-discovery';

function getAuthorizationMetadata() {
  return {
    scopes_supported: [...AUTH_SCOPES],
    issuer: AUTH_ISSUER,
    authorization_endpoint: AUTHORIZATION_ENDPOINT,
    token_endpoint: TOKEN_ENDPOINT,
    jwks_uri: JWKS_URI,
    registration_endpoint: REGISTRATION_ENDPOINT,
    introspection_endpoint: INTROSPECTION_ENDPOINT,
    revocation_endpoint: REVOCATION_ENDPOINT,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_basic',
      'client_secret_post',
    ],
    introspection_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
    ],
    revocation_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
    ],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'sid',
      'scope',
      'azp',
      'email',
      'email_verified',
      'name',
      'picture',
      'family_name',
      'given_name',
    ],
    userinfo_endpoint: USERINFO_ENDPOINT,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['EdDSA'],
    end_session_endpoint: END_SESSION_ENDPOINT,
    acr_values_supported: ['urn:mace:incommon:iap:bronze'],
    prompt_values_supported: ['login', 'consent', 'create', 'select_account'],
  };
}

export async function GET() {
  return NextResponse.json(getAuthorizationMetadata(), {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
