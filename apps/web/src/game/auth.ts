// Autenticación con Amazon Cognito vía Amplify. Si no hay variables de entorno (desarrollo local),
// el juego funciona en modo invitado contra la API local.
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';

const userPoolId = import.meta.env.VITE_USER_POOL_ID as string | undefined;
const userPoolClientId = import.meta.env.VITE_USER_POOL_CLIENT_ID as string | undefined;

export const authEnabled = Boolean(userPoolId && userPoolClientId);

if (authEnabled) {
  Amplify.configure({
    Auth: { Cognito: { userPoolId: userPoolId!, userPoolClientId: userPoolClientId! } },
  });
}

export async function getIdToken(): Promise<string | null> {
  if (!authEnabled) return null;
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}
