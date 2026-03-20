import { useState, useCallback } from 'react';
import { getAdminConfig } from '../services/firestore';

export interface AuthState {
  unlocked: boolean;
  show: boolean;
  pw: string;
  setPw: (pw: string) => void;
  submit: () => Promise<void>;
  cancel: () => void;
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
      const data = await getAdminConfig();
      if (data) {
        const storedPw =
          data.password ?? data.Password ?? data.pw ?? '';
        if (pw === storedPw) {
          setUnlocked(true);
          setShow(false);
          setErr('');
          if (pending) {
            pending();
            setPending(null);
          }
        } else {
          setErr('Wrong password');
        }
      } else {
        setErr('Admin config not found in Firebase. Add config/admin doc.');
      }
    } catch (e) {
      console.error('Auth check failed:', e);
      setErr('Cannot reach Firebase — check connection');
    }
    setChecking(false);
  }, [pw, pending]);

  const cancel = useCallback(() => {
    setShow(false);
    setPending(null);
    setPw('');
    setErr('');
  }, []);

  return {
    unlocked,
    req,
    show,
    pw,
    setPw,
    submit,
    cancel,
    err,
    checking,
  };
}
