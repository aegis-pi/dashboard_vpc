import { UserManager, type User, type UserManagerSettings } from 'oidc-client-ts'

const authority = import.meta.env.VITE_COGNITO_AUTHORITY as string | undefined
const domain = import.meta.env.VITE_COGNITO_DOMAIN as string | undefined
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined
const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI as string | undefined
const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI as string | undefined

// Required env vars — surface misconfig early
function assertEnv(val: string | undefined, name: string): string {
  if (!val) throw new Error(`Missing env var: ${name}`)
  return val
}

let _userManager: UserManager | null = null

export function getUserManager(): UserManager {
  if (_userManager) return _userManager

  const authorityUrl = assertEnv(authority, 'VITE_COGNITO_AUTHORITY')
  const client_id = assertEnv(clientId, 'VITE_COGNITO_CLIENT_ID')
  const redirect_uri = assertEnv(redirectUri, 'VITE_COGNITO_REDIRECT_URI')

  const settings: UserManagerSettings = {
    authority: authorityUrl,
    client_id,
    redirect_uri,
    response_type: 'code',
    scope: 'openid email profile',
    post_logout_redirect_uri: logoutUri ?? redirect_uri,
    automaticSilentRenew: true,
    // Cognito does not support the standard RP-initiated logout;
    // we handle logout via the Cognito hosted UI /logout endpoint separately.
    revokeTokensOnSignout: false,
  }

  _userManager = new UserManager(settings)
  return _userManager
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const mgr = getUserManager()
    const user = await mgr.getUser()
    if (!user || user.expired) return null
    return user.access_token
  } catch {
    return null
  }
}

export async function login(): Promise<void> {
  await getUserManager().signinRedirect()
}

export async function handleCallback(): Promise<User> {
  return getUserManager().signinRedirectCallback()
}

export async function logout(): Promise<void> {
  const mgr = getUserManager()
  // Clear local session
  await mgr.removeUser()
  // Redirect to Cognito hosted UI logout
  const auth = assertEnv(domain, 'VITE_COGNITO_DOMAIN')
  const cid = assertEnv(clientId, 'VITE_COGNITO_CLIENT_ID')
  const post = logoutUri ?? redirectUri ?? window.location.origin
  window.location.href = `${auth}/logout?client_id=${cid}&logout_uri=${encodeURIComponent(post)}`
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    return await getUserManager().getUser()
  } catch {
    return null
  }
}
