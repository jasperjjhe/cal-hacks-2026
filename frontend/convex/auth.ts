import { Anonymous } from '@convex-dev/auth/providers/Anonymous';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({ providers: [Anonymous, Password({ profile(params) {
  if (params.flow === 'signUp') throw new Error('Operator signup is disabled.');
  if (typeof params.email !== 'string') throw new Error('Email is required.');
  return { email: params.email };
} })] });
