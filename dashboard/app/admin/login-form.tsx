'use client';

import { useActionState } from 'react';
import { login } from './actions';

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, {});
  return (
    <form className="gate" action={formAction}>
      <input type="password" name="password" placeholder="Admin password" autoFocus required />
      <button type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Unlock admin'}
      </button>
      {state?.error && <div className="err">{state.error}</div>}
    </form>
  );
}
