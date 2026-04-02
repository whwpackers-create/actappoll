import { useState, useCallback } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

// Single admin account — create this user in Firebase Console → Authentication → Users
const ADMIN_EMAIL = 'admin@actappoll.com';

export interface AuthState {
  unlocked: boolean;
  show: boolean;
  pw: string;
  setPw: (pw: string) => void;
  submit: () => Promise<void>;
  cancel: () => void;
  logout: () => void;
  err: string;
  checking: boolean;
  req: (fn: () => void) => void;
}

export function useAuth(): AuthState {
  const [unlocked, setUnlocked] = useState(false);
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);

  const req = useCallback((fn: () => void) => {
    if (unlocked) {
      fn();
      return;
    }
    setPending(() => fn);
    setShow(true);
    setPw('');
    setErr('');
  }, [unlocked]);

  const submit = useCallback(async () => {
    setChecking(true);
    setErr('');
    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pw);
      setUnlocked(true);
      setShow(false);
      if (pending) {
        pending();
        setPending(null);
      }
    } catch (e: any) {
      if (
        e.code === 'auth/wrong-password' ||
        e.code === 'auth/invalid-credential' ||
        e.code === 'auth/invalid-login-credentials'
      ) {
        setErr('Wrong password');
      } else if (e.code === 'auth/too-many-requests') {
        setErr('Too many attempts — try again later');
      } else {
        setErr('Login failed — check connection');
      }
    }
    setChecking(false);
  }, [pw, pending]);

  const cancel = useCallback(() => {
    setShow(false);
    setPending(null);
    setPw('');
    setErr('');
  }, []);

  const logout = useCallback(() => {
    signOut(auth);
    setUnlocked(false);
  }, []);

  return { unlocked, req, show, pw, setPw, submit, cancel, logout, err, checking };
}
